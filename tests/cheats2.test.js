/** Extra cheats: station rating fixed at 100%, no jet crash (cheats.js, loco/station.js, planeCrash.js). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { setCheatFlag, cheatFlag, stationRatingFixed, noJetCrash, isCheated, CHEAT_FLAGS } from '../js/simulation/cheats.js';
import { updateCargo } from '../js/simulation/loco/station.js';
import { crashChance } from '../js/simulation/planeCrash.js';
import { serializeState } from '../js/simulation/save.js';
import { TOOL_BUTTONS } from '../js/ui/toolbar.js';

describe('cheats2: flags are lazy, default off', () => {
  test('no flag on a fresh game: state.cheats absent and no cheat text in a save', () => {
    const g = flatGame(3);
    expect(g.state.cheats).toBeUndefined();
    expect(stationRatingFixed(g.state)).toBe(false);
    expect(noJetCrash(g.state)).toBe(false);
    expect(serializeState(g.state).includes('stationRating')).toBe(false);
  });

  test('turning a flag on marks the game cheated; off removes the key again', () => {
    const g = flatGame(3);
    setCheatFlag(g.state, 'stationRating', true);
    expect(cheatFlag(g.state, 'stationRating')).toBe(true);
    expect(isCheated(g.state)).toBe(true);
    setCheatFlag(g.state, 'stationRating', false);
    expect(g.state.cheats).toBeUndefined();
  });

  test('unknown flag is refused', () => {
    expect(setCheatFlag(flatGame(3).state, 'bogus', true).ok).toBe(false);
    expect(CHEAT_FLAGS).toEqual(['stationRating', 'noJetCrash']);
  });

  test('cheat buttons are not hotkeys or tool buttons (window-only cheats)', () => {
    expect(TOOL_BUTTONS.some((b) => /cheat/i.test(b[0]))).toBe(false);
  });
});

describe('station rating cheat', () => {
  // cargo rating target for a fresh player station: a fully served cargo drifts toward the top
  const station = (ownerId) => {
    const st = { lastPickup: { PASS: 0 }, rating: {}, rating200: {}, cargoAge: {}, pickupSeen: {}, lastSpeed: 0, kinds: { bus: true }, cargo: {}, ownerId };
    return st;
  };
  const game = (g) => ({ state: g.state, rng: g.rng });

  test('without the cheat a poor station stays below 100%', () => {
    const g = flatGame(4);
    const st = station(undefined);
    for (let d = 0; d < 5; d++) updateCargo(game(g), st);
    expect(st.rating.PASS).toBeLessThan(100);
  });

  test('with the cheat the player station rating is 100% (MAX_CARGO_RATING 200 = 100%)', () => {
    const g = flatGame(4);
    setCheatFlag(g.state, 'stationRating', true);
    const st = station(undefined);
    updateCargo(game(g), st);
    expect(st.rating200.PASS).toBe(200);
    expect(st.rating.PASS).toBe(100);
  });

  test('the cheat does not change AI-owned stations', () => {
    const g = flatGame(4);
    setCheatFlag(g.state, 'stationRating', true);
    const st = station(7);
    updateCargo(game(g), st);
    expect(st.rating200.PASS).toBeLessThan(200);
  });
});

describe('no jet crash cheat', () => {
  // a small (short-strip) airport tile at (10,10) and a jet vehicle model
  const setup = (cheat) => {
    const g = flatGame(4);
    g.state.settings = { ...(g.state.settings || {}), planeCrashes: 'reduced' };
    const tile = g.state.map.tiles[10 * g.state.map.width + 10];
    tile.building = { type: 'station', kind: 'airport', airportType: 'small', part: 'runway', dx: 0, dy: 0 };
    if (cheat) setCheatFlag(g.state, 'noJetCrash', true);
    return g;
  };
  const jet = { modelId: 'ac_tu104' };

  test('short-strip jet crash chance is the OpenTTD 3276 without the cheat', () => {
    const g = setup(false);
    expect(crashChance(g.state, jet, { x: 10, y: 10 })).toBe(3276);
  });

  test('with the cheat the jet uses the level formula (reduced: 0x4000 << 1 / 1500 = 21), not 3276', () => {
    const g = setup(true);
    expect(noJetCrash(g.state)).toBe(true);
    expect(crashChance(g.state, jet, { x: 10, y: 10 })).toBe(Math.floor((0x4000 << 1) / 1500));
  });

  test('no effect on a non-jet at a short strip', () => {
    const g = setup(true);
    const prop = { modelId: 'ac_tu104' };
    expect(crashChance(g.state, prop, { x: 10, y: 10 })).not.toBe(3276);
  });
});
