/**
 * Pure road/rail shape geometry (no DOM, deterministic). Shared by the core
 * builder (cmdTrack.js) and the build tools' previews.
 *
 * All paths are 4-connected lists of {x,y} tiles without duplicates and without
 * 2x2 blocks. Monotone walks guarantee the no-2x2 property (a monotone chain
 * can never contain two incomparable tiles like (0,1) and (1,0)).
 */

/** Shape ids in cycle order. 'L' = x-then-y line (core linePath). */
export const SHAPES = ['L', 'diag', 'curve', 'circle'];

/** Human label per shape id. */
export const SHAPE_LABEL = { L: 'L', diag: 'Diagonal', curve: 'Curve', circle: 'Circle' };

/**
 * Check a path: consecutive tiles 4-adjacent, no duplicate tiles, and (if loop)
 * the last tile is 4-adjacent to the first.
 * @param {{x:number,y:number}[]} path
 * @param {boolean} [loop=false]
 * @returns {boolean}
 */
export function pathOk(path, loop = false) {
  if (!Array.isArray(path) || path.length < (loop ? 4 : 2)) return false;
  const seen = new Set();
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y)) return false;
    const key = p.x + ',' + p.y;
    if (seen.has(key)) return false;
    seen.add(key);
    if (i > 0 && manhattan(p, path[i - 1]) !== 1) return false;
  }
  if (loop && manhattan(path[0], path[path.length - 1]) !== 1) return false;
  return true;
}

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

/**
 * Octilinear route: a 45-degree staircase for min(|dx|,|dy|) diagonal steps,
 * starting with the axis of larger remaining delta, then straight along the major axis.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @returns {{x:number,y:number}[]}
 */
export function diagPath(x0, y0, x1, y1) {
  const ax = Math.abs(x1 - x0), ay = Math.abs(y1 - y0);
  const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  const k = Math.min(ax, ay);
  const xFirst = ax >= ay;
  const out = [{ x: x0, y: y0 }];
  let x = x0, y = y0;
  for (let i = 0; i < 2 * k; i++) {
    const useX = (i % 2 === 0) === xFirst;
    if (useX) x += sx; else y += sy;
    out.push({ x, y });
  }
  // straight remainder along the major axis
  while (x !== x1) { x += sx; out.push({ x, y }); }
  while (y !== y1) { y += sy; out.push({ x, y }); }
  return out;
}

/**
 * Monotone rasterisation of the ellipse quadrant centred (cx,cy) with radii a,b,
 * from A=(cx+sx*a, cy) to B=(cx, cy+sy*b). Each step picks the 4-neighbour
 * whose point is closest to the ellipse (implicit form), with exact step counts.
 * @returns {{x:number,y:number}[]} tiles from A to B inclusive
 */
function ellipseWalk(cx, cy, a, b, sx, sy) {
  let x = cx + sx * a, y = cy;
  const out = [{ x, y }];
  let rx = a, ry = b;
  const f = (px, py) => {
    const u = a ? (px - cx) / a : 0, v = b ? (py - cy) / b : 0;
    return Math.abs(u * u + v * v - 1);
  };
  while (rx > 0 || ry > 0) {
    let useX;
    if (rx === 0) useX = false;
    else if (ry === 0) useX = true;
    else useX = f(x - sx, y) <= f(x, y + sy);
    if (useX) { x -= sx; rx--; } else { y += sy; ry--; }
    out.push({ x, y });
  }
  return out;
}

/**
 * Smooth quarter-ellipse arc from (x0,y0) to (x1,y1). When |dx|>=|dy| the start
 * tangent is horizontal (ends vertical), else vertical. Degenerate deltas give straight runs.
 * @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @returns {{x:number,y:number}[]} tiles from start to end inclusive
 */
export function arcPath(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const a = Math.abs(dx), b = Math.abs(dy);
  const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1;
  if (a === 0 || b === 0) return diagPath(x0, y0, x1, y1);
  if (a >= b) {
    // centre (x0,y1): start is its top/bottom point, end its side point
    return ellipseWalk(x0, y1, a, b, sx, -sy).reverse();
  }
  // centre (x1,y0): start is its side point, end its top/bottom point
  return ellipseWalk(x1, y0, a, b, -sx, sy);
}

/**
 * Closed 4-connected ring of tiles around (cx,cy) at radius r (>= 2), built from
 * four monotone quadrant walks joined at the axis points.
 * @param {number} cx @param {number} cy @param {number} r
 * @returns {{x:number,y:number}[]} ring in order (last is adjacent to first)
 */
export function circlePath(cx, cy, r) {
  r = Math.max(2, Math.round(r));
  const a = ellipseWalk(cx, cy, r, r, 1, 1);             // (cx+r,cy) -> (cx,cy+r)
  const b = ellipseWalk(cx, cy, r, r, -1, 1).reverse();  // (cx,cy+r) -> (cx-r,cy)
  const c = ellipseWalk(cx, cy, r, r, -1, -1);           // (cx-r,cy) -> (cx,cy-r)
  const d = ellipseWalk(cx, cy, r, r, 1, -1).reverse();  // (cx,cy-r) -> (cx+r,cy)
  const ring = [...a];
  for (const seg of [b, c, d]) for (let i = 1; i < seg.length; i++) ring.push(seg[i]);
  ring.pop(); // last equals first
  return ring;
}

/**
 * Route for a shape drag. Returns null for 'L' (the core's own straight/L line).
 * Circle: centre = start, radius = max(|dx|,|dy|) (min 2).
 * @param {string} shape one of SHAPES
 * @returns {{path:{x:number,y:number}[], loop:boolean}|null}
 */
export function routeFor(shape, x0, y0, x1, y1) {
  if (shape === 'diag') return { path: diagPath(x0, y0, x1, y1), loop: false };
  if (shape === 'curve') return { path: arcPath(x0, y0, x1, y1), loop: false };
  if (shape === 'circle') {
    const r = Math.max(2, Math.abs(x1 - x0), Math.abs(y1 - y0));
    return { path: circlePath(x0, y0, r), loop: true };
  }
  return null;
}
