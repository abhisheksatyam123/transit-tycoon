import { buildLandBridge, landBridgeCells } from './landBridges.js';
/**
 * Track commands: buildRail, buildRoad (shared line builder) and demolish.
 */
import { DIRS, OPPOSITE, AXIS_BITS, dirBetween } from './constants.js';
import { isStationPort } from './stationLinks.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { linePath, pruneOneWay } from './network.js';
import { pathOk } from './shapes.js';
import { getTile, inBounds } from './map.js';
import { straightAxis } from './network.js';
import { spend } from './economy.js';
import { ERR, MAX_BRIDGE_LENGTH, MAX_TUNNEL_LENGTH, canAddBits, clearingCost, clearTerrain, coordsOk, checkMoney } from './trackRules.js';
import { removeStationTile, removeDepot, vehicleOnTile } from './cmdStation.js';
import { airportLayout } from './aircraft.js';
import { findTown, findStation } from './state.js';
import { RIVAL_OWNED } from './owner.js';
import { demolishRefusal, applyDemolishPenalty } from './townAuthority.js';
import { removeHQ } from './cmdHQ.js'; // T31: demolishing any HQ tile removes the whole HQ
import { invalidateBlocks } from './signals.js';
import { lockParts } from './cmdCanal.js';

/**
 * Plan player bridges for a line. A bridge is a straight run of water tiles (its deck) between two
 * land heads at equal height; deck tiles keep terrain 'water' and carry the layer bits, the same
 * representation the Moscow scenario bridges use, so rendering and traversal need no special case.
 * @returns {{ok:true,deck:Set<number>}|{ok:false,error:string}}
 */
export function planBridges(map, pts) {
  const tiles = pts.map((p) => map.tiles[p.y * map.width + p.x]);
  const water = tiles.map((t) => t.terrain === 'water');
  if (!water.some(Boolean)) return { ok: true, deck: new Set() };
  const straight = pts.every((p) => p.x === pts[0].x) || pts.every((p) => p.y === pts[0].y);
  if (!straight) return { ok: false, error: ERR.water };
  const deck = new Set();
  const n = pts.length;
  let i = 0;
  while (i < n) {
    if (!water[i]) { i++; continue; }
    let j = i;
    while (j < n && water[j]) j++;
    // both heads must be on the line and on land
    if (i === 0 || j >= n) return { ok: false, error: ERR.water };
    if (j - i + 2 > MAX_BRIDGE_LENGTH) return { ok: false, error: `Bridge too long (max ${MAX_BRIDGE_LENGTH} tiles)` };
    if (tiles[i - 1].height !== tiles[j].height) return { ok: false, error: 'Bridge heads must be at the same height' };
    for (let k = i; k < j; k++) deck.add(pts[k].y * map.width + pts[k].x);
    i = j;
  }
  return { ok: true, deck };
}

/**
 * Plan a player rail tunnel along a straight run of tiles: the first and last tile are the portals
 * (equal height, free or carrying straight track on the axis), the tiles between are the underground
 * run (no water, building, track or road; each strictly higher than the portals). Interior tiles keep
 * their surface terrain.
 * @returns {{ok:true,inner:Set<number>,portals:Set<number>}|{ok:false,error:string}}
 */
export function planTunnel(map, pts, layer = 'rail') {
  const other = layer === 'rail' ? 'road' : 'rail';
  const n = pts.length;
  if (n < 3) return { ok: false, error: 'Tunnel needs at least one tile between the portals' };
  const straight = pts.every((p) => p.x === pts[0].x) || pts.every((p) => p.y === pts[0].y);
  if (!straight) return { ok: false, error: 'Tunnels must be straight' };
  if (n > MAX_TUNNEL_LENGTH) return { ok: false, error: `Tunnel too long (max ${MAX_TUNNEL_LENGTH} tiles)` };
  const axis = pts[0].x === pts[1].x ? 'y' : 'x';
  const tiles = pts.map((p) => map.tiles[p.y * map.width + p.x]);
  const a = tiles[0], b = tiles[n - 1];
  if (a.height !== b.height) return { ok: false, error: 'Tunnel portals must be at the same height' };
  for (const t of [a, b]) {
    if (t.terrain === 'water' || t.building || t[other] || (t[layer] & ~AXIS_BITS[axis])) {
      return { ok: false, error: 'Tunnel portals need a free tile or straight track on the axis' };
    }
  }
  const inner = new Set();
  for (let k = 1; k < n - 1; k++) {
    const t = tiles[k];
    if (t.terrain === 'water') return { ok: false, error: ERR.water };
    if (t.building) return { ok: false, error: 'Tunnel is blocked by a building' };
    if (t.rail || t.road) return { ok: false, error: 'Tunnel is blocked by track or road' };
    if (t.height <= a.height) return { ok: false, error: 'Tunnel must run higher than its portals' };
    inner.add(pts[k].y * map.width + pts[k].x);
  }
  const portals = new Set([pts[0].y * map.width + pts[0].x, pts[n - 1].y * map.width + pts[n - 1].x]);
  return { ok: true, inner, portals };
}

