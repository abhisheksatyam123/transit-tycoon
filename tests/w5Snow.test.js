// W5: the mapgen snow line (New Game 'Snow line', state.mapgen.snowLine) drives generated snow terrain.
// Default (5, not stored) puts snow terrain at height >= 7, the historic hard-coded threshold; default maps are byte-identical.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, snowTerrainHeight } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { mapgenOptions, Game } from '../js/simulation/game.js';

const N = 96;
const H = (s) => new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);
const termSig = (m) => H(m.tiles.map((t) => t.height + t.terrain).join(','));
const gen = (seed, opts) => { const m = createMap(N, N); generateTerrain(m, makeRng(seed), opts); return m; };

describe('W5 snow line mapgen', () => {
  test('default terrain is identical to the pre-W5 generator (main 0ef8f63 hashes)', () => {
    // Captured by running the untouched main branch: generateTerrain(createMap(96,96), makeRng(seed), {}).
    const pinned = { 1: '846990cc2c31266d', 2: 'd58a0702c254ffdd', 3: '51717027ca95d6e0', 7: '096797ef9833d7af' };
    for (const seed of Object.keys(pinned)) expect(termSig(gen(Number(seed), {}))).toBe(pinned[seed]);
    // explicit default snow line is the same map as no option
    expect(termSig(gen(1, { snowLine: 5 }))).toBe(pinned[1]);
  });

  test('game seed 1 default terrain pin (snowRespread default on, D2 flip)', () => {
    const g = Game.create({ seed: 1 });
    expect(H(g.state.map.tiles.map((t) => t.height + t.terrain).join(','))).toBe('9618a7c0d47dc54c');
  });

  test('default mapping: snow from height 7', () => {
    expect(snowTerrainHeight(undefined)).toBe(7);
    expect(snowTerrainHeight(5)).toBe(7);
  });

  test('non-default snow line puts snow at the configured height and not below it', () => {
    for (const line of [3, 4]) {
      const m = gen(2, { snowLine: line });
      const at = snowTerrainHeight(line);
      const snow = m.tiles.filter((t) => t.terrain === 'snow');
      expect(snow.length).toBeGreaterThan(0);
      expect(Math.min(...snow.map((t) => t.height))).toBeGreaterThanOrEqual(at);
      // every non-water tile at or above the configured height is snow (snow overrides cover)
      const missed = m.tiles.filter((t) => t.height >= at && t.terrain !== 'water' && t.terrain !== 'snow');
      expect(missed.length).toBe(0);
      // heights themselves are not changed by the snow line
      expect(m.tiles.map((t) => t.height).join()).toBe(gen(2, {}).tiles.map((t) => t.height).join());
    }
  });

  test('a higher snow line gives no more snow (line 3 >= line 5 >= line 7)', () => {
    const count = (line) => gen(3, { snowLine: line }).tiles.filter((t) => t.terrain === 'snow').length;
    expect(count(3)).toBeGreaterThanOrEqual(count(5));
    expect(count(5)).toBeGreaterThanOrEqual(count(7));
    expect(count(7)).toBe(0); // line 7 -> snow from 9, above the top level
  });

  test('mapgenOptions keeps snowLine only when non-default', () => {
    expect(mapgenOptions({ snowLine: 5 })).toEqual({});
    expect(mapgenOptions({ snowLine: 3 })).toEqual({ snowLine: 3 });
  });
});
