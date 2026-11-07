/**
 * Formatting helpers (money, numbers, dates, speeds).
 */
import { KMH_TO_TILES_PER_TICK, AIR_KMH_TO_TILES_PER_TICK } from '../simulation/loco/vehicleMotion.js';
import { formatMoney, formatSpeed, groupDigits } from '../simulation/currency.js';
import { currentCurrency, currentSpeedUnit } from './units.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format money in the player's chosen currency (default "$1,234" / "-$1,234"). The only money formatter for the UI.
 * @param {number} n internal value
 * @returns {string}
 */
export function money(n) {
  return formatMoney(n, currentCurrency());
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
  const v = Math.round(n || 0), a = Math.abs(v);
  if (!(a < 1e21)) return v.toLocaleString('en-US');
  return v < 0 ? '-' + groupDigits(a) : groupDigits(a);
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
 * Convert a speed in tiles/tick into the display speed (km/h or mph, per the Interface setting).
 * @param {number} tilesPerTick
 * @param {string} [kind] vehicle kind ('aircraft' uses the air conversion)
 * @returns {string}
 */
export function speed(tilesPerTick, kind) {
  const k = kind === 'aircraft' ? AIR_KMH_TO_TILES_PER_TICK : KMH_TO_TILES_PER_TICK;
  return formatSpeed(Math.round((tilesPerTick || 0) / k), currentSpeedUnit());
}

/**
 * Capitalise first letter.
 * @param {string} s
 * @returns {string}
 */
export function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * A km/h figure (e.g. a model's top speed) in the chosen speed unit.
 * @param {number} kmh
 * @returns {string}
 */
export function kmhText(kmh) {
  return formatSpeed(kmh, currentSpeedUnit());
}
