/**
 * Articulated road vehicles (OpenTTD articulated_vehicles.cpp, simplified).
 * A model may declare `parts: [{capacity, length}]` (head first; length in tiles). Its `capacity` is the sum of the
 * parts. The vehicle is one entity whose followers trail the head along the path: part k sits at distance
 * partOffsets(parts)[k] behind the head, where consecutive part centres are half of each part's length apart.
 * Models without parts (and every existing vehicle) are untouched: articParts() returns null for them.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';

/** Parts of an articulated road vehicle, or null for a plain road vehicle / a train / a ship / an aircraft. */
export function articParts(v) {
  if (!v || v.kind !== 'road' || !v.modelId) return null;
  const m = MODEL_BY_ID[v.modelId];
  return m && m.parts && m.parts.length > 1 ? m.parts : null;
}

/** Distance (tiles, along the path) from the head centre to each part centre. offsets[0] = 0. */
export function partOffsets(parts) {
  const off = new Array(parts.length);
  off[0] = 0;
  for (let k = 1; k < parts.length; k++) off[k] = off[k - 1] + (parts[k - 1].length + parts[k].length) / 2;
  return off;
}

/** Path span (tiles) from the head to the last part; 0 for a plain vehicle. */
export function articSpan(v) {
  const p = articParts(v);
  if (!p) return 0;
  const off = partOffsets(p);
  return off[off.length - 1];
}

/**
 * Load fraction of each part, filled head first (a part's share of the total load, by its own capacity).
 * @returns {number[]} one value 0..1 per part
 */
export function partFills(parts, amount) {
  const out = new Array(parts.length);
  let cum = 0;
  for (let k = 0; k < parts.length; k++) {
    const cap = parts[k].capacity || 0;
    out[k] = cap > 0 ? Math.max(0, Math.min(1, (amount - cum) / cap)) : 0;
    cum += cap;
  }
  return out;
}
