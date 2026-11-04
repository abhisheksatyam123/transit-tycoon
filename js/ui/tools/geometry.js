/**
 * Tile geometry helpers shared by build tools (no game access).
 */

/**
 * Tiles of an L-shaped line: first along x from (x0,y0) to (x1,y0), then along y to (x1,y1).
 * Mirrors the core buildRail/buildRoad convention.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{x:number,y:number}[]}
 */
export function lTiles(x0, y0, x1, y1) {
  const out = [];
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  let x = x0;
  out.push({ x, y: y0 });
  while (x !== x1) { x += sx; out.push({ x, y: y0 }); }
  let y = y0;
  while (y !== y1) { y += sy; out.push({ x: x1, y }); }
  return out;
}

/**
 * Tiles of the rectangle spanned by two corners.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{x:number,y:number}[]}
 */
export function rectTiles(x0, y0, x1, y1) {
  const out = [];
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) out.push({ x, y });
  return out;
}

/**
 * Rail station footprint tiles.
 * @param {number} x
 * @param {number} y
 * @param {'x'|'y'} axis
 * @param {number} length
 * @returns {{x:number,y:number}[]}
 */
export function stationFootprint(x, y, axis, length) {
  const out = [];
  for (let i = 0; i < length; i++) out.push(axis === 'x' ? { x: x + i, y } : { x, y: y + i });
  return out;
}

/**
 * Catchment tiles around a footprint (square radius), clipped to the map.
 * @param {{x:number,y:number}[]} tiles
 * @param {number} radius
 * @param {number} W map width
 * @param {number} H map height
 * @returns {{x:number,y:number}[]}
 */
export function catchmentAround(tiles, radius, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x); y1 = Math.max(y1, t.y);
  }
  const out = [];
  for (let y = Math.max(0, y0 - radius); y <= Math.min(H - 1, y1 + radius); y++) {
    for (let x = Math.max(0, x0 - radius); x <= Math.min(W - 1, x1 + radius); x++) out.push({ x, y });
  }
  return out;
}

/** Direction bit names for labels. */
export const DIR_NAMES = { 1: 'N', 2: 'E', 4: 'S', 8: 'W' };

/** Next direction clockwise. */
export const NEXT_DIR = { 1: 2, 2: 4, 4: 8, 8: 1 };
