// OpenTTD economy.larger_towns (def 0) and economy.initial_city_size (def 2): city towns at generation.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const opts = (settings) => ({ seed: 3, width: 128, height: 128, townCount: 10, startYear: 1950, settings });
const totalPop = (g) => g.state.towns.reduce((s, t) => s + (t.population || 0), 0);

describe('larger_towns / initial_city_size', () => {
  test('defaults: no cities (0) and a 2x city multiplier', () => {
    expect(DEFAULT_SETTINGS.largerTowns).toBe(0);
    expect(DEFAULT_SETTINGS.initialCitySize).toBe(2);
  });

  test('explicit defaults give the same towns as no settings (no extra draws)', () => {
    const a = Game.create(opts({}));
    const b = Game.create(opts({ largerTowns: 0, initialCitySize: 2 }));
    const summary = (g) => g.state.towns.map((t) => [t.x, t.y, t.population]);
    expect(summary(b)).toEqual(summary(a));
  });

  test('every town a city (largerTowns 2 with a bigger multiplier) grows more population than the default', () => {
    const base = Game.create(opts({}));
    const cities = Game.create(opts({ largerTowns: 2, initialCitySize: 4 }));
    expect(getSetting(cities.state, 'largerTowns')).toBe(2);
    expect(cities.state.towns.length).toBe(base.state.towns.length);
    expect(totalPop(cities)).toBeGreaterThan(totalPop(base));
  });

  test('a larger multiplier makes cities bigger than a smaller one (same seed and count)', () => {
    const small = Game.create(opts({ largerTowns: 2, initialCitySize: 1 }));
    const big = Game.create(opts({ largerTowns: 2, initialCitySize: 4 }));
    expect(totalPop(big)).toBeGreaterThan(totalPop(small));
  });

  test('settings survive save/load', () => {
    const g = Game.create(opts({ largerTowns: 3, initialCitySize: 3 }));
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'largerTowns')).toBe(3);
    expect(getSetting(back.state, 'initialCitySize')).toBe(3);
  });

  test('UI: both are Economy selects for new maps', () => {
    for (const key of ['largerTowns', 'initialCitySize']) {
      const meta = SETTING_META.find((m) => m.key === key);
      expect(meta.group).toBe('economy');
      expect(meta.newGame).toBe(true);
      expect(meta.type).toBe('select');
    }
  });
});
