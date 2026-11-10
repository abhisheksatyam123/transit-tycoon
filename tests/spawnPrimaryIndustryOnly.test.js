// OpenTTD economy.spawn_primary_industry_only (def false): only raw (primary) industry types are generated or spawned.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { INDUSTRY_TYPES, INDUSTRY_BY_ID } from '../js/config/industries.js';
import { industryTypesFor, isRawIndustryType } from '../js/simulation/industries.js';
import { updateMonthly as industriesMonthly } from '../js/simulation/loco/industryManager.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const opts = (settings) => ({ seed: 1, width: 96, height: 96, townCount: 8, startYear: 1950, settings });

describe('spawnPrimaryIndustryOnly', () => {
  test('defaults to false and keeps the full type list (identity)', () => {
    expect(DEFAULT_SETTINGS.spawnPrimaryIndustryOnly).toBe(false);
    const st = { industries: [], settings: {} };
    expect(industryTypesFor(st)).toBe(INDUSTRY_TYPES);
  });

  test('on: only raw types are offered; processing types are excluded', () => {
    const st = { industries: [], settings: { spawnPrimaryIndustryOnly: true } };
    const types = industryTypesFor(st);
    expect(types.length).toBeGreaterThan(0);
    expect(types.length).toBeLessThan(INDUSTRY_TYPES.length);
    expect(types.every(isRawIndustryType)).toBe(true);
    expect(INDUSTRY_TYPES.some((t) => !isRawIndustryType(t))).toBe(true);
  });

  test('is a checkbox in the Economy group, marked for the New Game dialog', () => {
    const meta = SETTING_META.find((m) => m.key === 'spawnPrimaryIndustryOnly');
    expect(meta.group).toBe('economy');
    expect(meta.type).toBe('check');
    expect(meta.newGame).toBe(true);
  });

  test('generation creates only raw industries when on', () => {
    const g = Game.create(opts({ spawnPrimaryIndustryOnly: true }));
    expect(getSetting(g.state, 'spawnPrimaryIndustryOnly')).toBe(true);
    expect(g.state.industries.length).toBeGreaterThan(0);
    for (const i of g.state.industries) expect(isRawIndustryType(INDUSTRY_BY_ID[i.typeId])).toBe(true);
  });

  test('monthly spawns create only raw industries when on', () => {
    const g = Game.create(opts({ spawnPrimaryIndustryOnly: true }));
    const before = new Set(g.state.industries.map((i) => i.id));
    for (let m = 0; m < 60; m++) industriesMonthly(g);
    const added = g.state.industries.filter((i) => !before.has(i.id));
    for (const i of added) expect(isRawIndustryType(INDUSTRY_BY_ID[i.typeId])).toBe(true);
  });

  test('default games still generate processing industries', () => {
    const g = Game.create(opts({}));
    expect(g.state.industries.some((i) => !isRawIndustryType(INDUSTRY_BY_ID[i.typeId]))).toBe(true);
  });

  test('save/load keeps the setting', () => {
    const g = Game.create(opts({}));
    setSetting(g.state, 'spawnPrimaryIndustryOnly', true);
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'spawnPrimaryIndustryOnly')).toBe(true);
  });
});
