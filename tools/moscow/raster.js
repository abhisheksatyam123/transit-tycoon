/**
 * Rasterisation of polylines and polygons onto tile grids.
 * Bits: N=1 (y-1), E=2 (x+1), S=4 (y+1), W=8 (x-1).
 */
import { WIDTH, HEIGHT, projectF } from './proj.js';

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

/**
 * Convert a geometry (lat/lon points) to a list of 4-connected tile indices.
 * Consecutive tiles are always orthogonal neighbours. Coordinates are clamped
 * to the map (clamping keeps the chain 4-connected).
 * @param {Array<{lat:number,lon:number}>} geom
 * @returns {number[]} tile indices y*WIDTH+x (consecutive entries adjacent; may repeat only at joins)
 */
export function chainTiles(geom) {
  const out = [];
  const pts = geom.map((p) => projectF(p.lat, p.lon));
  const push = (x, y) => {
    const cx = Math.min(WIDTH - 1, Math.max(0, x));
    const cy = Math.min(HEIGHT - 1, Math.max(0, y));
    const idx = cy * WIDTH + cx;
    if (out.length === 0 || out[out.length - 1] !== idx) out.push(idx);
  };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 10));
    let lx = Math.round(a.x), ly = Math.round(a.y);
    if (i === 0) push(lx, ly);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const tx = Math.round(a.x + (b.x - a.x) * t);
      const ty = Math.round(a.y + (b.y - a.y) * t);
      // orthogonal L-steps keep the chain 4-connected
      while (lx !== tx) { lx += Math.sign(tx - lx); push(lx, ly); }
      while (ly !== ty) { ly += Math.sign(ty - ly); push(lx, ly); }
    }
  }
  return out;
}

/**
 * Direction bit from tile a to orthogonal neighbour b.
 * @param {number} a index
 * @param {number} b index
 * @returns {number} bit (0 if not adjacent)
 */
export function dirBit(a, b) {
  const d = b - a;
  if (d === -WIDTH) return N;
  if (d === 1) return E;
  if (d === WIDTH) return S;
  if (d === -1) return W;
  return 0;
}

/** Opposite bit. @param {number} bit @returns {number} */
export function opposite(bit) {
  return bit === N ? S : bit === S ? N : bit === E ? W : E;
}

/**
 * OR the mutual bits for a 4-connected tile chain into `bits`.
 * @param {Uint8Array} bits
 * @param {number[]} chain
 * @returns {number} number of tiles touched
 */
export function markChain(bits, chain) {
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i], b = chain[i + 1];
    const d = dirBit(a, b);
    if (!d) continue;
    bits[a] |= d;
    bits[b] |= opposite(d);
  }
  return chain.length;
}

/**
 * Mark tiles of a chain in a plain mask (no bits).
 * @param {Uint8Array} mask
 * @param {number[]} chain
 * @param {number} value
 */
export function markTiles(mask, chain, value) {
  for (const t of chain) mask[t] = value;
}

/**
 * Point-in-polygon (ray casting) for float point (px,py) and ring of {x,y}.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x:number,y:number}>} ring
 * @returns {boolean}
 */
export function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > py) !== (b.y > py) && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Project a closed geometry to float tile coords.
 * @param {Array<{lat:number,lon:number}>} geom
 * @returns {Array<{x:number,y:number}>}
 */
export function ringF(geom) {
  return geom.map((p) => projectF(p.lat, p.lon));
}

/**
 * Shoelace area in tiles^2.
 * @param {Array<{x:number,y:number}>} ring
 * @returns {number}
 */
export function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y);
  return Math.abs(s) / 2;
}

/**
 * Fill tiles whose centres are inside a polygon ring with `value`.
 * Polygons with area >= 0.5 tile but no centre inside mark the tile nearest the centroid.
 * @param {Uint8Array} mask
 * @param {Array<{x:number,y:number}>} ring float tile coords
 * @param {number} value
 * @returns {number} tiles filled
 */
export function fillRing(mask, ring, value) {
  if (ring.length < 3) return 0;
  const area = ringArea(ring);
  if (area < 0.5) return 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of ring) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  let n = 0;
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(HEIGHT - 1, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(WIDTH - 1, Math.round(x1)); x++) {
      if (pointInRing(x, y, ring)) { mask[y * WIDTH + x] = value; n++; }
    }
  }
  if (n === 0) {
    let cx = 0, cy = 0;
    for (const p of ring) { cx += p.x; cy += p.y; }
    cx = Math.min(WIDTH - 1, Math.max(0, Math.round(cx / ring.length)));
    cy = Math.min(HEIGHT - 1, Math.max(0, Math.round(cy / ring.length)));
    mask[cy * WIDTH + cx] = value;
    n = 1;
  }
  return n;
}
