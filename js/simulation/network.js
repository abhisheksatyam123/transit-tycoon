/**
 * Rail / road connectivity helpers and line geometry.
 */
import { DIRS, OPPOSITE, AXIS_BITS } from './constants.js';
import { inBounds } from './map.js';

/**
 * Tiles of an L-shaped line: first along x (at y0), then along y (at x1).
 * @returns {{x:number,y:number}[]}
 */
export function linePath(x0, y0, x1, y1) {
  const out = [];
  const sx = x1 >= x0 ? 1 : -1, sy = y1 >= y0 ? 1 : -1;
  for (let x = x0; x !== x1 + sx; x += sx) out.push({ x, y: y0 });
  for (let y = y0 + sy; y !== y1 + sy; y += sy) out.push({ x: x1, y });
  return out;
}

/**
 * Axis of a straight piece: 'x' if bits ⊆ E|W, 'y' if bits ⊆ N|S, null otherwise (or 0 bits).
 * @param {number} bits
 */
export function straightAxis(bits) {
  if (!bits) return null;
  if ((bits & ~AXIS_BITS.x) === 0) return 'x';
  if ((bits & ~AXIS_BITS.y) === 0) return 'y';
  return null;
}

/**
 * True if tiles A and B (adjacent) are connected on layer ('rail'|'road').
 */
export function connected(map, layer, ax, ay, bx, by) {
  if (!inBounds(map, ax, ay) || !inBounds(map, bx, by)) return false;
  const d = DIRS.find((q) => q.dx === bx - ax && q.dy === by - ay);
  if (!d) return false;
  const a = map.tiles[ay * map.width + ax], b = map.tiles[by * map.width + bx];
  return (a[layer] & d.bit) !== 0 && (b[layer] & OPPOSITE[d.bit]) !== 0;
}

/** Rail connectivity between adjacent tiles. */
export function railConnected(map, ax, ay, bx, by) {
  return connected(map, 'rail', ax, ay, bx, by);
}

/** Road connectivity between adjacent tiles. */
export function roadConnected(map, ax, ay, bx, by) {
  return connected(map, 'road', ax, ay, bx, by);
}

/**
 * Connected neighbours of (x,y) on a layer.
 * @returns {{x:number,y:number,bit:number}[]}
 */
export function connectedNeighbours(map, layer, x, y) {
  const out = [];
  const t = map.tiles[y * map.width + x];
  const bits = t[layer];
  if (!bits) return out;
  for (const d of DIRS) {
    if (!(bits & d.bit)) continue;
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    if (map.tiles[ny * map.width + nx][layer] & OPPOSITE[d.bit]) out.push({ x: nx, y: ny, bit: d.bit });
  }
  return out;
}

/**
 * Set mutual connection bits between two adjacent tiles on a layer (no validation).
 */
export function linkTiles(map, layer, ax, ay, bx, by) {
  const d = DIRS.find((q) => q.dx === bx - ax && q.dy === by - ay);
  if (!d) return;
  map.tiles[ay * map.width + ax][layer] |= d.bit;
  map.tiles[by * map.width + bx][layer] |= OPPOSITE[d.bit];
}

/**
 * Human readable description of bits, e.g. "N-S" or "E-W" or "junction".
 * @param {number} bits
 */
export function describeBits(bits) {
  const names = DIRS.filter((d) => bits & d.bit).map((d) => d.name);
  if (names.length === 0) return 'none';
  if (names.length >= 3) return `junction (${names.join('/')})`;
  return names.join('-');
}
