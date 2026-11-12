// U6: dialog-only heightmap height selector (1..7, default 7 = the historic full range).
import { test, expect, describe } from 'bun:test';
import {
  clampHeightmapLevels, greyToHeight, greyToHeights, heightsForMap, resampleGrey,
  HEIGHTMAP_LEVELS, HEIGHTMAP_ROTATIONS,
} from '../js/simulation/heightmap.js';
import { createMap, generateTerrainFromHeights } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game, MAPGEN_DEFAULTS, mapgenOptions } from '../js/simulation/game.js';

/** Left-to-right ramp: 0 (sea) .. 255 (peak). */
function ramp(w, h) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = Math.round(x * 255 / (w - 1));
  return g;
}

describe('clampHeightmapLevels', () => {
  test('keeps 1..7 and clamps/rounds everything else', () => {
    expect(clampHeightmapLevels(undefined)).toBe(HEIGHTMAP_LEVELS);
    expect(clampHeightmapLevels(7)).toBe(7);
    expect(clampHeightmapLevels(1)).toBe(1);
    expect(clampHeightmapLevels(0)).toBe(1);
    expect(clampHeightmapLevels(-5)).toBe(1);
    expect(clampHeightmapLevels(8)).toBe(7);
    expect(clampHeightmapLevels(3.4)).toBe(3);
    expect(clampHeightmapLevels(Number.NaN)).toBe(HEIGHTMAP_LEVELS);
  });
});

describe('heightsForMap height levels', () => {
  const w = 32, h = 8, grey = ramp(w, h);

  test('default is exactly 7 and byte-identical to the historic path', () => {
    const historic = greyToHeights(resampleGrey(grey, w, h, w, h));
    expect(Array.from(heightsForMap(grey, w, h, w, h))).toEqual(Array.from(historic));
    expect(Array.from(heightsForMap(grey, w, h, w, h, 'none', 7))).toEqual(Array.from(historic));
    expect(Array.from(heightsForMap(grey, w, h, w, h, 'none', 99))).toEqual(Array.from(historic));
  });

  test('compresses into 0..levels and stays monotone with the grey ramp', () => {
    for (let levels = 1; levels <= HEIGHTMAP_LEVELS; levels++) {
      const hs = heightsForMap(grey, w, h, w, h, 'none', levels);
      expect(hs[0]).toBe(0);
      expect(Math.max(...hs)).toBe(levels);
      for (let y = 0; y < h; y++) {
        for (let x = 1; x < w; x++) {
          expect(hs[y * w + x]).toBeGreaterThanOrEqual(hs[y * w + x - 1]);
        }
      }
    }
  });

  test('lower heights produce a shallower map (bounded)', () => {
    const full = heightsForMap(grey, w, h, w, h, 'none', 7);
    const low = heightsForMap(grey, w, h, w, h, 'none', 3);
    expect(Math.max(...low)).toBeLessThan(Math.max(...full));
    expect(Math.max(...low)).toBe(3);
    // every tile is at most the selected level and no taller than the 7-level import
    for (let i = 0; i < low.length; i++) {
      expect(low[i]).toBeLessThanOrEqual(3);
      expect(low[i]).toBeLessThanOrEqual(full[i]);
    }
  });

  test('rotation still applies after height scaling', () => {
    const base = heightsForMap(grey, w, h, w, h, 'none', 3);
    for (const rot of HEIGHTMAP_ROTATIONS) {
      const got = heightsForMap(grey, w, h, w, h, rot, 3);
      expect(got.length).toBe(base.length);
      expect(Math.max(...got)).toBe(3);
    }
  });

  test('greyToHeight remains the 0..levels rule', () => {
    expect(greyToHeight(0, 3)).toBe(0);
    expect(greyToHeight(255, 3)).toBe(3);
  });
});

describe('dialog-only: no mapgen/state key', () => {
  test('heightmapHeight is not a MAPGEN_DEFAULTS key and mapgenOptions drops it', () => {
    expect(Object.prototype.hasOwnProperty.call(MAPGEN_DEFAULTS, 'heightmapHeight')).toBe(false);
    expect(mapgenOptions({ heightmapHeight: 3 })).toEqual({});
  });

  test('Game.create with a height-scaled heightmap keeps no heightmap field', () => {
    const hm = heightsForMap(ramp(64, 64), 64, 64, 48, 48, 'none', 3);
    const game = Game.create({ seed: 9, width: 48, height: 48, townCount: 3, industryCount: 4, startYear: 1950, heightmap: hm });
    expect(game.state.map.tiles.length).toBe(48 * 48);
    expect(Object.keys(game.state).includes('heightmap')).toBe(false);
    expect(Math.max(...game.state.map.tiles.map((t) => t.height))).toBeLessThanOrEqual(3);
  });

  test('generateTerrainFromHeights stays within the selected ceiling', () => {
    const m = createMap(48, 48);
    generateTerrainFromHeights(m, makeRng(3), heightsForMap(ramp(64, 64), 64, 64, 48, 48, 'none', 3));
    expect(Math.max(...m.tiles.map((t) => t.height))).toBeLessThanOrEqual(3);
  });
});
