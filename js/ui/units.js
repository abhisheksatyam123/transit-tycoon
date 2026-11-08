/**
 * Browser display preferences: currency and speed units (OpenTTD currency / units_velocity).
 * Stored in localStorage 'tt.units' as {"currency":"DEFAULT","speed":"kmh"}. Not in the save; the simulation never reads it.
 */
import { CURRENCIES, SPEED_UNITS } from '../simulation/currency.js';

const KEY = 'tt.units';
export const DATE_FORMATS = { dmy: 'Day-Month-Year (12 Mar 1950)', mdy: 'Month-Day-Year (Mar 12 1950)', ymd: 'Year-Month-Day (1950-03-12)' };
const DEFAULTS = { currency: 'DEFAULT', speed: 'kmh', dateFormat: 'dmy' };

/** @type {{currency:string,speed:string,dateFormat:string}|null} */
let cache = null;

/** @returns {{currency:string,speed:string,dateFormat:string}} saved prefs (invalid entries fall back to defaults); cached */
export function loadUnits() {
  if (cache) return cache;
  let raw = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); } catch { raw = null; }
  let o = {};
  try { o = raw ? JSON.parse(raw) || {} : {}; } catch { o = {}; }
  cache = {
    currency: CURRENCIES[o.currency] ? o.currency : DEFAULTS.currency,
    speed: SPEED_UNITS[o.speed] ? o.speed : DEFAULTS.speed,
    dateFormat: DATE_FORMATS[o.dateFormat] ? o.dateFormat : DEFAULTS.dateFormat,
  };
  return cache;
}

/**
 * Save one or both prefs. Takes effect immediately for all formatters (they read loadUnits()).
 * @param {Partial<{currency:string,speed:string,dateFormat:string}>} patch
 */
export function setUnits(patch) {
  const cur = loadUnits();
  const next = { ...cur, ...patch };
  if (!CURRENCIES[next.currency]) next.currency = DEFAULTS.currency;
  if (!SPEED_UNITS[next.speed]) next.speed = DEFAULTS.speed;
  if (!DATE_FORMATS[next.dateFormat]) next.dateFormat = DEFAULTS.dateFormat;
  cache = next;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
}

/** @returns {string} current currency id */
export function currentCurrency() { return loadUnits().currency; }

/** @returns {string} current speed unit id */
export function currentSpeedUnit() { return loadUnits().speed; }

/** @returns {string} current date format id */
export function currentDateFormat() { return loadUnits().dateFormat; }

/** Test helper: forget the cached prefs so the next read hits localStorage again. */
export function resetUnitsCache() { cache = null; }
