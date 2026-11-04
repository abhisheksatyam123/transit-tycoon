/**
 * Octilinear rasterisation: float tile polylines -> 4-connected integer tile chains made of
 * straight axis runs plus perfect 1:1 diagonal staircases (x-step, y-step, x-step, ...).
 */
import { WIDTH, HEIGHT } from './proj.js';

/** Legs whose minor offset is at most this many tiles are snapped to an axis. */
const SNAP = Number(process.env.OCTI_SNAP || 2);

/**
 * Integer points of an octilinear path from (ax,ay) to (bx,by), both included.
 * Near-axis segments (minor offset <= 2) become a single L. Otherwise the minor offset m is
 * drawn as a diagonal staircase of m x-steps and m y-steps, split in two halves around a
 * straight run of (major - m) tiles, so the path hugs the true line.
 * @param {number} ax integer start x
 * @param {number} ay integer start y
 * @param {number} bx integer end x
 * @param {number} by integer end y
 * @returns {Array<[number,number]>}
 */
export function octiLine(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  const out = [[ax, ay]];
  let x = ax, y = ay;
  const step = (mx, my) => { x += mx; y += my; out.push([x, y]); };
  const major = Math.max(adx, ady), minor = Math.min(adx, ady);
  if (minor === 0) {
    for (let i = 0; i < major; i++) adx ? step(sx, 0) : step(0, sy);
    return out;
  }
  const xMajor = adx >= ady;
  // along-major step and across-major step, as [mx,my] unit vectors
  const along = xMajor ? [sx, 0] : [0, sy];
  if (minor <= 2) {
    // L: major first, then minor
    for (let i = 0; i < major; i++) step(along[0], along[1]);
    for (let i = 0; i < minor; i++) step(xMajor ? 0 : sx, xMajor ? sy : 0);
    return out;
  }
  // single junction: diagonal first (from the start), then the straight remainder.
  // A diagonal sandwiched between two straights would create two close junctions (jogs).
  const diag = (n) => { for (let i = 0; i < n; i++) { step(sx, 0); step(0, sy); } };
  diag(minor);
  for (let i = 0; i < major - minor; i++) step(along[0], along[1]);
  return out;
}

/**
 * Tile indices of an octilinear chain through the float polyline `pts`.
 * Vertices are rounded to integer tiles once and joined with octiLine. Consecutive tiles are
 * 4-neighbours (or equal, which markChain ignores).
 * @param {Array<{x:number,y:number}>} pts float tile coords (already simplified)
 * @returns {number[]}
 */
export function octiChainTiles(pts) {
  const idx = (p) => Math.min(HEIGHT - 1, Math.max(0, Math.round(p.y))) * WIDTH + Math.min(WIDTH - 1, Math.max(0, Math.round(p.x)));
  const out = [];
  const pushTile = (t) => { if (out.length === 0 || out[out.length - 1] !== t) out.push(t); };
  if (pts.length === 1) return [idx(pts[0])];
  let cx = clampX(Math.round(pts[0].x)), cy = clampY(Math.round(pts[0].y));
  pushTile(cy * WIDTH + cx);
  for (let i = 1; i < pts.length; i++) {
    let bx = clampX(Math.round(pts[i].x)), by = clampY(Math.round(pts[i].y));
    const adx = Math.abs(bx - cx), ady = Math.abs(by - cy);
    // near-axis legs (minor offset <= 2) are snapped straight: no 1-2 tile jog at the joint
    if (i < pts.length - 1 && adx > 0 && ady > 0 && Math.min(adx, ady) <= SNAP) {
      if (adx >= ady) by = cy; else bx = cx;
    }
    for (const [x, y] of octiLine(cx, cy, bx, by)) pushTile(y * WIDTH + x);
    cx = bx; cy = by;
  }
  return out;
}

/** @param {number} x @returns {number} */
function clampX(x) { return Math.min(WIDTH - 1, Math.max(0, x)); }
/** @param {number} y @returns {number} */
function clampY(y) { return Math.min(HEIGHT - 1, Math.max(0, y)); }
