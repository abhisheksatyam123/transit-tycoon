// D20 U7-U9 (opt-in, default off). U7: New Game non-square height (the map shape only; town and industry counts are
// not scaled by area). U8: waterBorders 'none' (default) and 'random' from the game seed (other values are F4's).
// U9: the options are New Game only, so no Settings keys exist for them. Defaults must stay byte-identical.
import { test, expect, describe } from 'bun:test';
import { Game, mapgenOptions, MAPGEN_DEFAULTS } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { createMap, generateTerrain, waterBorderMask } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';

const terrainKey = (g) => g.state.map.tiles.map((t) => `${t.terrain}${t.height}`).join(',');

describe('U7 non-square height (opt-in)', () => {
  test('default (height omitted or equal to width) is the same square map', () => {
    const a = Game.create({ seed: 1, width: 96, height: 96, townCount: 8, industryCount: 18 });
    const b = Game.create({ seed: 1, width: 96, townCount: 8, industryCount: 18 });
    expect(terrainKey(a)).toBe(terrainKey(b));
    expect(a.state.map.width * a.state.map.height).toBe(9216);
  });

  test('non-square 96x64 gives a 96x64 map with 6144 tiles', () => {
    const g = Game.create({ seed: 1, width: 96, height: 64, townCount: 8, industryCount: 18 });
    expect(g.state.map.width).toBe(96);
    expect(g.state.map.height).toBe(64);
    expect(g.state.map.tiles.length).toBe(6144);
  });

  test('town and industry counts are not scaled by area', () => {
    const g = Game.create({ seed: 1, width: 96, height: 64, townCount: 8, industryCount: 18 });
    expect(g.state.towns.length).toBe(8);
    expect(g.state.industries.length).toBe(18);
  });
});

describe('U8 water borders (none default, random from seed)', () => {
  test("'none' and absent are identical (default maps unchanged)", () => {
    const a = createMap(96, 96); generateTerrain(a, makeRng(1), { seed: 1 });
    const b = createMap(96, 96); generateTerrain(b, makeRng(1), { seed: 1, waterBorders: 'none' });
    expect(a.tiles.map((t) => t.terrain + t.height).join(',')).toBe(b.tiles.map((t) => t.terrain + t.height).join(','));
    expect(mapgenOptions({ waterBorders: 'none' })).toEqual({});
  });

  test("'random' is derived from the game seed: seed 1 -> north+south (mask 5)", () => {
    expect(waterBorderMask('random', 1)).toBe(5);
    expect(waterBorderMask('random', 2)).toBe(12);
    expect(waterBorderMask('random', 1)).toBe(waterBorderMask('random', 1));
  });

  test("'random' floods the top and bottom rows for seed 1 (north+south)", () => {
    const m = createMap(96, 96); generateTerrain(m, makeRng(1), { seed: 1, waterBorders: 'random' });
    const row = (y) => m.tiles.slice(y * 96, y * 96 + 96).filter((t) => t.terrain === 'water' && t.height === 0).length;
    expect(row(0)).toBe(96);
    expect(row(95)).toBe(96);
  });
});

describe('U9 New Game only (no Settings keys)', () => {
  test('the U7-U9 options (and the other D20 mapgen keys) are not Settings keys', () => {
    // townLayout is also a pre-existing setting (not a D20 item), so it is excluded here on purpose.
    for (const k of ['waterBorders', 'snowCoverage', 'desertCoverage', 'treePlacer', 'heightmapRotation']) {
      expect(k in MAPGEN_DEFAULTS).toBe(true);
      expect(k in DEFAULT_SETTINGS).toBe(false);
    }
  });

  test('U7/U8 defaults are stripped by mapgenOptions', () => {
    expect(mapgenOptions({ waterBorders: 'none', heightmapRotation: 'none' })).toEqual({});
    expect(mapgenOptions({ waterBorders: 'random' })).toEqual({ waterBorders: 'random' });
  });
});
