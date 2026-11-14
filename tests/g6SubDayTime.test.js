/**
 * G6 sub-day timetable display units: pure format/parse helpers and the off-by-default predicate.
 */
import { test, expect, describe } from 'bun:test';
import { ttFormatTime, ttParseTime, timetableSubDayOn } from '../js/simulation/ttTimeUnits.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

describe('G6 sub-day display', () => {
  test('format on whole and fractional days', () => {
    expect(ttFormatTime(0, true)).toBe('0d 00h');
    expect(ttFormatTime(3, true)).toBe('3d 00h');
    expect(ttFormatTime(3 + 4 / 24, true)).toBe('3d 04h');
    expect(ttFormatTime(0.5, true)).toBe('0d 12h');
    expect(ttFormatTime(10 + 23 / 24, true)).toBe('10d 23h');
  });

  test('round trip parse(format(x)) for several values', () => {
    for (const d of [0, 1, 2, 7, 30, 3 + 4 / 24, 0.5, 12 + 13 / 24]) {
      const text = ttFormatTime(d, true);
      expect(ttParseTime(text)).toBeCloseTo(d, 10);
      expect(ttFormatTime(ttParseTime(text), true)).toBe(text);
    }
  });

  test('off keeps the legacy plain text', () => {
    expect(ttFormatTime(3, false)).toBe('3');
    expect(ttFormatTime(3, undefined)).toBe('3');
  });

  test('format rejects non-finite and negative input', () => {
    expect(ttFormatTime(NaN, true)).toBe('');
    expect(ttFormatTime(Infinity, true)).toBe('');
    expect(ttFormatTime(-1, true)).toBe('');
    expect(ttFormatTime('3', true)).toBe('');
  });

  test('parse rejects garbage', () => {
    for (const bad of ['', 'abc', '3 d', '3d 4h', '3d 24h', '3d 100h', '-1d 00h', '3.5d 00h', '3d 04h extra', null, 5, undefined]) {
      expect(ttParseTime(bad)).toBeNull();
    }
    expect(ttParseTime('3d')).toBe(3);
  });

  test('predicate is off by default and follows the setting', () => {
    expect(DEFAULT_SETTINGS.timetableSubDay).toBe(false);
    const state = {};
    expect(timetableSubDayOn(state)).toBe(false);
    setSetting(state, 'timetableSubDay', true);
    expect(timetableSubDayOn(state)).toBe(true);
  });

  test('setting has a UI entry', () => {
    expect(SETTING_META.some((m) => m.key === 'timetableSubDay' && m.type === 'check')).toBe(true);
  });
});
