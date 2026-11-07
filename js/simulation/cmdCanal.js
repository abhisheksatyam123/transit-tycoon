/**
 * Canals and locks (OpenTTD water_cmd.cpp CmdBuildCanal / DoBuildLock, simplified to our height model).
 * - canal: a flat land tile (no track, road or building) becomes water at its own height (tile.canal = 1).
 *   Ships sail it; demolishing it turns the tile back into land.
 * - lock: three water tiles along a straight inclined slope. The middle tile (tile.lock.part 'middle') is the
 *   slope; the lower and upper tiles are flat at the two levels. Every part carries tile.lock = {dir, part}
 *   (dir = the DIRS bit pointing from the lower end to the upper end) and tile.canal = 1.
 * Canal/lock fields are lazy: old saves have none of them.
 */
import { DIRS } from './constants.js';
import { constructionTotal } from './prices.js';
import { COSTS } from '../config/costs.js';
import { spend } from './economy.js';
import { ERR, clearingCost, clearTerrain, coordsOk, checkMoney, objectBlocks } from './trackRules.js';
import { getTile } from './map.js';
import { planAqueduct, buildAqueduct } from './aqueduct.js';

export const CANAL_ERR = {
  notFlat: 'Canals must be built on flat land',
  lockOnWater: 'A lock must be built on land',
  lockSlope: 'A lock needs a straight single-direction slope one level high',
  lockEnds: 'Both lock ends must be flat, one level apart, on land or canal',
  lockOccupied: 'The lock area is already used',
};

/** Corner indices (N,E,S,W) that are low / high for a slope climbing toward DIRS bit `bit`. */
const LOW_HIGH = {
  1: { low: [2, 3], high: [0, 1] },
  2: { low: [0, 3], high: [1, 2] },
  4: { low: [0, 1], high: [2, 3] },
  8: { low: [1, 2], high: [0, 3] },
};

/** True when the tile has track, road, tram or a building (no canal possible). */
function occupied(t) {
  return !!(t.building || t.rail || t.road || t.tram || objectBlocks(t));
}

/** Vector (DIRS entry) for a direction bit. */
function dirOf(bit) {
  return DIRS.find((d) => d.bit === bit) || null;
}

/** Four corner heights (N,E,S,W) of tile (x,y), or null when the corners leave the map. */
function corners(map, x, y) {
  const out = [];
  for (const [cx, cy] of [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]) {
    const t = getTile(map, cx, cy);
    if (!t) return null;
    out.push(t.height);
  }
  return out;
}

/** True when all four corners of the tile are at one level. */
function isFlat(map, x, y) {
  const c = corners(map, x, y);
  return !!c && c.every((v) => v === c[0]);
}

/**
 * The three tiles of a lock, [lower, middle, upper], or null when (x,y) is not a lock part.
 * @returns {{x:number,y:number}[]|null}
 */
export function lockParts(map, x, y) {
  const t = getTile(map, x, y);
  const l = t && t.lock;
  const d = l && dirOf(l.dir);
  if (!d) return null;
  let mx = x, my = y;
  if (l.part === 'lower') { mx = x + d.dx; my = y + d.dy; }
  else if (l.part === 'upper') { mx = x - d.dx; my = y - d.dy; }
  return [{ x: mx - d.dx, y: my - d.dy }, { x: mx, y: my }, { x: mx + d.dx, y: my + d.dy }];
}

/** Validation of a lock whose middle tile is (x,y) climbing toward `bit`. @returns {string|null} */
function lockError(map, x, y, bit) {
  const d = dirOf(bit);
  const M = getTile(map, x, y);
  if (!M) return ERR.bounds;
  const A = getTile(map, x - d.dx, y - d.dy), B = getTile(map, x + d.dx, y + d.dy);
  if (!A || !B) return ERR.bounds;
  if (M.lock || A.lock || B.lock) return CANAL_ERR.lockOccupied;
  if (M.terrain === 'water') return CANAL_ERR.lockOnWater;
  if (occupied(M)) return ERR[M.building && M.building.type] || ERR.track;
  const c = corners(map, x, y);
  if (!c) return ERR.bounds;
  const lh = LOW_HIGH[bit];
  const lo = lh.low.map((i) => c[i]), hi = lh.high.map((i) => c[i]);
  const L = lo[0], H = hi[0];
  if (!lo.every((v) => v === L) || !hi.every((v) => v === H) || H - L !== 1) return CANAL_ERR.lockSlope;
  for (const e of [A, B]) {
    if (occupied(e) || e.lock) return CANAL_ERR.lockEnds;
    if (e.terrain === 'water' && !e.canal) return CANAL_ERR.lockEnds;
  }
  const ax = A.height, bx = B.height;
  if (!isFlat(map, x - d.dx, y - d.dy) || ax !== L) return CANAL_ERR.lockEnds;
  if (!isFlat(map, x + d.dx, y + d.dy) || bx !== H) return CANAL_ERR.lockEnds;
  return null;
}

