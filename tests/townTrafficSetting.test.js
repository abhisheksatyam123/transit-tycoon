import { describe, it, expect } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { Game } from '../js/simulation/game.js';
import { trafficTick } from '../js/simulation/traffic.js';
import { serializeState, parseState } from '../js/simulation/save.js';

describe('townTraffic setting', () => {
  it('defaults to true in DEFAULT_SETTINGS and fresh state', () => {
    expect(DEFAULT_SETTINGS.townTraffic).toBe(true);
    const game = Game.create({ seed: 1 });
    expect(getSetting(game.state, 'townTraffic')).toBe(true);
  });

  it('when set to false, trafficTick clears existing cars and spawns 0 cars', () => {
    const game = Game.create({ seed: 1 });
    const ctx = { state: game.state };

    // Run a few ticks with default (true) to spawn cars
    for (let i = 0; i < 20; i++) {
      trafficTick(ctx);
    }
    expect(game.state.traffic.cars.length).toBeGreaterThan(0);

    // Turn setting off
    setSetting(game.state, 'townTraffic', false);
    expect(getSetting(game.state, 'townTraffic')).toBe(false);

    // Next tick should clear tr.cars and return immediately
    trafficTick(ctx);
    expect(game.state.traffic.cars.length).toBe(0);

    // Subsequent ticks should spawn no cars
    for (let i = 0; i < 20; i++) {
      trafficTick(ctx);
    }
    expect(game.state.traffic.cars.length).toBe(0);
  });

  it('when townTraffic is false, roads remain clear and simulation runs smoothly', () => {
    const game = Game.create({ seed: 1 });
    setSetting(game.state, 'townTraffic', false);

    // Run several days of simulation
    game.stepDays(5);

    expect(game.state.traffic.cars.length).toBe(0);
    expect(game.state.traffic.stats.congestedTiles).toBe(0);
  });

  it('save/load preserves townTraffic setting', () => {
    const game = Game.create({ seed: 1 });
    setSetting(game.state, 'townTraffic', false);
    expect(getSetting(game.state, 'townTraffic')).toBe(false);

    const serialized = serializeState(game.state);
    const loaded = parseState(serialized);
    expect(getSetting(loaded, 'townTraffic')).toBe(false);

    setSetting(game.state, 'townTraffic', true);
    const serialized2 = serializeState(game.state);
    const loaded2 = parseState(serialized2);
    expect(getSetting(loaded2, 'townTraffic')).toBe(true);
  });
});