/** A tile belongs to a player-built tunnel (not a Moscow metro tunnel). */
const isPlayerTunnel = (t) => !!(t && t.playerTunnel);

/**
 * All cells of the player tunnel that (x,y) belongs to: both portals and the underground run between
 * them, found by walking along the rail axis from (x,y). Returns [] for anything that is not a player tunnel.
 * @returns {{x:number,y:number}[]}
 */
export function tunnelCells(map, x, y) {
  const t = map.tiles[y * map.width + x];
  if (!isPlayerTunnel(t)) return [];
  const layer = t.rail ? 'rail' : 'road';
  if (!t[layer]) return [];
  const axis = straightAxis(t[layer]);
  if (!axis) return [];
  const cells = [{ x, y }];
  for (const d of (axis === 'x' ? [DIRS[3], DIRS[1]] : [DIRS[0], DIRS[2]])) {
    let cx = x, cy = y;
    for (;;) {
      const nx = cx + d.dx, ny = cy + d.dy;
      if (!inBounds(map, nx, ny)) break;
      const nt = map.tiles[ny * map.width + nx];
      if (!isPlayerTunnel(nt) || !(nt[layer] & OPPOSITE[d.bit])) break;
      cells.push({ x: nx, y: ny });
      if (nt.tunnelPortal) break;
      cx = nx; cy = ny;
    }
  }
  return cells;
}

/**
 * Build a straight player rail tunnel along a drag (portal, underground run, portal). Portals are
 * ordinary surface track tiles flagged tunnelPortal; the run between them gets tunnel=1 (rendered
 * underground, hidden vehicles) and playerTunnel=1. Costs a normal track tile per tile plus tunnelRail
 * per underground tile. The portals' outer neighbours connect to existing track of the same line.
 * @returns {{ok:true,cost:number,tiles:number}|{ok:false,error:string}}
 */
export function buildTunnel(ctx, x0, y0, x1, y1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x0, y0, x1, y1)) return { ok: false, error: ERR.bounds };
  const layer = opts.layer === 'road' ? 'road' : 'rail';
  const pts = linePath(x0, y0, x1, y1);
  const plan = planTunnel(map, pts, layer);
  if (!plan.ok) return plan;
  const n = pts.length;
  const axis = pts[0].x === pts[1].x ? 'y' : 'x';
  const bits = AXIS_BITS[axis];
  let cost = 0, changed = 0;
  const outer = [];
  for (let k = 0; k < n; k++) {
    const p = pts[k];
    const i = p.y * map.width + p.x;
    const t = map.tiles[i];
    const err = canAddBits(t, layer, bits);
    if (err) return { ok: false, error: err };
    if (plan.inner.has(i)) { cost += COSTS[layer] + COSTS.tunnelRail + clearingCost(t); changed++; continue; }
    if ((t[layer] | bits) !== t[layer]) { cost += COSTS[layer] + clearingCost(t); changed++; }
  }
  // the outer neighbours of both portals connect to the existing track beyond them, if any
  for (const [p, out] of [[pts[0], -1], [pts[n - 1], 1]]) {
    const d = axis === 'x' ? DIRS[out < 0 ? 3 : 1] : DIRS[out < 0 ? 0 : 2];
    const nx = p.x + d.dx, ny = p.y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (nt[layer] && !canAddBits(nt, layer, OPPOSITE[d.bit])) outer.push({ x: nx, y: ny, bit: OPPOSITE[d.bit] });
  }
  if (changed === 0) return { ok: false, error: ERR.built };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: n };
  for (const p of pts) {
    const i = p.y * map.width + p.x;
    const t = map.tiles[i];
    clearTerrain(t);
    t[layer] |= bits;
    t.playerTunnel = 1;
    if (plan.inner.has(i)) t.tunnel = 1;
    else { t.tunnelPortal = 1; delete t.tunnel; }
    delete t.signal;
    if (!t.owner) t.owner = 'company';
    pruneOneWay(t);
  }
  for (const o of outer) map.tiles[o.y * map.width + o.x][layer] |= o.bit;
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: n };
}

