// CF: cliffs mapgen option (OpenLoco generateTerrainAroundCliffs). Off = historic output; on = deterministic, steps capped at 4.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, CLIFF_SLOPE_CAP } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { mapgenOptions } from '../js/simulation/game.js';

const N = 96;
const sig = (m) => m.tiles.reduce((a, t) => a + t.height + t.terrain[0] + ',', '');
const gen = (seed, opts) => { const m = createMap(N, N); generateTerrain(m, makeRng(seed), opts); return m; };
function maxStep(m) {
  let mx = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = m.tiles[y * N + x].height;
    if (x + 1 < N) mx = Math.max(mx, Math.abs(m.tiles[y * N + x + 1].height - h));
    if (y + 1 < N) mx = Math.max(mx, Math.abs(m.tiles[(y + 1) * N + x].height - h));
  }
  return mx;
}

describe('cliffs option', () => {
  test('off equals the default output', () => {
    for (const seed of [1, 7, 42]) expect(sig(gen(seed, { cliffs: 'off' }))).toBe(sig(gen(seed, {})));
  });
  test('on is deterministic', () => {
    expect(sig(gen(7, { cliffs: 'on', terrain: 'mountainous', smoothness: 'rough' })))
      .toBe(sig(gen(7, { cliffs: 'on', terrain: 'mountainous', smoothness: 'rough' })));
  });
  test('on caps neighbour steps at CLIFF_SLOPE_CAP and default stays at 1', () => {
    const m = gen(7, { cliffs: 'on', terrain: 'mountainous', smoothness: 'rough' });
    expect(maxStep(m)).toBeLessThanOrEqual(CLIFF_SLOPE_CAP);
    expect(maxStep(gen(7, {}))).toBeLessThanOrEqual(3);
  });
  test('on marks rock where a steep step exists', () => {
    const rock = (m) => m.tiles.filter((t) => t.terrain === 'rock').length;
    const off = gen(7, { terrain: 'mountainous', smoothness: 'rough' });
    const on = gen(7, { cliffs: 'on', terrain: 'mountainous', smoothness: 'rough' });
    expect(rock(on)).toBeGreaterThan(rock(off));
  });
  test('mapgenOptions keeps cliffs only when on', () => {
    expect(mapgenOptions({ cliffs: 'off' }).cliffs).toBeUndefined();
    expect(mapgenOptions({ cliffs: 'on' }).cliffs).toBe('on');
  });
});
