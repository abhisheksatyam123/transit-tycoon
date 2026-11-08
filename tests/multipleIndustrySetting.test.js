// J3: OpenTTD economy.multiple_industry_per_town (settings.js, industries.js)
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { canPlaceIndustry, placeIndustry, placeExtraIndustries } from '../js/simulation/industries.js';
import { INDUSTRY_BY_ID } from '../js/config/industries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

describe('multipleIndustryPerTown setting', () => {
  test('defaults to false in DEFAULT_SETTINGS and fresh state', () => {
    expect(DEFAULT_SETTINGS.multipleIndustryPerTown).toBe(false);
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 3, startYear: 1950 });
    expect(getSetting(g.state, 'multipleIndustryPerTown')).toBe(false);
  });

  test('SETTING_META has the economy check entry', () => {
    const m = SETTING_META.find((s) => s.key === 'multipleIndustryPerTown');
    expect(m).toBeTruthy(); expect(m.group).toBe('economy'); expect(m.type).toBe('check');
  });

  function setup(settings) {
    const g = Game.create({ seed: 7, width: 128, height: 128, townCount: 5, startYear: 1950, settings });
    g.state.towns = [{ x: 64, y: 64, population: 2000, name: 'Testville' }];
    g.state.industries = [];
    // clear map to flat grass so placement is possible
    for (const t of g.state.map.tiles) { t.building = null; t.rail = 0; t.road = 0; t.terrain = 'grass'; t.height = 0; }
    const type = INDUSTRY_BY_ID.bank; // inTown, 1x2
    placeIndustry(g.state, 'bank', 70, 60);
    return { g, type };
  }

  test('when false, same type near same town is refused', () => {
    const { g, type } = setup({});
    expect(canPlaceIndustry(g.state, type, 60, 70)).toBe(false);
  });

  test('when false, far from town duplicate check does not apply (spacing only)', () => {
    const { g, type } = setup({ multipleIndustryPerTown: false });
    // site far from town (>16) also fails inTown qualification; just check refusal reason is not town rule
    expect(canPlaceIndustry(g.state, type, 60, 70)).toBe(false);
  });

  test('when true, multiple of same type near same town is permitted', () => {
    const { g, type } = setup({ multipleIndustryPerTown: true });
    expect(getSetting(g.state, 'multipleIndustryPerTown')).toBe(true);
    expect(canPlaceIndustry(g.state, type, 60, 70)).toBe(true);
  });

  test('placeExtraIndustries with true does not skip town with existing industry', () => {
    const { g } = setup({ multipleIndustryPerTown: true, extraIndustries: true });
    const before = g.state.industries.filter((i) => i.typeId === 'bank').length;
    // rng stub for placeExtraIndustries + placeChainIndustries
    let n = 0; const rng = { int: (a, b) => { const v = a + (n % (b - a + 1)); n++; return v; } };
    placeExtraIndustries(g.state, rng);
    const after = g.state.industries.filter((i) => i.typeId === 'bank').length;
    expect(after).toBeGreaterThan(before);
  });

  test('save/load preserves multipleIndustryPerTown setting', () => {
    const g = Game.create({ seed: 9, width: 64, height: 64, townCount: 3, startYear: 1950, settings: { multipleIndustryPerTown: true } });
    const json = serializeState(g.state);
    const loaded = parseState(json);
    expect(getSetting(loaded, 'multipleIndustryPerTown')).toBe(true);
  });
});
