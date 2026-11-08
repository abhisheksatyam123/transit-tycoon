/**
 * OpenTTD gui.autosave_interval game setting (state.settings.autosaveInterval).
 * Tests the setting definition, meta, interval mapping, and save/load round-trip.
 */
import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { autosaveIntervalMs } from '../js/ui/autosavePrefs.js';

describe('autosaveInterval setting', () => {
  test('default is off in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.autosaveInterval).toBe('off');
  });

  test('fresh state reads off via getSetting', () => {
    const state = {};
    expect(getSetting(state, 'autosaveInterval')).toBe('off');
  });

  test('SETTING_META contains autosaveInterval select in interface group', () => {
    const m = SETTING_META.find((e) => e.key === 'autosaveInterval');
    expect(m).toBeTruthy();
    expect(m.group).toBe('interface');
    expect(m.type).toBe('select');
    expect(m.label).toBe('Autosave interval');
    const values = m.options.map((o) => o[0]);
    expect(values).toEqual(['off', '1min', '5min', '10min', '15min']);
  });

  test('elapsed time logic checks correct intervals', () => {
    expect(autosaveIntervalMs('off')).toBe(0);
    expect(autosaveIntervalMs('1min')).toBe(60000);
    expect(autosaveIntervalMs('5min')).toBe(300000);
    expect(autosaveIntervalMs('10min')).toBe(600000);
    expect(autosaveIntervalMs('15min')).toBe(900000);
    expect(autosaveIntervalMs(undefined)).toBe(0);
    expect(autosaveIntervalMs('bogus')).toBe(0);
  });

  test('due check: elapsed >= interval triggers, elapsed < interval does not', () => {
    const last = 1000000;
    // 1min
    expect(1000000 + 59999 - last >= autosaveIntervalMs('1min')).toBe(false);
    expect(1000000 + 60000 - last >= autosaveIntervalMs('1min')).toBe(true);
    // 5min
    expect(1000000 + 299999 - last >= autosaveIntervalMs('5min')).toBe(false);
    expect(1000000 + 300000 - last >= autosaveIntervalMs('5min')).toBe(true);
    // 10min
    expect(1000000 + 600000 - last >= autosaveIntervalMs('10min')).toBe(true);
    // 15min
    expect(1000000 + 900000 - last >= autosaveIntervalMs('15min')).toBe(true);
    // off never due
    expect(autosaveIntervalMs('off') > 0).toBe(false);
  });

  test('save/load preserves autosaveInterval setting', () => {
    const state = { settings: {} };
    setSetting(state, 'autosaveInterval', '5min');
    // simulate serialize/deserialize round-trip of state.settings
    const json = JSON.stringify(state.settings);
    const loaded = { settings: JSON.parse(json) };
    expect(getSetting(loaded, 'autosaveInterval')).toBe('5min');
  });

  test('missing setting in old save falls back to off', () => {
    const loaded = { settings: { inflation: true } }; // old save, no autosaveInterval
    expect(getSetting(loaded, 'autosaveInterval')).toBe('off');
  });
});
