/**
 * Station, road stop and depot commands plus their removal helpers.
 */
import { DIRS, OPPOSITE, AXIS_BITS } from './constants.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { getTile, inBounds } from './map.js';
import { spend } from './economy.js';
import { companyById, stampOwner, ownerMismatch, RIVAL_OWNED } from './owner.js';
import { straightAxis } from './network.js';
import { ERR, clearingCost, clearTerrain, coordsOk, checkMoney, canAddBits, objectError } from './trackRules.js';
import { createStation, adjacentStations, spreadOk, refreshKinds, recomputeAcceptance } from './stations.js';
import { DEFAULT_STYLE, styleAvailable, styleById } from '../config/stationTypes.js';
import { allocId, findStation } from './state.js';
import { stationTileBits } from './stationLinks.js';
import { refusalAt } from './townAuthority.js';
import { invalidateBlocks } from './signals.js';

/**
 * Distant join (OpenTTD station picker): the station the player chose with Ctrl+click via
 * opts.joinStationId. Only player builds are checked; the chosen station must exist and stay within the spread limit. Returns null when no join was requested,
 * the station record when valid, or {error} when refused.
 */
export function joinTarget(state, opts, kind, tiles) {
  if (!opts || opts.joinStationId == null) return null;
  const st = findStation(state, opts.joinStationId);
  if (!st) return { error: 'No such station to join' };
  // OpenTTD: any facility may join any own station within spread (a bus stop can join a rail station)
  if (!spreadOk(st, tiles)) return { error: 'Station too spread out' };
  return st;
}

/**
 * True when a non-depot vehicle occupies (x,y) (head, next tile or trailing tiles).
 */
export function vehicleOnTile(state, x, y) {
  for (const v of state.vehicles) {
    if (v.state === 'depot' || (v.kind === 'aircraft' && v.alt > 0)) continue;
    const n = v.kind === 'train' ? Math.ceil(v.wagons * 0.5) + 1 : 1;
    for (let i = 0; i < Math.min(n, v.history.length); i++) {
      if (v.history[i].x === x && v.history[i].y === y) return true;
    }
    const nx = v.path[v.pathIndex + 1];
    if (nx && nx.x === x && nx.y === y) return true;
  }
  return false;
}

