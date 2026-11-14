// Opt-in snow re-spread (decision D2, setting snowRespread, default false): terrain snow starts at the
// snow line itself (height snowLine + 0) instead of snowLine + 2. Default off keeps the W5 pins unchanged.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, snowTerrainHeight } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';

const N = 96;
const H = (s) => new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);
const termSig = (m) => H(m.tiles.map((t) => t.height + t.terrain).join(','));
const gen = (seed, opts) => { const m = createMap(N, N); generateTerrain(m, makeRng(seed), opts); return m; };

describe('snowRespread (D2, opt-in)', () => {
  test('(a) default off: seed-1 terrain equals the existing W5 pin', () => {
    expect(termSig(gen(1, {}))).toBe('846990cc2c31266d');
    expect(termSig(gen(1, { snowRespread: false }))).toBe('846990cc2c31266d');
    expect(H(Game.create({ seed: 1 }).state.map.tiles.map((t) => t.height + t.terrain).join(','))).toBe('f692b5165f1fdc21');
  });

  test('(b) on: snow threshold is the snow line (5) and tiles at that height become snow', () => {
    expect(snowTerrainHeight(5, true)).toBe(5);
    expect(snowTerrainHeight(undefined, true)).toBe(5);
    expect(snowTerrainHeight(3, true)).toBe(3);
    expect(snowTerrainHeight(5, false)).toBe(7);
    const m = gen(1, { snowRespread: true });
    const snow = m.tiles.filter((t) => t.terrain === 'snow');
    expect(snow.length).toBeGreaterThan(gen(1, {}).tiles.filter((t) => t.terrain === 'snow').length);
    expect(Math.min(...snow.map((t) => t.height))).toBe(5);
    expect(snow.some((t) => t.height === 5)).toBe(true);
    expect(snow.some((t) => t.height === 6)).toBe(true);
    // the new terrain does not change heights
    expect(m.tiles.map((t) => t.height).join(',')).toBe(gen(1, {}).tiles.map((t) => t.height).join(','));
  });

  test('(b) on via game settings: state carries the setting and the map is re-spread', () => {
    const g = Game.create({ seed: 1, settings: { snowRespread: true } });
    expect(getSetting(g.state, 'snowRespread')).toBe(true);
    const snow = g.state.map.tiles.filter((t) => t.terrain === 'snow');
    expect(Math.min(...snow.map((t) => t.height))).toBe(5);
  });

  test('(c) setting defaults to false', () => {
    expect(DEFAULT_SETTINGS.snowRespread).toBe(false);
    expect(getSetting(Game.create({ seed: 1 }).state, 'snowRespread')).toBe(false);
  });
});
