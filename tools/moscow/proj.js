/**
 * Projection for the Moscow bake (see scratchpad/moscow-contract.md).
 * x = east, y = south; row 0 = north edge. Tile centres are at integer coords.
 */

/** Map bounding box (MKAD with margin). */
export const BBOX = { s: 55.39, w: 37.22, n: 55.99, e: 37.95 };
/** Tile size in metres. */
export const TILE_M = 200;
const COS_LAT = Math.cos((55.75 * Math.PI) / 180);
/** Metres per degree longitude / latitude at the map centre. */
export const M_PER_LON = 111320 * COS_LAT;
export const M_PER_LAT = 110574;
/** Map width in tiles. */
export const WIDTH = Math.round(((BBOX.e - BBOX.w) * M_PER_LON) / TILE_M);
/** Map height in tiles. */
export const HEIGHT = Math.round(((BBOX.n - BBOX.s) * M_PER_LAT) / TILE_M);

/**
 * Float tile coordinates for a lat/lon.
 * @param {number} lat
 * @param {number} lon
 * @returns {{x:number,y:number}}
 */
export function projectF(lat, lon) {
  return {
    x: ((lon - BBOX.w) * M_PER_LON) / TILE_M,
    y: ((BBOX.n - lat) * M_PER_LAT) / TILE_M,
  };
}

/**
 * Integer tile coordinates (contract formula: round).
 * @param {number} lat
 * @param {number} lon
 * @returns {{x:number,y:number}}
 */
export function project(lat, lon) {
  const f = projectF(lat, lon);
  return { x: Math.round(f.x), y: Math.round(f.y) };
}

/**
 * True when a lat/lon lies inside the bbox.
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean}
 */
export function inBBox(lat, lon) {
  return lat >= BBOX.s && lat <= BBOX.n && lon >= BBOX.w && lon <= BBOX.e;
}

/**
 * Metres between two float tile positions.
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @returns {number}
 */
export function metresBetween(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by) * TILE_M;
}
