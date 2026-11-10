import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';

// Legacy scenario format: tiles compacted by dropping default-valued fields (pre tiles-rle-v1 saves).
const TILE_DEFAULTS = { terrain: 'grass', height: 0, rail: 0, road: 0, building: null, owner: null };
function toLegacy(state) {
  const legacy = JSON.parse(JSON.stringify(state));
  legacy.map.tiles = legacy.map.tiles.map((t) => {
    const o = {};
    for (const k of Object.keys(t)) if (!(k in TILE_DEFAULTS) || t[k] !== TILE_DEFAULTS[k]) o[k] = t[k];
    return o;
  });
  return legacy;
}

describe('save format', () => {
  const game = Game.create({ scenario: 'moscow', seed: 1 });
  const state = game.state;

  test('scenario (Moscow-like) round-trip is exact', () => {
    const str = serializeState(state);
    const back = parseState(str);
    expect(JSON.stringify(back)).toBe(JSON.stringify(state));
    expect(back.map.tiles.length).toBe(state.map.tiles.length);
  });

  test('scenario save is much smaller than the classic JSON', () => {
    expect(serializeState(state).length).toBeLessThan(JSON.stringify(state).length / 3);
  });

  test('every loaded tile is a fresh object', () => {
    const back = parseState(serializeState(state));
    expect(new Set(back.map.tiles).size).toBe(back.map.tiles.length);
    back.map.tiles[0].road = 999;
    expect(back.map.tiles[1].road).not.toBe(999);
  });

  test('loads the previous compact scenario format (defaults omitted)', () => {
    // Smaller 64x64 random map: the compact-format property does not depend on the 384x384 Moscow tiles,
    // and stringifying/parsing those dominated this test's run time.
    const small = Game.create({ seed: 2, width: 64, height: 64, townCount: 3, industryCount: 4 }).state;
    const back = parseState(toLegacy(small));
    expect(JSON.stringify(back.map.tiles)).toBe(JSON.stringify(small.map.tiles));
  });

  test('loads the classic (random world) format', () => {
    const rnd = Game.create({ seed: 2 }).state;
    const back = parseState(serializeState(rnd));
    expect(serializeState(rnd)).toBe(JSON.stringify(rnd));
    expect(JSON.stringify(back)).toBe(JSON.stringify(rnd));
  });
  test('packed traffic cars and station parcels round-trip exactly (scratch fields dropped)', () => {
    const g = Game.create({ scenario: 'moscow', seed: 1 });
    g.stepDays(5);
    expect(g.state.traffic.cars.length).toBeGreaterThan(0);
    const st = g.state;
    const back = parseState(serializeState(st));
    const strip = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => k[0] !== '_'));
    expect(JSON.stringify(back.traffic.cars)).toBe(JSON.stringify(st.traffic.cars.map(strip)));
    expect(JSON.stringify(back.stations)).toBe(JSON.stringify(st.stations));
  }, 30000);

  test('plain (unpacked) cars and parcels still load', () => {
    const g = Game.create({ scenario: 'moscow', seed: 1 });
    const legacy = JSON.parse(serializeState(g.state));
    expect(parseState(JSON.stringify(legacy)).stations.length).toBe(g.state.stations.length);
    legacy.traffic.cars = [{ id: 1, townId: 0, path: [3, 4, 5], i: 0, t: 0, speed: 0.1, wait: 0, born: 0, kind: 'car', color: 2 }];
    const back = parseState(JSON.stringify(legacy));
    expect(back.traffic.cars[0].path).toEqual([3, 4, 5]);
  }, 30000);
});
