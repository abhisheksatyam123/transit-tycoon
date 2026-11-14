/**
 * Opt-in calendar clock (timekeeping option C, first slice). OpenTTD TimerManager<TimerGameCalendar> pattern:
 * a sub-day accumulator `subFract` gains one unit per logic tick and a calendar day is taken each time it
 * reaches `calendarTicksPerDay` (integer math only). The economy clock (`state.date`, 96 ticks/day) is never
 * touched. `state.calendar` is created lazily, and only while calendarOn(state) is true.
 * Pure: no DOM, no Math.random, no floats in the stored state.
 */
import { getSetting } from './settings.js';
import { advanceDay } from './date.js';

/** Economy ticks per day (constants.js TICKS_PER_DAY); the default that keeps the calendar off. */
const DEFAULT_TICKS_PER_DAY = 96;
const MIN_TICKS_PER_DAY = 24;
const MAX_TICKS_PER_DAY = 384;

/**
 * True only for the opt-in calendar clock: timekeepingUnits === 'calendar' AND calendarTicksPerDay !== 96.
 * @param {object} state
 * @returns {boolean}
 */
export function calendarOn(state) {
  return getSetting(state, 'timekeepingUnits') === 'calendar' && getSetting(state, 'calendarTicksPerDay') !== DEFAULT_TICKS_PER_DAY;
}

/** Calendar ticks per day, clamped to the settings range and truncated to an integer. */
function ticksPerDay(state) {
  const t = Math.trunc(Number(getSetting(state, 'calendarTicksPerDay')));
  if (!Number.isFinite(t)) return DEFAULT_TICKS_PER_DAY;
  return Math.min(MAX_TICKS_PER_DAY, Math.max(MIN_TICKS_PER_DAY, t));
}

/**
 * Advance the calendar by `ticks` logic ticks. No-op (and no state change) when calendarOn is false.
 * On first use `state.calendar` is created from `state.date` with subFract 0.
 * @param {object} state
 * @param {number} ticks non-negative integer (floored)
 */
export function advanceCalendar(state, ticks) {
  if (!calendarOn(state)) return;
  const n = Math.max(0, Math.floor(Number(ticks) || 0));
  if (!state.calendar) {
    const d = state.date || { year: 0, month: 0, day: 1 };
    state.calendar = { year: d.year, month: d.month, day: d.day, subFract: 0 };
  }
  const cal = state.calendar;
  const per = ticksPerDay(state);
  const total = cal.subFract + n;
  const days = Math.floor(total / per);
  cal.subFract = total - days * per;
  for (let i = 0; i < days; i++) advanceDay(cal);
}

/**
 * Year shown in the UI: the calendar year when calendarOn and the calendar exists, else the economy year.
 * @param {object} state
 * @returns {number}
 */
export function calendarYearOf(state) {
  if (calendarOn(state) && state.calendar) return state.calendar.year;
  return state.date.year;
}
