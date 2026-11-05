/**
 * Formatting helpers (money, numbers, dates, speeds).
 */
import { KMH_TO_TILES_PER_TICK, AIR_KMH_TO_TILES_PER_TICK } from '../simulation/loco/vehicleMotion.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format money as "$1,234" / "-$1,234".
 * @param {number} n
 * @returns {string}
 */
export function money(n) {
  const v = Math.round(n || 0);
  const s = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '-$' : '$') + s;
}

/**
 * Signed money: "+$12" / "-$12".
 * @param {number} n
 * @returns {string}
 */
export function signedMoney(n) {
  return (n >= 0 ? '+' : '') + money(n);
}

/**
 * Format an integer with thousands separators.
 * @param {number} n
 * @returns {string}
 */
export function num(n) {
  return Math.round(n || 0).toLocaleString('en-US');
}

/**
 * Percent from 0..1 or 0..100 (pass `isFrac`).
 * @param {number} v
 * @param {boolean} [isFrac]
 * @returns {string}
 */
export function pct(v, isFrac = false) {
  return Math.round((v || 0) * (isFrac ? 100 : 1)) + '%';
}

/**
 * Date object {year,month,day} -> "12 Mar 1950".
 * @param {{year:number,month:number,day:number}} d
 * @returns {string}
 */
export function date(d) {
  if (!d) return '';
  return `${d.day} ${MONTHS[d.month] || '?'} ${d.year}`;
}

/**
 * Short month name.
 * @param {number} m 0-11
 * @returns {string}
 */
export function monthName(m) {
  return MONTHS[m] || '?';
}

/**
 * Convert a speed in tiles/tick into a display km/h figure (inverse of KMH_TO_TILES_PER_TICK / AIR_KMH_TO_TILES_PER_TICK).
 * @param {number} tilesPerTick
 * @param {string} [kind] vehicle kind ('aircraft' uses the air conversion)
 * @returns {string}
 */
export function speed(tilesPerTick, kind) {
  const k = kind === 'aircraft' ? AIR_KMH_TO_TILES_PER_TICK : KMH_TO_TILES_PER_TICK;
  return Math.round((tilesPerTick || 0) / k) + " km/h";
}

/**
 * Capitalise first letter.
 * @param {string} s
 * @returns {string}
 */
export function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
