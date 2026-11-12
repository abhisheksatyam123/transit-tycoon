// AF2: climateGrowthOttd (opt-in). Default false must keep today's arctic/tropic gates and farm fields exactly;
// temperate is never affected. When on, OpenTTD's UpdateTownGrowth goals / PlantFarmField snow rule apply.
import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { townGrowthAllowed, tropicGrowthAllowed } from '../js/simulation/climate.js';
import { plantInitialFields, farmFieldTiles } from '../js/simulation/farmFields.js';

const W = 12;
const tilesAt = (heightAt, terrainAt = () => 'grass') => {
  const tiles = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) tiles.push({ terrain: terrainAt(x, y), height: heightAt(x, y) });
  return { width: W, height: W, tiles };
};
/** Arctic game, centre tile height 6 (above the default snow line 5). */
function arctic(height = 6, settings) {
  return { mapgen: { climate: 'arctic', snowLine: 5 }, map: tilesAt(() => height), settings };
}
/** Tropic game, flat low land: every interior tile is desert (zone 1). */
function tropic(settings) {
  return { mapgen: { climate: 'tropic' }, map: tilesAt(() => 0), settings };
}
const at = (x, y, extra) => ({ x, y, name: 'T', ...extra });

describe('settings wiring', () => {
  test('climateGrowthOttd exists, defaults to false, and has exactly one settings entry', () => {
    expect(DEFAULT_SETTINGS.climateGrowthOttd).toBe(false);
    expect(getSetting({}, 'climateGrowthOttd')).toBe(false);
    const hits = SETTING_META.filter((m) => m.key === 'climateGrowthOttd');
    expect(hits.length).toBe(1);
    expect(hits[0].group).toBe('environment');
    expect(hits[0].type).toBe('check');
    expect(hits[0].label.length).toBeGreaterThan(0);
    expect(hits[0].help.length).toBeGreaterThan(0);
  });
});

describe('default (off): today\'s gates are unchanged', () => {
  test('arctic: above the line a town needs food; population makes no difference', () => {
    const s = arctic();
    expect(townGrowthAllowed(s, at(5, 5, { population: 100 }))).toBe(false);
    expect(townGrowthAllowed(s, at(5, 5, { population: 50 }))).toBe(false);
    expect(townGrowthAllowed(s, at(5, 5, { population: 100, foodLastMonth: 1 }))).toBe(true);
    expect(townGrowthAllowed(s, at(5, 5, { population: 100, fundMonths: 3 }))).toBe(false); // funding alone does not help
  });

  test('arctic: below the line the gate does not apply', () => {
    const s = arctic(2);
    expect(townGrowthAllowed(s, at(5, 5, { population: 100 }))).toBe(true);
  });

  test('tropic desert: a town needs food AND water; population makes no difference', () => {
    const s = tropic();
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 50 }))).toBe(false);
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70 }))).toBe(false);
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70, foodLastMonth: 1 }))).toBe(false);
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70, foodLastMonth: 1, waterLastMonth: 1 }))).toBe(true);
  });

  test('temperate is never affected by either gate', () => {
    const s = { map: tilesAt(() => 7) };
    expect(townGrowthAllowed(s, at(5, 5, { population: 500 }))).toBe(true);
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 500 }))).toBe(true);
  });
});

describe('on: OpenTTD arctic winter goal (population > 90 and no activity blocks)', () => {
  const s = arctic(6, { climateGrowthOttd: true });

  test('population 50 above the line is allowed even without food', () => {
    expect(townGrowthAllowed(s, at(5, 5, { population: 50 }))).toBe(true);
  });

  test('population 100 above the line is blocked while food activity is zero', () => {
    expect(townGrowthAllowed(s, at(5, 5, { population: 100 }))).toBe(false);
    expect(townGrowthAllowed(s, at(5, 5, { population: 100, fundMonths: 0 }))).toBe(false);
  });

  test('population 100 with food last month is allowed (old_act != 0)', () => {
    expect(townGrowthAllowed(s, at(5, 5, { population: 100, foodLastMonth: 2 }))).toBe(true);
  });

  test('a funded town (fundMonths > 0) skips the goal checks', () => {
    expect(townGrowthAllowed(s, at(5, 5, { population: 100, fundMonths: 3 }))).toBe(true);
  });

  test('below the snow line nothing changes', () => {
    const low = arctic(2, { climateGrowthOttd: true });
    expect(townGrowthAllowed(low, at(5, 5, { population: 500 }))).toBe(true);
  });
});

describe('on: OpenTTD tropic desert goal (population > 60 and no activity blocks)', () => {
  const s = tropic({ climateGrowthOttd: true });

  test('population 50 in the desert is allowed even without food/water', () => {
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 50 }))).toBe(true);
  });

  test('population 70 in the desert is blocked while activity is zero', () => {
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70 }))).toBe(false);
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70, foodLastMonth: 1 }))).toBe(false); // needs WATER too
  });

  test('population 70 with food and water is allowed', () => {
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70, foodLastMonth: 1, waterLastMonth: 1 }))).toBe(true);
  });

  test('a funded desert town (fundMonths > 0) skips the goal checks', () => {
    expect(tropicGrowthAllowed(s, at(5, 5, { population: 70, fundMonths: 2 }))).toBe(true);
  });

  test('a rainforest town is not affected', () => {
    const high = { mapgen: { climate: 'tropic' }, map: tilesAt((x) => (x < 6 ? 0 : 6)), settings: { climateGrowthOttd: true } };
    expect(tropicGrowthAllowed(high, at(9, 5, { population: 500 }))).toBe(true);
  });
});

describe('on: arctic farm fields respect the snow line (OpenTTD PlantFarmField)', () => {
  const farm = () => ({ id: 1, typeId: 'farm', x: 4, y: 4, w: 3, h: 3 });
  function plantWith(height, climate, climateGrowthOttd) {
    const state = { mapgen: { climate, snowLine: 5 }, map: tilesAt(() => height), settings: { farmFields: true, climateGrowthOttd } };
    const ind = farm();
    plantInitialFields(state, ind);
    return { state, ind, count: farmFieldTiles(state, ind).length };
  }

  test('default (off): fields are planted at any flat height, as today', () => {
    expect(plantWith(6, 'arctic', false).count).toBe(4);
  });

  test('on + arctic: no field tiles at or above the snow line', () => {
    expect(plantWith(6, 'arctic', true).count).toBe(0);
    expect(plantWith(3, 'arctic', true).count).toBe(0); // GetTileZ + 2 >= GetSnowLine() (3 + 2 >= 5)
    expect(plantWith(2, 'arctic', true).count).toBe(4); // 2 + 2 < 5
  });

  test('on: temperate and non-arctic maps still plant fields above the old line', () => {
    expect(plantWith(6, 'temperate', true).count).toBe(4);
  });
});
