/**
 * Browser display preferences: currency and speed units (OpenTTD currency / units_velocity).
 * Stored in localStorage 'tt.units' as {"currency":"DEFAULT","speed":"kmh"}. Not in the save; the simulation never reads it.
 */
import { CURRENCIES, SPEED_UNITS } from '../simulation/currency.js';

const KEY = 'tt.units';
const DEFAULTS = { currency: 'DEFAULT', speed: 'kmh' };

/** @type {{currency:string,speed:string}|null} */
let cache = null;

/** @returns {{currency:string,speed:string}} saved prefs (invalid entries fall back to defaults); cached */
export function loadUnits() {
  if (cache) return cache;
  let raw = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); } catch { raw = null; }
  let o = {};
  try { o = raw ? JSON.parse(raw) || {} : {}; } catch { o = {}; }
  cache = {
    currency: CURRENCIES[o.currency] ? o.currency : DEFAULTS.currency,
    speed: SPEED_UNITS[o.speed] ? o.speed : DEFAULTS.speed,
  };
  return cache;
}

/**
 * Save one or both prefs. Takes effect immediately for all formatters (they read loadUnits()).
 * @param {Partial<{currency:string,speed:string}>} patch
 */
export function setUnits(patch) {
  const cur = loadUnits();
  const next = { ...cur, ...patch };
  if (!CURRENCIES[next.currency]) next.currency = DEFAULTS.currency;
  if (!SPEED_UNITS[next.speed]) next.speed = DEFAULTS.speed;
  cache = next;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
}

/** @returns {string} current currency id */
export function currentCurrency() { return loadUnits().currency; }

/** @returns {string} current speed unit id */
export function currentSpeedUnit() { return loadUnits().speed; }

/** Test helper: forget the cached prefs so the next read hits localStorage again. */
export function resetUnitsCache() { cache = null; }
