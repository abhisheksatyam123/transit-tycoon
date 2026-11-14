/**
 * G6 sub-day timetable display units (OpenTTD timetable_mode days/ticks, simplified to days/hours).
 * Pure helpers: stored timetable values stay whole days; these only format and parse display text.
 * Gated by setting `timetableSubDay` (default off). When off, callers keep their legacy day text.
 */
import { getSetting } from './settings.js';

const HOURS_PER_DAY = 24;

/** True when the sub-day display setting is on (default false). */
export function timetableSubDayOn(state) {
  return !!getSetting(state, 'timetableSubDay');
}

/**
 * Format a day count as "Nd HHh" (whole hours, hours zero-padded to 2 digits).
 * subDay falsy returns the plain number text (legacy). Non-finite or negative input returns ''.
 */
export function ttFormatTime(days, subDay) {
  if (!subDay) return String(days);
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return '';
  const hours = Math.round(days * HOURS_PER_DAY);
  const d = Math.floor(hours / HOURS_PER_DAY);
  const h = hours % HOURS_PER_DAY;
  return `${d}d ${String(h).padStart(2, '0')}h`;
}

/**
 * Parse "Nd HHh" (or a bare whole-day "Nd") back to days (hours / 24).
 * Returns null for anything else: non-strings, extra text, hours >= 24, negatives, fractions.
 */
export function ttParseTime(text) {
  if (typeof text !== 'string') return null;
  const m = /^(\d+)d (\d{2})h$/.exec(text.trim());
  if (!m) {
    const dOnly = /^(\d+)d$/.exec(text.trim());
    return dOnly ? Number(dOnly[1]) : null;
  }
  const h = Number(m[2]);
  if (h >= HOURS_PER_DAY) return null;
  return (Number(m[1]) * HOURS_PER_DAY + h) / HOURS_PER_DAY;
}