/**
 * Build a rail station of `length` tiles along `axis` starting at (x,y) (extending +x or +y),
 * as `opts.platforms` parallel platforms (default 1, stacked on the perpendicular axis) in one
 * command. Tiles may be empty land or straight rail along the axis. Adjacent own station tiles
 * merge, unless the merged station would exceed STATION_SPREAD (refused).
 * `opts.style` picks a station style (config/stationTypes.js) available in the current year.
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildRailStation(ctx, x, y, axis, length = 1, opts = {}) {
  const { state } = ctx;
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const map = state.map;
  if (axis !== 'x' && axis !== 'y') return { ok: false, error: 'Invalid axis' };
  length = Math.max(1, Math.min(10, Math.floor(length) || 1));
  const platforms = Math.max(1, Math.min(6, Math.floor(opts.platforms) || 1));
  const style = opts.style && opts.style !== DEFAULT_STYLE ? opts.style : null;
  if (style && !styleAvailable('rail', style, state.date.year)) return { ok: false, error: 'Station style not available' };
  const factor = style ? styleById('rail', style).costFactor : 1;
  const tiles = [];
  for (let p = 0; p < platforms; p++) {
    for (let i = 0; i < length; i++) {
      tiles.push(axis === 'x' ? { x: x + i, y: y + p } : { x: x + p, y: y + i });
    }
  }
  const last = tiles[tiles.length - 1];
  if (!coordsOk(map, x, y, last.x, last.y)) return { ok: false, error: ERR.bounds };
  const refused = refusalAt(state, x, y);
  if (refused) return { ok: false, error: refused };
  let cost = 0;
  for (const p of tiles) {
    const t = getTile(map, p.x, p.y);
    if (t.terrain === 'water') return { ok: false, error: ERR.water };
    if (objectError(t)) return { ok: false, error: objectError(t) };
    if (t.building) return { ok: false, error: ERR[t.building.type] || 'Tile occupied' };
    if (t.road) return { ok: false, error: ERR.track };
    if (t.rail && straightAxis(t.rail) !== axis) return { ok: false, error: ERR.track };
    cost += COSTS.railStation + clearingCost(t);
  }
  cost = constructionTotal(state, factor === 1 ? cost : Math.round(cost * factor));
  const money = checkMoney(state, cost, companyById(state, opts.owner ?? null));
  if (money) return money;
  // Merge rule unchanged: join the first adjacent station. Player builds (opts.player) are refused
  // when that merge would exceed STATION_SPREAD; scenario code is not limited.
  const join = joinTarget(state, opts, 'rail', tiles);
  if (join && join.error) return { ok: false, error: join.error };
  if (join && ownerMismatch(join, opts)) return { ok: false, error: RIVAL_OWNED };
  // a station of another company next door is not joined (OpenTTD builds a separate station)
  const existing = join || adjacentStations(state, tiles).find((st) => !ownerMismatch(st, opts)) || null;
  if (opts.player && existing && !spreadOk(existing, tiles)) return { ok: false, error: 'Station too spread out' };
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null };
  const st = existing || stampOwner(state, createStation(state, x, y), opts.owner ?? null);
  invalidateBlocks(ctx.state);
  tiles.forEach((p, i) => {
    const t = map.tiles[p.y * map.width + p.x];
    clearTerrain(t);
    const idx = i % length;
    t.rail = (t.rail | stationTileBits(axis, idx, length)) & 0xf;
    delete t.signal; // a signal cannot stay on a station tile
    t.building = { type: 'station', stationId: st.id, kind: 'rail', axis };
    if (style) t.building.style = style;
    t.owner = 'company';
    const rec = { x: p.x, y: p.y, kind: 'rail' };
    if (style) rec.style = style;
    st.tiles.push(rec);
  });
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(companyById(state, opts.owner ?? null), 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/**
 * Build a drive-through bus/truck stop on a straight road tile (keeps road bits) or on
 * empty land (lays road along opts.axis, default 'x', linking to roads beyond each end).
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildRoadStop(ctx, x, y, kind, opts = {}) {
  const { state } = ctx;
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const map = state.map;
  if (kind !== 'bus' && kind !== 'truck' && kind !== 'tram') return { ok: false, error: 'Invalid stop kind' };
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const refused = refusalAt(state, x, y);
  if (refused) return { ok: false, error: refused };
  const t = getTile(map, x, y);
  if (t.terrain === 'water') return { ok: false, error: ERR.water };
  if (objectError(t)) return { ok: false, error: objectError(t) };
  if (t.building) return { ok: false, error: ERR[t.building.type] || 'Tile occupied' };
  if (t.rail) return { ok: false, error: ERR.track };
  let axis;
  if (kind === 'tram') {
    // tram stop: straight tram track only (trams stop there; buses do not); no road bits are added
    if (!t.tram) return { ok: false, error: 'Tram stops need tram track' };
    axis = straightAxis(t.tram);
    if (!axis) return { ok: false, error: 'Tram stops need a straight tram track' };
    if (t.road && (t.road & ~AXIS_BITS[axis])) return { ok: false, error: 'Tram stops need a straight tram track' };
  } else if (t.road) {
    axis = straightAxis(t.road);
    if (!axis) return { ok: false, error: 'Road stops need a straight road' };
  } else axis = opts.axis === 'y' ? 'y' : 'x';
  const style = opts.style && opts.style !== DEFAULT_STYLE ? opts.style : null;
  if (style && !styleAvailable(kind, style, state.date.year)) return { ok: false, error: 'Station style not available' };
  let cost = COSTS.roadStop + clearingCost(t);
  if (style) cost = Math.round(cost * styleById(kind, style).costFactor);
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost, companyById(state, opts.owner ?? null));
  if (money) return money;
  const join = joinTarget(state, opts, kind, [{ x, y }]);
  if (join && join.error) return { ok: false, error: join.error };
  if (join && ownerMismatch(join, opts)) return { ok: false, error: RIVAL_OWNED };
  // a station of another company next door is not joined (OpenTTD builds a separate station)
  const existing = join || adjacentStations(state, [{ x, y }]).find((st) => !ownerMismatch(st, opts)) || null;
  if (opts.player && existing && !spreadOk(existing, [{ x, y }])) return { ok: false, error: 'Station too spread out' };
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null };
  const st = existing || stampOwner(state, createStation(state, x, y), opts.owner ?? null);
  clearTerrain(t);
  if (!t.road && kind !== 'tram') {
    t.road = AXIS_BITS[axis];
    for (const d of DIRS) {
      if (!(t.road & d.bit)) continue;
      const nt = getTile(map, x + d.dx, y + d.dy);
      if (nt && nt.road && !canAddBits(nt, 'road', OPPOSITE[d.bit])) nt.road |= OPPOSITE[d.bit];
    }
  }
  t.building = { type: 'station', stationId: st.id, kind, axis };
  if (style) t.building.style = style;
  if (!t.owner) t.owner = 'company';
  st.tiles.push(style ? { x, y, kind, style } : { x, y, kind });
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(companyById(state, opts.owner ?? null), 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

export const STOP_SIDE_ERR = 'Depot exit would face the side of a station: place it beside plain track or road';

/** True when the tile next to (x,y) in direction `dir` is a stop that a depot exit cannot join from its side. */
export function exitFacesStopSide(map, x, y, kind, dir) {
  const d = DIRS.find((q) => q.bit === dir);
  if (!d || !inBounds(map, x + d.dx, y + d.dy)) return false;
  const nt = map.tiles[(y + d.dy) * map.width + x + d.dx];
  const b = nt && nt.building;
  if (!b || b.type !== 'station' || b.axis == null) return false;
  return !!(OPPOSITE[dir] & ~AXIS_BITS[b.axis]); // a stop only takes links along its own axis
}

