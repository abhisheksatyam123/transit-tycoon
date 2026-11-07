/** Subsidy settings: subsidyMultiplier and subsidyMonths apply at award time; defaults keep x2 / 12 months. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { subsidyMultiplier, AWARD_MONTHS, SUBSIDY_MULTIPLIER_OPTIONS, SUBSIDY_MONTH_OPTIONS } from '../js/simulation/subsidies.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

function offered() {
  const g = flatGame(42);
  const mine = placeIndustry(g.state, 'coal_mine', 10, 20);
  const power = placeIndustry(g.state, 'power_station', 40, 20);
  g.state.subsidies = {
    nextId: 2,
    offers: [{ id: 1, cargoId: 'COAL', src: { type: 'industry', id: mine.id }, dst: { type: 'industry', id: power.id }, expiresMonths: 12 }],
    awarded: [],
  };
  return { g, mine, power, st: { x: power.x, y: power.y } };
}

describe('subsidy settings', () => {
  test('defaults are x2 and 12 months (unchanged behaviour)', () => {
    expect(DEFAULT_SETTINGS.subsidyMultiplier).toBe(2);
    expect(DEFAULT_SETTINGS.subsidyMonths).toBe(12);
    expect(AWARD_MONTHS).toBe(12);
    expect(SUBSIDY_MONTH_OPTIONS).toEqual([12, 24, 36, 60]);
    const { g, mine, st } = offered();
    expect(subsidyMultiplier(g.state, 'COAL', mine.x, mine.y, st, null)).toBe(2);
    expect(g.state.subsidies.awarded[0].remainingMonths).toBe(12);
  });

  test('award uses multiplier 3 and 24 months when set', () => {
    const { g, mine, st } = offered();
    setSetting(g.state, 'subsidyMultiplier', 3);
    setSetting(g.state, 'subsidyMonths', 24);
    expect(subsidyMultiplier(g.state, 'COAL', mine.x, mine.y, st, null)).toBe(3);
    const a = g.state.subsidies.awarded[0];
    expect(a.multiplier).toBe(3);
    expect(a.remainingMonths).toBe(24);
    expect(a.expiresMonths).toBeUndefined();
  });

  test('old awards keep their multiplier when the setting changes later', () => {
    const { g, mine, st } = offered();
    setSetting(g.state, 'subsidyMultiplier', 4);
    subsidyMultiplier(g.state, 'COAL', mine.x, mine.y, st, null);
    setSetting(g.state, 'subsidyMultiplier', 2);
    expect(subsidyMultiplier(g.state, 'COAL', mine.x, mine.y, st, null)).toBe(4);
  });

  test('save/load keeps settings and the stored award multiplier', () => {
    const { g, mine, st } = offered();
    setSetting(g.state, 'subsidyMultiplier', 3);
    setSetting(g.state, 'subsidyMonths', 36);
    subsidyMultiplier(g.state, 'COAL', mine.x, mine.y, st, null);
    const s2 = parseState(serializeState(g.state));
    expect(getSetting(s2, 'subsidyMultiplier')).toBe(3);
    expect(getSetting(s2, 'subsidyMonths')).toBe(36);
    expect(s2.subsidies.awarded[0].multiplier).toBe(3);
    expect(s2.subsidies.awarded[0].remainingMonths).toBe(36);
  });

  test('settings window rows for the subsidy options', () => {
    expect(SUBSIDY_MULTIPLIER_OPTIONS).toContain(3);
    for (const k of ['subsidyMultiplier', 'subsidyMonths']) expect(SETTING_META.filter((m) => m.key === k).length).toBe(1);
  });
});
