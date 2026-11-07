// VD: variety distribution mapgen option (OpenTTD tgp.cpp HeightMapCurves). 0 = historic heights; 1..5 reshape the height distribution, deterministic per seed.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { mapgenOptions } from '../js/simulation/game.js';

const N = 96;
const gen = (seed, opts) => { const m = createMap(N, N); generateTerrain(m, makeRng(seed), opts); return m; };
const heights = (m) => m.tiles.map((t) => t.height).join(',');
const hist = (m) => { const h = new Array(8).fill(0); for (const t of m.tiles) h[t.height]++; return h; };

describe('variety distribution option', () => {
  test('variety 0 equals the historic heights (no option and explicit 0)', () => {
    for (const seed of [1, 7, 42]) {
      expect(heights(gen(seed, {}))).toBe(heights(gen(seed, { variety: 0 })));
    }
  });
  test('variety > 0 changes the height distribution', () => {
    const base = hist(gen(3, {}));
    for (const v of [1, 3, 5]) expect(hist(gen(3, { variety: v }))).not.toEqual(base);
  });
  test('variety is deterministic per seed and differs across seeds', () => {
    expect(heights(gen(9, { variety: 4 }))).toBe(heights(gen(9, { variety: 4 })));
    expect(heights(gen(9, { variety: 4 }))).not.toBe(heights(gen(10, { variety: 4 })));
  });
  test('heights stay within 0..7', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      const m = gen(5, { variety: v });
      for (const t of m.tiles) { expect(t.height).toBeGreaterThanOrEqual(0); expect(t.height).toBeLessThanOrEqual(7); }
    }
  });
  test('mapgenOptions keeps variety only when non-default', () => {
    expect(mapgenOptions({ variety: 0 })).toEqual({});
    expect(mapgenOptions({ variety: 3 })).toEqual({ variety: 3 });
  });
});
