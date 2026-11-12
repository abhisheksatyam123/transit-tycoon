/**
 * Display-only currency and speed units (OpenTTD currency.cpp / units_velocity).
 * Pure: no DOM, no localStorage. Internal money values never change; the display value is value * rate.
 * The browser picks the currency/unit (ui/units.js); simulation code passes an explicit code.
 */

const NBSP = '\u00a0';

/** @type {Record<string, {id:string,name:string,rate:number,prefix:string,suffix:string}>} */
export const CURRENCIES = {
  DEFAULT: { id: 'DEFAULT', name: '$ (default)', rate: 1, prefix: '$', suffix: '' },
  GBP: { id: 'GBP', name: 'British pound (£)', rate: 1, prefix: '£', suffix: '' },
  USD: { id: 'USD', name: 'US dollar ($)', rate: 2, prefix: '$', suffix: '' },
  EUR: { id: 'EUR', name: 'Euro (€)', rate: 2, prefix: '€', suffix: '' },
  JPY: { id: 'JPY', name: 'Japanese yen (¥)', rate: 220, prefix: '¥', suffix: '' },
  RUB: { id: 'RUB', name: 'Russian rouble (₽)', rate: 80, prefix: '', suffix: NBSP + '₽' },
};

/** Speed units: factor converts km/h into the unit. */
export const SPEED_UNITS = {
  kmh: { id: 'kmh', name: 'km/h', factor: 1 },
  mph: { id: 'mph', name: 'mph', factor: 0.621371 },
};

/** "1234567" -> "1,234,567" for a non-negative integer (same as toLocaleString('en-US')). */
export function groupDigits(a) {
  const d = String(a);
  if (d.length <= 3) return d;
  let out = d.slice(0, d.length % 3 || 3);
  for (let i = out.length; i < d.length; i += 3) out += ',' + d.slice(i, i + 3);
  return out;
}

/**
 * Format an internal money value for display.
 * @param {number} n internal value
 * @param {string} [code] currency id (unknown/absent = DEFAULT, the "$" look)
 * @returns {string} e.g. "$1,234", "-£12", "1,234 ₽"
 */
export function formatMoney(n, code = 'DEFAULT') {
  const c = CURRENCIES[code] || CURRENCIES.DEFAULT;
  const v = Math.round((Number(n) || 0) * c.rate);
  const a = Math.abs(v);
  // en-US digit grouping without toLocaleString (which builds a formatter per call: W7 startup profile hotspot)
  const s = a < 1e21 ? groupDigits(a) : a.toLocaleString('en-US');
  const sign = v < 0 ? '-' : '';
  return c.suffix ? `${sign}${c.prefix}${s}${c.suffix}` : `${sign}${c.prefix}${s}`;
}

/**
 * Parse a label made by formatMoney for the same currency back to the internal value. Null if it does not match.
 * @param {string} s
 * @param {string} [code]
 * @returns {number|null}
 */
export function parseMoney(s, code = 'DEFAULT') {
  const c = CURRENCIES[code] || CURRENCIES.DEFAULT;
  let t = String(s || '').trim();
  let neg = false;
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (c.prefix) { if (!t.startsWith(c.prefix)) return null; t = t.slice(c.prefix.length); }
  if (c.suffix) { if (!t.endsWith(c.suffix)) return null; t = t.slice(0, -c.suffix.length); }
  if (!/^[\d,]+$/.test(t)) return null;
  const v = Number(t.replace(/,/g, '')) / c.rate;
  return neg ? -v : v;
}

/**
 * Format a km/h figure in the given speed unit.
 * @param {number} kmh
 * @param {string} [unit] 'kmh' | 'mph'
 * @returns {string} e.g. "160 km/h" or "99 mph"
 */
export function formatSpeed(kmh, unit = 'kmh') {
  const u = SPEED_UNITS[unit] || SPEED_UNITS.kmh;
  return Math.round((Number(kmh) || 0) * u.factor) + ' ' + u.name;
}