/**
 * Build a rail or road depot on empty land with its exit facing `dir`.
 * The depot tile gets the `dir` bit; the adjacent tile gets the opposite bit if it
 * already carries track/road of that kind (and the bit is legal there).
 * @returns {{ok:true,cost:number,depotId:number}|{ok:false,error:string}}
 */
export function buildDepot(ctx, x, y, kind, dir, opts = {}) {
  const { state } = ctx;
  if (opts.owner != null && !companyById(state, opts.owner)) return { ok: false, error: 'Unknown company' };
  const map = state.map;
  if (kind !== 'rail' && kind !== 'road') return { ok: false, error: 'Invalid depot kind' };
  if (![1, 2, 4, 8].includes(dir)) return { ok: false, error: 'Invalid direction' };
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const t = getTile(map, x, y);
  if (t.terrain === 'water') return { ok: false, error: ERR.water };
  if (objectError(t)) return { ok: false, error: objectError(t) };
  if (t.building) return { ok: false, error: ERR[t.building.type] || 'Tile occupied' };
  if (t.rail || t.road) return { ok: false, error: ERR.track };
  // OpenTTD: a drive-through stop cannot be entered from its side, so an exit facing one is unusable
  if (exitFacesStopSide(map, x, y, kind, dir)) return { ok: false, error: STOP_SIDE_ERR };
  let cost = (kind === 'rail' ? COSTS.depotRail : COSTS.depotRoad) + clearingCost(t);
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost, companyById(state, opts.owner ?? null));
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, depotId: null };
  const id = allocId(state);
  clearTerrain(t);
  t.building = { type: 'depot', depotId: id, kind, dir };
  t.owner = 'company';
  t[kind] = dir;
  const d = DIRS.find((q) => q.bit === dir);
  if (inBounds(map, x + d.dx, y + d.dy)) {
    const nt = map.tiles[(y + d.dy) * map.width + x + d.dx];
    if (nt[kind] && !canAddBits(nt, kind, OPPOSITE[dir])) nt[kind] |= OPPOSITE[dir];
    if (kind === 'road' && nt.tram) {
      t.tram = dir; // a road depot on tram track: trams enter/leave through its exit
      nt.tram |= OPPOSITE[dir]; // the tram track next to it must open toward the depot too (else trams are lost)
    }
  }
  state.depots.push(stampOwner(state, { id, kind, x, y, dir }, opts.owner ?? null));
  spend(companyById(state, opts.owner ?? null), 'construction', cost);
  return { ok: true, cost, depotId: id };
}

/**
 * Remove a station tile from its station record (tile itself is cleared by caller).
 * Deletes the station when it has no tiles left and drops orders to it.
 */
export function removeStationTile(ctx, x, y) {
  const { state } = ctx;
  const t = getTile(state.map, x, y);
  const st = t && t.building && findStation(state, t.building.stationId);
  if (!st) return;
  st.tiles = st.tiles.filter((p) => p.x !== x || p.y !== y);
  refreshKinds(st);
  if (st.tiles.length === 0) {
    state.stations = state.stations.filter((s) => s !== st);
    for (const v of state.vehicles) {
      const before = v.orders.length;
      v.orders = v.orders.filter((o) => o.stationId !== st.id);
      if (v.orders.length !== before) v.orderIndex = v.orders.length ? v.orderIndex % v.orders.length : 0;
    }
  } else {
    if (st.x === x && st.y === y) { st.x = st.tiles[0].x; st.y = st.tiles[0].y; }
    recomputeAcceptance(state, st);
  }
}

/** Remove a depot record. */
export function removeDepot(ctx, depotId) {
  const { state } = ctx;
  state.depots = state.depots.filter((d) => d.id !== depotId);
  for (const v of state.vehicles) {
    if (v.goingToDepot === depotId) v.goingToDepot = null;
  }
}
