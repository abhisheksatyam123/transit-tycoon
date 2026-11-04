/**
 * Rail station link bits: interior tiles link along the axis, end tiles only
 * link outward once a neighbour actually carries the matching bit.
 */
import { OPPOSITE, AXIS_BITS } from './constants.js';
import { inBounds } from './map.js';

/**
 * Bits a station tile should carry for a station laid along `axis`.
 * @param {'x'|'y'} axis
 * @param {number} i index of this tile in the station (0-based)
 * @param {number} n station length
 * @returns {number} bits (interior links only; ends have no outward bit)
 */
export function stationTileBits(axis, i, n) {
  let bits = 0;
  const [neg, pos] = axis === 'x' ? [8, 2] : [1, 4];
  if (i > 0) bits |= neg;
  if (i < n - 1) bits |= pos;
  return bits;
}

/**
 * True when (x,y) is a station tile on `layer` whose axis accepts a link in
 * direction `out` (a line may end on it).
 * @returns {boolean}
 */
export function isStationPort(map, x, y, layer, out) {
  if (!inBounds(map, x, y)) return false;
  const b = map.tiles[y * map.width + x].building;
  if (!b || b.type !== 'station' || b.kind !== layer) return false;
  return (AXIS_BITS[b.axis] & OPPOSITE[out]) !== 0;
}
