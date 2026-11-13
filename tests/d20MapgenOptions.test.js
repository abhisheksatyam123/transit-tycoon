// D20 (U1-U5): opt-in coverage (snow/desert), tree placer and heightmap aspect. Defaults ('classic', 'none'
// absent, 'stretch') must reproduce the historic generator; each option is climate-scoped or seed-deterministic.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, coverageFraction, coverageLine, COVERAGE_PRESETS, TREE_PLACERS } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { resampleGreyFit, heightsForMap, HEIGHTMAP_ASPECTS } from '../js/simulation/heightmap.js';
import { MAPGEN_DEFAULTS, mapgenOptions } from '../js/simulation/game.js';
import { MAPGEN_PREF_VALUES } from '../js/ui/newGamePrefs.js';

const SIZE = 96;
function gen(seed, opts = {}, w = SIZE, h = SIZE) {
  const m = createMap(w, h);
  generateTerrain(m, makeRng(seed), { seed, ...opts });
  return m;
}
function shares(m) {
  const out = {};
  for (const t of m.tiles) out[t.terrain] = (out[t.terrain] || 0) + 1;
  for (const k of Object.keys(out)) out[k] /= m.tiles.length;
  return out;
}
const terrains = (m) => m.tiles.map((t) => t.terrain).join(',');

describe('defaults stay stripped and historic', () => {
  test('new mapgen keys default to classic and are dropped by mapgenOptions', () => {
    expect(MAPGEN_DEFAULTS.snowCoverage).toBe('classic');
    expect(MAPGEN_DEFAULTS.desertCoverage).toBe('classic');
    expect(MAPGEN_DEFAULTS.treePlacer).toBe('classic');
    expect(mapgenOptions(MAPGEN_DEFAULTS)).toEqual({});
    expect(mapgenOptions({ snowCoverage: 'max' })).toEqual({ snowCoverage: 'max' });
  });
  test('explicit classic options give the same terrain as no options', () => {
    const base = gen(1);
    const explicit = gen(1, { snowCoverage: 'classic', desertCoverage: 'classic', treePlacer: 'classic', climate: 'arctic' });
    expect(terrains(explicit)).toBe(terrains(base));
  });
  test('coverage options outside their own climate change nothing', () => {
    const base = gen(2);
    expect(terrains(gen(2, { snowCoverage: 'max' }))).toBe(terrains(base)); // temperate: snow scope is arctic only
    expect(terrains(gen(2, { desertCoverage: 'max' }))).toBe(terrains(base)); // temperate: desert scope is tropic only
  });
});

describe('coverage helpers (U1-U3)', () => {
  test('coverageFraction: presets, raw numbers, classic/unknown -> null', () => {
    expect(coverageFraction('classic')).toBeNull();
    expect(coverageFraction('nope')).toBeNull();
    expect(coverageFraction(undefined)).toBeNull();
    expect(coverageFraction('high')).toBe(COVERAGE_PRESETS.high);
    expect(coverageFraction(50)).toBeCloseTo(0.5);
    expect(coverageFraction('250')).toBe(1);
  });
  test('coverageLine picks the level closest to the goal', () => {
    // 100 land tiles: 50 at height 1, 30 at height 3, 20 at height 6
    const counts = [0, 50, 0, 30, 0, 0, 20, 0];
    expect(coverageLine(counts, 0)).toBe(8); // nothing covered
    expect(coverageLine(counts, 0.2)).toBe(6); // 20 tiles >= 6
    expect(coverageLine(counts, 0.5)).toBe(3); // 50 tiles >= 3
    expect(coverageLine(counts, 1)).toBe(1); // every land tile
  });
});

