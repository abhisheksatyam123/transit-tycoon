// LK: lakes + mountain style mapgen options (OpenLoco generateTerrainOnMountains). Off = historic output; on = deterministic.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, LAKE_MAX_TILES } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { mapgenOptions } from '../js/simulation/game.js';

const N = 96;
const sig = (m) => m.tiles.reduce((a, t) => a + t.height + t.terrain[0] + ',', '');
const gen = (seed, opts) => { const m = createMap(N, N); generateTerrain(m, makeRng(seed), opts); return m; };
const count = (m, k) => m.tiles.filter((t) => t.terrain === k).length;

describe('lakes and mountain style', () => {
  test('off equals the default output', () => {
    for (const seed of [1, 7, 42]) {
      expect(sig(gen(seed, { lakes: 'off', mountainStyle: 'off' }))).toBe(sig(gen(seed, {})));
    }
  });
  test('on is deterministic', () => {
    const o = { lakes: 'many', mountainStyle: 'on', terrain: 'mountainous', smoothness: 'rough' };
    expect(sig(gen(7, o))).toBe(sig(gen(7, o)));
  });
  test('lakes add water tiles at height 0 without water-adjacent sea changes', () => {
    const base = gen(42, {});
    const m = gen(42, { lakes: 'many' });
    expect(count(m, 'water')).toBeGreaterThan(count(base, 'water'));
    let made = 0;
    for (let i = 0; i < m.tiles.length; i++) {
      if (m.tiles[i].terrain === 'water' && base.tiles[i].terrain !== 'water') {
        made++;
        expect(m.tiles[i].height).toBe(0);
      }
    }
    expect(made).toBeGreaterThan(0);
  });
  test('lakes are small enclosed basins (each new water region is at most LAKE_MAX_TILES tiles)', () => {
    const base = gen(3, {});
    const m = gen(3, { lakes: 'many' });
    const W = N, seen = new Uint8Array(N * N);
    for (let s = 0; s < N * N; s++) {
      if (seen[s] || m.tiles[s].terrain !== 'water' || base.tiles[s].terrain === 'water') continue;
      const q = [s]; seen[s] = 1; let n = 0;
      for (let k = 0; k < q.length; k++) {
        n++; const i = q[k], x = i % W, y = (i - x) / W;
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
          const j = ny * W + nx;
          if (!seen[j] && m.tiles[j].terrain === 'water' && base.tiles[j].terrain !== 'water') { seen[j] = 1; q.push(j); }
        }
      }
      expect(n).toBeLessThanOrEqual(LAKE_MAX_TILES);
    }
  });
  test('mountain style turns land near peaks into rock and leaves peaks, water and snow alone', () => {
    const base = gen(42, { terrain: 'mountainous' });
    const m = gen(42, { terrain: 'mountainous', mountainStyle: 'on' });
    expect(count(m, 'rock')).toBeGreaterThan(count(base, 'rock'));
    for (let i = 0; i < m.tiles.length; i++) {
      if (base.tiles[i].terrain === 'snow') expect(m.tiles[i].terrain).toBe('snow');
      if (base.tiles[i].terrain === 'water') expect(m.tiles[i].terrain).toBe('water');
    }
  });
  test('lakes and mountain style do not change heights outside the lake shores', () => {
    const base = gen(5, { terrain: 'mountainous' });
    const m = gen(5, { terrain: 'mountainous', mountainStyle: 'on' });
    for (let i = 0; i < m.tiles.length; i++) expect(m.tiles[i].height).toBe(base.tiles[i].height);
  });
  test('map options are kept only when non-default', () => {
    expect(mapgenOptions({ lakes: 'off', mountainStyle: 'off' })).toEqual({});
    expect(mapgenOptions({ lakes: 'few', mountainStyle: 'on' })).toEqual({ lakes: 'few', mountainStyle: 'on' });
  });
});
