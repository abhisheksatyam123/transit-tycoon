import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { effectiveMaxLoan } from '../js/simulation/prices.js';
import { MAX_LOAN } from '../js/simulation/constants.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

describe('max-loan inflation (gap #52)', () => {
  test('default off: effectiveMaxLoan is flat MAX_LOAN', () => {
    expect(DEFAULT_SETTINGS.inflationAdjustsMaxLoan).toBe(false);
    const g = Game.create(small);
    expect(getSetting(g.state, 'inflationAdjustsMaxLoan')).toBe(false);
    expect(effectiveMaxLoan(g.state)).toBe(MAX_LOAN);
  });

  test('opt-in inflation path scales with inflation', () => {
    const g = Game.create(small);
    setSetting(g.state, 'inflationAdjustsMaxLoan', true);
    expect(getSetting(g.state, 'inflationAdjustsMaxLoan')).toBe(true);
    expect(effectiveMaxLoan(g.state)).toBeGreaterThanOrEqual(MAX_LOAN);
  });

  test('save/load round-trip preserves setting', () => {
    const g = Game.create(small);
    setSetting(g.state, 'inflationAdjustsMaxLoan', true);
    const json = JSON.stringify(g.state);
    const loaded = JSON.parse(json);
    expect(getSetting(loaded, 'inflationAdjustsMaxLoan')).toBe(true);
  });

  test('invalid value rejection: setting meta is boolean check', () => {
    const entry = SETTING_META.find((e) => e.key === 'inflationAdjustsMaxLoan');
    expect(entry.type).toBe('check');
  });
});
