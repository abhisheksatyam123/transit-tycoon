/**
 * Track commands: buildRail, buildRoad (shared line builder) and demolish.
 */
import { DIRS, OPPOSITE, AXIS_BITS, dirBetween } from './constants.js';
import { isStationPort } from './stationLinks.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { linePath } from './network.js';
import { pathOk } from './shapes.js';
import { getTile, inBounds } from './map.js';
import { straightAxis } from './network.js';
import { spend } from './economy.js';
import { ERR, MAX_BRIDGE_LENGTH, canAddBits, clearingCost, clearTerrain, coordsOk, checkMoney } from './trackRules.js';
import { removeStationTile, removeDepot, vehicleOnTile } from './cmdStation.js';
import { airportLayout } from './aircraft.js';
import { findTown } from './state.js';

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
  const base = layer === 'rail' ? COSTS.rail : COSTS.road;
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
    t[layer] |= bits;
    if (isHwy) t.highway = 1;
    if (!t.owner) t.owner = 'company';
  }
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
  }
  t[layer] = 0;
}

/**
 * Demolish everything demolishable in the rectangle (houses, track, stations, depots, forest).
 * Industries and water are skipped.
 * @returns {{ok:true,cost:number,tiles:number}|{ok:false,error:string}}
 */
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
        jobs.push({ x, y, kind: 'depot' }); cost += COSTS.demolishDepot; continue;
      }
      if ((b && b.type === 'station') || t.rail || t.road) {
        if (vehicleOnTile(state, x, y)) return { ok: false, error: ERR.vehicle };
      }
      if (b && b.type === 'station') { jobs.push({ x, y, kind: 'station' }); cost += COSTS.demolishStation; continue; }
      if (b && b.type === 'house') { jobs.push({ x, y, kind: 'house' }); cost += COSTS.demolishHouse; continue; }
      if (t.rail || t.road) {
        jobs.push({ x, y, kind: 'track' });
        cost += (t.rail ? COSTS.demolishTrack : 0) + (t.road ? COSTS.demolishTrack : 0);
        continue;
      }
      if (t.terrain === 'forest' || t.terrain === 'rock') { jobs.push({ x, y, kind: 'clear' }); cost += clearingCost(t); }
  }
  if (jobs.length === 0) return { ok: false, error: sawIndustry ? "Can't demolish an industry" : 'Nothing to demolish' };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: jobs.length };
  for (const j of jobs) {
    const t = map.tiles[j.y * map.width + j.x];
    if (j.kind === 'depot') {
      const layer = t.building.kind;
      removeDepot(ctx, t.building.depotId);
      t[layer] = 0;
      t.building = null; t.owner = null;
    } else if (j.kind === 'station') {
      const kind = t.building.kind;
      const hangarDepot = kind === 'airport' && t.building.part === 'hangar' ? t.building.depotId : null;
      removeStationTile(ctx, j.x, j.y);
      if (hangarDepot != null) removeDepot(ctx, hangarDepot);
      t.building = null;
      if (kind === 'rail') { stripLayer(map, j.x, j.y, 'rail'); t.owner = null; }
    } else if (j.kind === 'house') {
      const town = findTown(state, t.building.townId);
      if (town) town.houses = town.houses.filter((h) => h.x !== j.x || h.y !== j.y);
      t.building = null; t.owner = null;
    } else if (j.kind === 'track') {
      stripLayer(map, j.x, j.y, 'rail');
      stripLayer(map, j.x, j.y, 'road');
      t.owner = null;
    } else clearTerrain(t);
  }
  spend(state.company, 'construction', cost);
  return { ok: true, cost, tiles: jobs.length };
}