/**
 * Walk from a land head at (x,y) in direction d over water deck tiles that carry `bit` on `layer`.
 * @returns {{deck:{x:number,y:number}[], head:{x:number,y:number}|null}}
 */
function walkDeck(map, x, y, d, layer) {
  const deck = [];
  let cx = x, cy = y;
  for (;;) {
    cx += d.dx; cy += d.dy;
    if (!inBounds(map, cx, cy)) return { deck, head: null };
    const ct = map.tiles[cy * map.width + cx];
    if (ct.terrain !== 'water') return { deck, head: ct[layer] & OPPOSITE[d.bit] ? { x: cx, y: cy } : null };
    if (!(ct[layer] & d.bit)) return { deck, head: null };
    deck.push({ x: cx, y: cy });
  }
}

/**
 * All cells of the player bridge that (x,y) belongs to on `layer`: deck tiles plus both heads.
 * Returns [] when the tile is not part of a bridge (plain track/road).
 * @returns {{x:number,y:number}[]}
 */
export function bridgeCells(map, x, y, layer) {
  const t = map.tiles[y * map.width + x];
  if (!t[layer]) return [];
  if (t.terrain === 'water') {
    const axis = straightAxis(t[layer]);
    if (!axis) return [];
    const [da, db] = axis === 'x' ? [DIRS[3], DIRS[1]] : [DIRS[0], DIRS[2]];
    const ends = [walkDeck(map, x, y, da, layer), walkDeck(map, x, y, db, layer)];
    // walk from the deck tile outward: the far side of each walk is the deck (or head) beyond
    const cells = [{ x, y }];
    for (const e of ends) { cells.push(...e.deck); if (e.head) cells.push(e.head); }
    return cells;
  }
  for (const d of DIRS) {
    if (!(t[layer] & d.bit)) continue;
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny) || map.tiles[ny * map.width + nx].terrain !== 'water') continue;
    const w = walkDeck(map, x, y, d, layer);
    if (w.head && w.deck.length) return [{ x, y }, ...w.deck, w.head];
  }
  return [];
}

/**
 * Build a straight or L-shaped line (x first, then y) of rail or road.
 * Consecutive tiles get mutual bits; the line's ends auto-connect to existing
 * track of the same layer directly beyond them along the line direction.
 * A single-tile build lays a straight piece along opts.axis ('x' default).
 * @param {object} ctx {state}
 * @param {'rail'|'road'} layer
 * @returns {{ok:true,cost:number,tiles:number}|{ok:false,error:string}}
 */