/** Lock direction bit for a slope at (x,y): the one valid climb direction, or null. */
function findLockBit(map, x, y, want) {
  const bits = want ? [want] : [1, 2, 4, 8];
  for (const b of bits) if (!lockError(map, x, y, b)) return b;
  return null;
}

/** Tiles of a straight-then-straight line from (x0,y0) to (x1,y1), like the drag tools. */
function linePath(x0, y0, x1, y1) {
  const out = [];
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  let x = x0;
  out.push({ x, y: y0 });
  while (x !== x1) { x += sx; out.push({ x, y: y0 }); }
  let y = y0;
  while (y !== y1) { y += sy; out.push({ x: x1, y }); }
  return out;
}

/** Bounding area of a list of tiles (for the heights refresh). */
function areaOf(tiles) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of tiles) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Build canals along the line (x0,y0)-(x1,y1). Water tiles already on the line are skipped.
 * @returns {{ok:true,cost:number,tiles:number,area:object}|{ok:false,error:string}}
 */
export function buildCanal(ctx, x0, y0, x1, y1, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x0, y0, x1, y1)) return { ok: false, error: ERR.bounds };
  // sloped ends: the drag becomes an aqueduct over the valley (aqueduct.js)
  const aq = planAqueduct(map, x0, y0, x1, y1);
  if (aq) return aq.ok ? buildAqueduct(ctx, aq, opts) : aq;
  const build = [];
  let cost = 0;
  for (const p of linePath(x0, y0, x1, y1)) {
    const t = map.tiles[p.y * map.width + p.x];
    if (t.terrain === 'water') continue;
    if (occupied(t)) return { ok: false, error: ERR[t.building && t.building.type] || ERR.track };
    if (!isFlat(map, p.x, p.y)) return { ok: false, error: CANAL_ERR.notFlat };
    build.push(p);
    cost += COSTS.canal + clearingCost(t);
  }
  if (!build.length) return { ok: false, error: 'Already water' };
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, tiles: build.length };
  for (const p of build) {
    const t = map.tiles[p.y * map.width + p.x];
    clearTerrain(t);
    t.terrain = 'water';
    t.canal = 1;
  }
  spend(state.company, 'construction', state.editor ? 0 : cost);
  return { ok: true, cost, tiles: build.length, area: areaOf(build) };
}

/**
 * Build a lock with middle tile (x,y) on a straight inclined slope. The climb direction is found
 * automatically (opts.dir may pin it, as a DIRS bit).
 * @returns {{ok:true,cost:number,dir:number,area:object}|{ok:false,error:string}}
 */
export function buildLock(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const map = state.map;
  if (!coordsOk(map, x, y)) return { ok: false, error: ERR.bounds };
  const bit = findLockBit(map, x, y, [1, 2, 4, 8].includes(opts.dir) ? opts.dir : 0);
  if (!bit) return { ok: false, error: lockError(map, x, y, [1, 2, 4, 8].includes(opts.dir) ? opts.dir : 1) || CANAL_ERR.lockSlope };
  const d = dirOf(bit);
  const parts = [
    { x: x - d.dx, y: y - d.dy, part: 'lower' },
    { x, y, part: 'middle' },
    { x: x + d.dx, y: y + d.dy, part: 'upper' },
  ];
  let cost = 0;
  for (const p of parts) cost += COSTS.lock + clearingCost(map.tiles[p.y * map.width + p.x]);
  cost = constructionTotal(state, cost);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, dir: bit };
  for (const p of parts) {
    const t = map.tiles[p.y * map.width + p.x];
    clearTerrain(t);
    t.terrain = 'water';
    t.canal = 1;
    t.lock = { dir: bit, part: p.part };
  }
  spend(state.company, 'construction', state.editor ? 0 : cost);
  return { ok: true, cost, dir: bit, area: areaOf(parts) };
}

/** Demolition helper used by cmdTrack.demolish: the canal/lock tiles to remove for a touched cell. */
export function canalCells(map, x, y) {
  const t = getTile(map, x, y);
  if (t && t.lock) return lockParts(map, x, y);
  return null;
}

export { lockError as lockValidationError };
