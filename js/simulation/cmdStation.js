/**
 * Station, road stop and depot commands plus their removal helpers.
 */
import { DIRS, OPPOSITE, AXIS_BITS } from './constants.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { getTile, inBounds } from './map.js';
import { spend } from './economy.js';
import { straightAxis } from './network.js';
import { ERR, clearingCost, clearTerrain, coordsOk, checkMoney, canAddBits } from './trackRules.js';
import { createStation, adjacentStation, refreshKinds, recomputeAcceptance } from './stations.js';
import { allocId, findStation } from './state.js';
import { stationTileBits } from './stationLinks.js';
import { refusalAt } from './townAuthority.js';

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
 * Build a rail station of `length` tiles along `axis` starting at (x,y) (extending +x or +y).
 * Tiles may be empty land or straight rail along the axis. Adjacent own station tiles merge.
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildRailStation(ctx, x, y, axis, length = 1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (axis !== 'x' && axis !== 'y') return { ok: false, error: 'Invalid axis' };
  length = Math.max(1, Math.min(10, Math.floor(length) || 1));
  const tiles = [];
  for (let i = 0; i < length; i++) tiles.push(axis === 'x' ? { x: x + i, y } : { x, y: y + i });
  const last = tiles[tiles.length - 1];
  if (!coordsOk(map, x, y, last.x, last.y)) return { ok: false, error: ERR.bounds };
  const refused = refusalAt(state, x, y);
  if (refused) return { ok: false, error: refused };
  let cost = 0;
  for (const p of tiles) {
    const t = getTile(map, p.x, p.y);
    if (t.terrain === 'water') return { ok: false, error: ERR.water };
    if (t.building) return { ok: false, error: ERR[t.building.type] || 'Tile occupied' };
    if (t.road) return { ok: false, error: ERR.track };
    if (t.rail && straightAxis(t.rail) !== axis) return { ok: false, error: ERR.track };
    cost += COSTS.railStation + clearingCost(t);
  }
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  const existing = adjacentStation(state, tiles);
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null };
  const st = existing || createStation(state, x, y);
  tiles.forEach((p, i) => {
    const t = map.tiles[p.y * map.width + p.x];
    clearTerrain(t);
    t.rail = (t.rail | stationTileBits(axis, i, tiles.length)) & 0xf;
    t.building = { type: 'station', stationId: st.id, kind: 'rail', axis };
    t.owner = 'company';
    st.tiles.push({ x: p.x, y: p.y, kind: 'rail' });
  });
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/**
 * Build a drive-through bus/truck stop on a straight road tile (keeps road bits) or on
 * empty land (lays road along opts.axis, default 'x', linking to roads beyond each end).
 * @returns {{ok:true,cost:number,stationId:number}|{ok:false,error:string}}
 */
export function buildRoadStop(ctx, x, y, kind, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (kind !== 'bus' && kind !== 'truck') return { ok: false, error: 'Invalid stop kind' };
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const refused = refusalAt(state, x, y);
  if (refused) return { ok: false, error: refused };
  const t = getTile(map, x, y);
  if (t.terrain === 'water') return { ok: false, error: ERR.water };
  if (t.building) return { ok: false, error: ERR[t.building.type] || 'Tile occupied' };
  if (t.rail) return { ok: false, error: ERR.track };
  let axis;
  if (t.road) {
    axis = straightAxis(t.road);
    if (!axis) return { ok: false, error: 'Road stops need a straight road' };
  } else axis = opts.axis === 'y' ? 'y' : 'x';
  let cost = COSTS.roadStop + clearingCost(t);
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  const existing = adjacentStation(state, [{ x, y }]);
  if (opts.dryRun) return { ok: true, cost, stationId: existing ? existing.id : null };
  const st = existing || createStation(state, x, y);
  clearTerrain(t);
  if (!t.road) {
    t.road = AXIS_BITS[axis];
    for (const d of DIRS) {
      if (!(t.road & d.bit)) continue;
      const nt = getTile(map, x + d.dx, y + d.dy);
      if (nt && nt.road && !canAddBits(nt, 'road', OPPOSITE[d.bit])) nt.road |= OPPOSITE[d.bit];
    }
  }
  t.building = { type: 'station', stationId: st.id, kind, axis };
  if (!t.owner) t.owner = 'company';
  st.tiles.push({ x, y, kind });
  refreshKinds(st);
  recomputeAcceptance(state, st);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, stationId: st.id };
}

/**
 * Build a rail or road depot on empty land with its exit facing `dir`.
 * The depot tile gets the `dir` bit; the adjacent tile gets the opposite bit if it
 * already carries track/road of that kind (and the bit is legal there).
 * @returns {{ok:true,cost:number,depotId:number}|{ok:false,error:string}}
 */
export function buildDepot(ctx, x, y, kind, dir, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (kind !== 'rail' && kind !== 'road') return { ok: false, error: 'Invalid depot kind' };
  if (![1, 2, 4, 8].includes(dir)) return { ok: false, error: 'Invalid direction' };
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const t = getTile(map, x, y);
  if (t.terrain === 'water') return { ok: false, error: ERR.water };
  if (t.building) return { ok: false, error: ERR[t.building.type] || 'Tile occupied' };
  if (t.rail || t.road) return { ok: false, error: ERR.track };
  let cost = (kind === 'rail' ? COSTS.depotRail : COSTS.depotRoad) + clearingCost(t);
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
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
  }
  state.depots.push({ id, kind, x, y, dir });
  spend(state.company, 'construction', cost);
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