export function buildLine(ctx, layer, x0, y0, x1, y1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (opts.bridge === true) return buildLandBridge(ctx, x0, y0, x1, y1, { ...opts, layer });
  if (opts.tunnel === true) return buildTunnel(ctx, x0, y0, x1, y1, { ...opts, layer });
  const custom = Array.isArray(opts.path) ? opts.path : null;
  const loop = !!(custom && opts.loop === true);
  if (custom) {
    if (!pathOk(custom, loop)) return { ok: false, error: 'Bad path' };
    for (const p of custom) if (!coordsOk(map, p.x, p.y)) return { ok: false, error: ERR.bounds };
  } else if (!coordsOk(map, x0, y0, x1, y1)) return { ok: false, error: ERR.bounds };
  const pts = custom || linePath(x0, y0, x1, y1);
  const n = pts.length;
  const want = new Map(); // tile index -> bits to add
  const add = (x, y, bits) => {
    const i = y * map.width + x;
    want.set(i, (want.get(i) || 0) | bits);
  };
  let startOut, endOut;
  if (loop) {
    for (let i = 0; i < n; i++) {
      const a = pts[i], p = pts[(i + 1) % n], q = pts[(i + n - 1) % n];
      add(a.x, a.y, dirBetween(a.x, a.y, p.x, p.y) | dirBetween(a.x, a.y, q.x, q.y));
    }
    // a closed ring has no ends to connect
  } else if (n === 1) {
    const axis = opts.axis === 'y' ? 'y' : 'x';
    add(x0, y0, AXIS_BITS[axis]);
    startOut = axis === 'x' ? 8 : 1;
    endOut = axis === 'x' ? 2 : 4;
  } else {
    for (let i = 0; i < n; i++) {
      let bits = 0;
      if (i > 0) bits |= dirBetween(pts[i].x, pts[i].y, pts[i - 1].x, pts[i - 1].y);
      if (i < n - 1) bits |= dirBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      add(pts[i].x, pts[i].y, bits);
    }
    startOut = dirBetween(pts[1].x, pts[1].y, pts[0].x, pts[0].y);
    endOut = dirBetween(pts[n - 2].x, pts[n - 2].y, pts[n - 1].x, pts[n - 1].y);
  }
  // water on the line is only allowed as a bridge deck between two land heads
  const plan = planBridges(map, pts);
  if (!plan.ok) return plan;
  // validate the line itself
  for (const p of pts) {
    const i = p.y * map.width + p.x;
    const err = canAddBits(getTile(map, p.x, p.y), layer, want.get(i), plan.deck.has(i));
    if (err) return { ok: false, error: err };
  }
  // apply the requested highway class to road tiles of this line (upgrade in place / fresh build)
  let hwy = 0;
  if (layer === 'road' && opts.highway === true) {
    for (const p of pts) {
      const i = p.y * map.width + p.x;
      if (map.tiles[i].road) hwy++;
    }
  }
  // optional end connections
  for (const [p, out] of loop ? [] : [[pts[0], startOut], [pts[n - 1], endOut]]) {
    const d = DIRS.find((q) => q.bit === out);
    const nx = p.x + d.dx, ny = p.y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (!nt[layer] && !isStationPort(map, nx, ny, layer, OPPOSITE[out])) continue;
    const pi = p.y * map.width + p.x;
    if (canAddBits(nt, layer, OPPOSITE[out]) || canAddBits(map.tiles[pi], layer, (want.get(pi) || 0) | out)) continue;
    add(p.x, p.y, out);
    add(nx, ny, OPPOSITE[out]);
  }
  let cost = 0, changed = 0;
  const base = layer === 'rail' ? COSTS.rail : layer === 'tram' ? COSTS.tram : COSTS.road;
  const onLine = new Set(pts.map((p) => p.y * map.width + p.x));
  const isHwy = layer === 'road' && opts.highway === true;
  for (const [i, bits] of want) {
    const t = map.tiles[i];
    const fresh = (t[layer] | bits) !== t[layer];
    const upgrade = isHwy && t[layer] !== 0 && t.highway !== 1;
    if (!fresh && !upgrade) continue;
    changed++;
    if (plan.deck.has(i)) { if (fresh) cost += layer === 'rail' ? COSTS.bridgeRail : COSTS.bridgeRoad; continue; }
    if (onLine.has(i)) cost += (fresh ? base : 0) + (isHwy ? base * Math.max(0, 2 - (fresh ? 1 : 0)) : 0) + clearingCost(t);
  }
  if (changed === 0) return { ok: false, error: ERR.built };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: n };
  for (const [i, bits] of want) {
    const t = map.tiles[i];
    if (onLine.has(i) && !plan.deck.has(i)) clearTerrain(t);
    if (layer === 'rail' && (t.rail | bits) !== t.rail) delete t.signal; // new rail bits: signal no longer on straight track
    t[layer] |= bits;
    if (isHwy) t.highway = 1;
    if (!t.owner) t.owner = 'company';
  }
  for (const i of want.keys()) pruneOneWay(map.tiles[i]); // T42: a junction or rail crossing is never one-way
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: n };
}

/**
 * Remove a layer's bits from a tile and the matching bits of plain neighbours.
 */
function stripLayer(map, x, y, layer) {
  const t = map.tiles[y * map.width + x];
  for (const d of DIRS) {
    if (!(t[layer] & d.bit)) continue;
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    const nt = map.tiles[ny * map.width + nx];
    if (nt.building && (nt.building.type === 'station' || nt.building.type === 'depot')) continue;
    nt[layer] &= ~OPPOSITE[d.bit];
    pruneOneWay(nt);
  }
  t[layer] = 0;
  pruneOneWay(t);
}

