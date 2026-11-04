/**
 * OpenTTD sub-tile offset (dx, dy in 1/16 tile units, X = our y, Y = our x) to screen px.
 * One tile = 32 px horizontal half-width, 16 px vertical half-height, so 1 unit = (2, 1) px along our axes.
 * Ported from OpenTTD src/tile_map / viewport projection (GPL-2.0).
 * @returns {[number, number]} [screen dx, screen dy]
 */
export function subtileOffset(dx, dy) {
  return [2 * (dy - dx), dy + dx];
}
