import { describe, it, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { carCap } from '../js/simulation/traffic.js';
import { MAX_CARS, MAX_CARS_LIMIT, POP_PER_CAR_CAP, JAM_CONGESTED, CONGESTED_LOAD } from '../js/config/traffic.js';
import { checkTownRoads } from '../js/simulation/diagChecksMap.js';

describe('traffic jam metric and car cap', () => {
  it('jam array exists, is per tile and congestion thresholds are meaningful', () => {
    const game = Game.create({ seed: 3 });
    const tr = game.state.traffic;
    expect(tr.jam.length).toBe(game.state.map.width * game.state.map.height);
    expect(JAM_CONGESTED).toBeGreaterThan(0);
    expect(CONGESTED_LOAD).toBeGreaterThanOrEqual(1);
    expect(tr.stats.suppressedTotal).toBe(0);
  });

  it('car cap scales with population within bounds', () => {
    const state = { towns: [{ population: 0 }] };
    expect(carCap(state)).toBe(MAX_CARS);
    state.towns = [{ population: 100000 }];
    expect(carCap(state)).toBe(MAX_CARS_LIMIT);
    state.towns = [{ population: 9000 }];
    expect(carCap(state)).toBe(Math.max(MAX_CARS, Math.floor(9000 / POP_PER_CAR_CAP)));
  });

  it('town road check uses global connectivity (core pieces joined outside radius are not split)', () => {
    const game = Game.create({ seed: 7 });
    const s = game.state;
    // a town with road in its core is never split by a fresh generation
    const issues = checkTownRoads(s).filter((i) => i.id.startsWith('town-roads-split'));
    expect(issues.length).toBe(0);
  });
});