/**
 * Demolish everything demolishable in the rectangle (houses, track, stations, depots, forest).
 * Industries and water are skipped.
 * @returns {{ok:true,cost:number,tiles:number}|{ok:false,error:string}}
 */
/** Owner id of a station/depot record (null = player, undefined = unknown). Demolishing rival assets is refused. */
function ownerOfStation(state, id) { const st = findStation(state, id); return st ? (st.ownerId ?? null) : undefined; }
function ownerOfDepot(state, id) { const d = state.depots.find((q) => q.id === id); return d ? (d.ownerId ?? null) : undefined; }

export function demolish(ctx, x0, y0, x1, y1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x0, y0, x1, y1)) return { ok: false, error: ERR.bounds };
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const jobs = [];
  let cost = 0, sawIndustry = false;
  // an airport is removed as a whole: expand any touched airport tile to its footprint
  const seenAirport = new Set();
  const cells = [];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) cells.push({ x, y });
  // a player bridge (deck over water + both heads) is removed as a whole
  const seenBridge = new Set();
  for (const c of [...cells]) {
    const bt = map.tiles[c.y * map.width + c.x];
    if (!bt.rail && !bt.road) continue;
    for (const layer of ['rail', 'road']) {
      if (!bt[layer]) continue;
      for (const q of bridgeCells(map, c.x, c.y, layer)) {
        const k = q.y * map.width + q.x;
        if (seenBridge.has(k)) continue;
        seenBridge.add(k);
        if (!cells.some((z) => z.x === q.x && z.y === q.y)) cells.push(q);
      }
    }
  }
  // a player land bridge (deck + both heads) is removed as a whole
  for (const c of [...cells]) {
    for (const q of landBridgeCells(map, c.x, c.y)) {
      if (!cells.some((z) => z.x === q.x && z.y === q.y)) cells.push(q);
    }
  }
  // a player tunnel (both portals and the run between) is removed as a whole
  for (const c of [...cells]) {
    for (const q of tunnelCells(map, c.x, c.y)) {
      if (!cells.some((z) => z.x === q.x && z.y === q.y)) cells.push(q);
    }
  }
  for (const c of [...cells]) {
    const b = map.tiles[c.y * map.width + c.x].building;
    if (!b || b.type !== 'station' || b.kind !== 'airport') continue;
    const ox = c.x - b.dx, oy = c.y - b.dy;
    if (seenAirport.has(`${ox},${oy}`)) continue;
    seenAirport.add(`${ox},${oy}`);
    for (const p of airportLayout()) {
      const q = { x: ox + p.dx, y: oy + p.dy };
      if (!cells.some((z) => z.x === q.x && z.y === q.y)) cells.push(q);
    }
  }
  // a canal lock (its three water tiles) is removed as a whole
  for (const c of [...cells]) {
    const lp = map.tiles[c.y * map.width + c.x].lock ? lockParts(map, c.x, c.y) : null;
    for (const q of lp || []) {
      if (!cells.some((z) => z.x === q.x && z.y === q.y)) cells.push(q);
    }
  }
  for (const c of cells) {
    if (c.x < 0 || c.y < 0 || c.x >= map.width || c.y >= map.height) continue;
    const x = c.x, y = c.y;
    const t = map.tiles[y * map.width + x];
    const b = t.building;
    if (b && b.type === 'station' && b.kind === 'airport') {
      if (b.part === 'hangar' && state.vehicles.some((v) => v.state === 'depot' && v.tx === x && v.ty === y)) {
        return { ok: false, error: 'Depot contains vehicles' };
      }
      if (vehicleOnTile(state, x, y)) return { ok: false, error: ERR.vehicle };
      jobs.push({ x, y, kind: 'station' }); cost += COSTS.demolishStation; continue;
    }
      if (b && b.type === 'industry') { sawIndustry = true; continue; }
      if (b && b.type === 'depot') {
        if (state.vehicles.some((v) => v.state === 'depot' && v.tx === x && v.ty === y)) {
          return { ok: false, error: 'Depot contains vehicles' };
        }
        if (ownerOfDepot(state, t.building.depotId) != null) return { ok: false, error: RIVAL_OWNED };
        jobs.push({ x, y, kind: 'depot' }); cost += COSTS.demolishDepot; continue;
      }
      if ((b && b.type === 'station') || t.rail || t.road) {
        if (vehicleOnTile(state, x, y)) return { ok: false, error: ERR.vehicle };
      }
      if (b && b.type === 'station') {
        if (ownerOfStation(state, b.stationId) != null) return { ok: false, error: RIVAL_OWNED };
        jobs.push({ x, y, kind: 'station' }); cost += COSTS.demolishStation; continue;
      }
      if (b && b.type === 'house') { jobs.push({ x, y, kind: 'house' }); cost += COSTS.demolishHouse; continue; }
      if (b && b.type === 'hq') { jobs.push({ x, y, kind: 'hq' }); continue; }
      if (t.tram && !t.rail) {
        jobs.push({ x, y, kind: 'tram' });
        cost += COSTS.demolishTrack;
        continue;
      }
      if (t.rail || t.road) {
        jobs.push({ x, y, kind: 'track' });
        cost += (t.rail ? COSTS.demolishTrack : 0) + (t.road ? COSTS.demolishTrack : 0) + (t.tram ? COSTS.demolishTrack : 0);
        continue;
      }
      if (t.canal && !b) {
        if (vehicleOnTile(state, x, y)) return { ok: false, error: ERR.vehicle };
        jobs.push({ x, y, kind: 'canal' }); cost += COSTS.demolishCanal; continue;
      }
      if (t.terrain === 'forest' || t.terrain === 'rock') { jobs.push({ x, y, kind: 'clear' }); cost += clearingCost(t); }
  }
  if (jobs.length === 0) return { ok: false, error: sawIndustry ? "Can't demolish an industry" : 'Nothing to demolish' };
  const refused = demolishRefusal(state, jobs);
  if (refused) return { ok: false, error: refused };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: jobs.length };
  applyDemolishPenalty(state, jobs);
  for (const j of jobs) {
    const t = map.tiles[j.y * map.width + j.x];
    if (!t.overBridge) delete t.oneWay; // T42: demolished tiles lose their one-way flag (ground track under a deck keeps it)
    if (j.kind === 'depot') {
      const layer = t.building.kind;
      removeDepot(ctx, t.building.depotId);
      t[layer] = 0;
      delete t.elec;
      t.building = null; t.owner = null;
    } else if (j.kind === 'station') {
      const kind = t.building.kind;
      const hangarDepot = kind === 'airport' && t.building.part === 'hangar' ? t.building.depotId : null;
      removeStationTile(ctx, j.x, j.y);
      if (hangarDepot != null) removeDepot(ctx, hangarDepot);
      t.building = null;
      if (kind === 'rail') { stripLayer(map, j.x, j.y, 'rail'); t.owner = null; delete t.elec; }
    } else if (j.kind === 'hq') {
      removeHQ(state); // T31: no refund
    } else if (j.kind === 'house') {
      const town = findTown(state, t.building.townId);
      if (town) town.houses = town.houses.filter((h) => h.x !== j.x || h.y !== j.y);
      t.building = null; t.owner = null;
    } else if (j.kind === 'tram') {
      stripLayer(map, j.x, j.y, 'tram'); // a road tile keeps its road; only the tram bits go
    } else if (j.kind === 'track') {
      if (t.overBridge) {
        // OpenTTD-style: the deck above ground track goes, the ground track of the other layer stays
        const ol = t.overBridge;
        delete t.overBridge; delete t.bridgeDeck; delete t.playerBridge;
        if (ol === 'rail') { delete t.signal; delete t.elec; }
        stripLayer(map, j.x, j.y, ol);
        continue;
      }
      delete t.signal;
      delete t.elec;
      if (t.playerTunnel) { delete t.playerTunnel; delete t.tunnel; delete t.tunnelPortal; }
      if (t.playerBridge) { delete t.playerBridge; delete t.bridgeDeck; }
      stripLayer(map, j.x, j.y, 'rail');
      stripLayer(map, j.x, j.y, 'road');
      stripLayer(map, j.x, j.y, 'tram');
      t.owner = null;
    } else if (j.kind === 'canal') {
      // canal or lock tile: back to land at its own height (no sea link is left behind)
      delete t.canal; delete t.lock; t.terrain = 'grass';
    } else clearTerrain(t);
  }
  invalidateBlocks(state);
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: jobs.length };
}

export { buildLandBridge, landBridgeCells } from './landBridges.js';