describe('U1-U3 coverage in the generator', () => {
  test('arctic snowCoverage raises snow terrain above the classic share', () => {
    const classic = shares(gen(3, { climate: 'arctic' }));
    const high = shares(gen(3, { climate: 'arctic', snowCoverage: 'high' }));
    expect(high.snow || 0).toBeGreaterThan(classic.snow || 0);
  });
  test('tropic desertCoverage raises desert terrain above the classic share', () => {
    const classic = shares(gen(4, { climate: 'tropic' }));
    const high = shares(gen(4, { climate: 'tropic', desertCoverage: 'high' }));
    expect(high.desert || 0).toBeGreaterThan(classic.desert || 0);
    expect(high.desert).toBeGreaterThan(0.3);
  });
  test('coverage output is deterministic per seed', () => {
    expect(terrains(gen(5, { climate: 'tropic', desertCoverage: 'medium' })))
      .toBe(terrains(gen(5, { climate: 'tropic', desertCoverage: 'medium' })));
  });
});

describe('U4 tree placer', () => {
  test('TREE_PLACERS lists the four modes', () => {
    expect(TREE_PLACERS).toEqual(['classic', 'none', 'original', 'improved']);
  });
  test('none places no forest and leaves heights and water untouched', () => {
    const classic = gen(6);
    const none = gen(6, { treePlacer: 'none' });
    expect(none.tiles.some((t) => t.terrain === 'forest')).toBe(false);
    classic.tiles.forEach((t, i) => {
      expect(none.tiles[i].height).toBe(t.height);
      if (t.terrain === 'water') expect(none.tiles[i].terrain).toBe('water');
    });
  });
  test('original and improved keep roughly the classic forest count and are deterministic', () => {
    const forestOf = (m) => m.tiles.filter((t) => t.terrain === 'forest').length;
    const classicCount = forestOf(gen(7));
    for (const placer of ['original', 'improved']) {
      const a = gen(7, { treePlacer: placer });
      expect(terrains(a)).toBe(terrains(gen(7, { treePlacer: placer })));
      const n = forestOf(a);
      expect(n).toBeGreaterThan(classicCount * 0.8);
      expect(n).toBeLessThanOrEqual(classicCount + 1);
    }
  });
});

describe('U5 heightmap aspect fit', () => {
  test('HEIGHTMAP_ASPECTS lists stretch and fit', () => {
    expect(HEIGHTMAP_ASPECTS).toEqual(['stretch', 'fit']);
  });
  test('fit keeps a 2:1 image in the middle and pads the rest with sea', () => {
    const grey = new Uint8Array(4 * 2).fill(255); // 4 wide, 2 tall
    const out = resampleGreyFit(grey, 4, 2, 4, 4);
    // scale 1: the image occupies rows 1..2 (centred), rows 0 and 3 are padding
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(out.slice(4, 8))).toEqual([255, 255, 255, 255]);
    expect(Array.from(out.slice(12, 16))).toEqual([0, 0, 0, 0]);
  });
  test('default stretch path is unchanged and fit differs for non-square images', () => {
    const grey = new Uint8Array(8 * 2);
    for (let i = 0; i < grey.length; i++) grey[i] = (i * 37) % 256;
    const stretch = heightsForMap(grey, 8, 2, 8, 8);
    expect(Array.from(stretch)).toEqual(Array.from(heightsForMap(grey, 8, 2, 8, 8, 'none', 7, 'stretch')));
    expect(Array.from(heightsForMap(grey, 8, 2, 8, 8, 'none', 7, 'fit'))).not.toEqual(Array.from(stretch));
    const sq = new Uint8Array(64).map((_, k) => (k * 29) % 256);
    expect(Array.from(heightsForMap(sq, 8, 8, 8, 8, 'none', 7, 'fit'))).toEqual(Array.from(heightsForMap(sq, 8, 8, 8, 8)));
  });
});

describe('preferences accept the new values', () => {
  test('MAPGEN_PREF_VALUES lists each new option value', () => {
    expect(MAPGEN_PREF_VALUES.snowCoverage).toEqual(['classic', 'low', 'medium', 'high', 'max']);
    expect(MAPGEN_PREF_VALUES.desertCoverage).toEqual(['classic', 'low', 'medium', 'high', 'max']);
    expect(MAPGEN_PREF_VALUES.treePlacer).toEqual(['classic', 'none', 'original', 'improved']);
  });
});
