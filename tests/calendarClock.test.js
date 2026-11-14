/**
 * Opt-in calendar clock (timekeeping option C, first slice): predicate, integer advance, default-off.
 */
import { test, expect, describe } from 'bun:test';
import { calendarOn, advanceCalendar, calendarYearOf } from '../js/simulation/calendarClock.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';

const fresh = () => ({ date: { year: 1950, month: 0, day: 1 } });
const calOn = (ticksPerDay) => {
  const s = fresh();
  setSetting(s, 'timekeepingUnits', 'calendar');
  setSetting(s, 'calendarTicksPerDay', ticksPerDay);
  return s;
};

describe('calendar clock: predicate and default-off', () => {
  test('defaults reproduce today: calendar off, no key created, state untouched', () => {
    expect(DEFAULT_SETTINGS.timekeepingUnits).toBe('economy');
    expect(DEFAULT_SETTINGS.calendarTicksPerDay).toBe(96);
    const s = fresh();
    expect(calendarOn(s)).toBe(false);
    const before = JSON.stringify(s);
    advanceCalendar(s, 96);
    expect(JSON.stringify(s)).toBe(before);
    expect('calendar' in s).toBe(false);
    expect(s.settings).toBeUndefined();
  });

  test('calendar units with the default 96 ticks per day stays off', () => {
    const s = calOn(96);
    expect(calendarOn(s)).toBe(false);
    advanceCalendar(s, 96);
    expect('calendar' in s).toBe(false);
  });

  test('non-default ticks with economy units stays off', () => {
    const s = fresh();
    setSetting(s, 'calendarTicksPerDay', 192);
    expect(calendarOn(s)).toBe(false);
    advanceCalendar(s, 192);
    expect('calendar' in s).toBe(false);
  });

  test('calendar units with 192 ticks per day is on', () => {
    expect(calendarOn(calOn(192))).toBe(true);
  });

  test('calendarYearOf falls back to the economy year when off', () => {
    const s = fresh();
    expect(calendarYearOf(s)).toBe(1950);
    expect(calendarYearOf(calOn(96))).toBe(1950);
  });
});

describe('calendar clock: integer advance at 192 ticks per day', () => {
  test('96 ticks = 0.5 calendar day (subFract 96 of 192), then 96 more = exactly 1 day', () => {
    const s = calOn(192);
    advanceCalendar(s, 96);
    expect(s.calendar).toEqual({ year: 1950, month: 0, day: 1, subFract: 96 });
    advanceCalendar(s, 96);
    expect(s.calendar).toEqual({ year: 1950, month: 0, day: 2, subFract: 0 });
  });

  test('192 economy-day ticks (2 days at 96/day) advance the 192-tick calendar by exactly 1 day; state.date unchanged', () => {
    const s = calOn(192);
    const dateBefore = JSON.stringify(s.date);
    advanceCalendar(s, 192);
    expect(s.calendar).toEqual({ year: 1950, month: 0, day: 2, subFract: 0 });
    expect(JSON.stringify(s.date)).toBe(dateBefore);
  });

  test('month and year rollover at 24 ticks per day', () => {
    const s = calOn(24);
    s.date = { year: 1950, month: 0, day: 31 };
    advanceCalendar(s, 24);
    expect(s.calendar).toEqual({ year: 1950, month: 1, day: 1, subFract: 0 });
    s.calendar = { year: 1950, month: 11, day: 31, subFract: 0 };
    advanceCalendar(s, 24);
    expect(s.calendar).toEqual({ year: 1951, month: 0, day: 1, subFract: 0 });
    expect(calendarYearOf(s)).toBe(1951);
    expect(s.date.year).toBe(1950);
  });

  test('a large tick count in one call matches the same count in small steps', () => {
    const a = calOn(40), b = calOn(40);
    advanceCalendar(a, 1000);
    for (let i = 0; i < 1000; i++) advanceCalendar(b, 1);
    expect(a.calendar).toEqual(b.calendar);
    expect(a.calendar.subFract).toBe(1000 % 40);
  });
});

describe('calendar clock: no floats in state', () => {
  test('every stored calendar field is an integer after many odd-sized advances', () => {
    const s = calOn(37);
    for (let i = 0; i < 500; i++) advanceCalendar(s, (i * 7) % 11);
    const c = s.calendar;
    for (const k of ['year', 'month', 'day', 'subFract']) expect(Number.isInteger(c[k])).toBe(true);
    expect(c.subFract).toBeGreaterThanOrEqual(0);
    expect(c.subFract).toBeLessThan(37);
    expect(c.month).toBeGreaterThanOrEqual(0);
    expect(c.month).toBeLessThan(12);
  });
});
