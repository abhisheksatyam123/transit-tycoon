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
    const back = parseState(toLegacy(state));
    expect(JSON.stringify(back.map.tiles)).toBe(JSON.stringify(state.map.tiles));
  });

  test('loads the classic (random world) format', () => {
    const rnd = Game.create({ seed: 2 }).state;
    const back = parseState(serializeState(rnd));
    expect(serializeState(rnd)).toBe(JSON.stringify(rnd));
    expect(JSON.stringify(back)).toBe(JSON.stringify(rnd));
  });
});
