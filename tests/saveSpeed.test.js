// SV: the time-sliced async save must produce exactly the same string as the synchronous serializer.
import { describe, test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, serializeStateAsync } from '../js/simulation/save.js';

describe('time-sliced save', () => {
  test('async output === sync output on a small random world', async () => {
    const g = Game.create({ seed: 1 });
    g.stepDays(20);
    const sync = serializeState(g.state);
    const async = await serializeStateAsync(g.state);
    expect(async).toBe(sync);
  });

  test('async output === sync output on a scenario world with traffic and vehicles', async () => {
    const { loadMoscowData } = await import('../js/simulation/scenarios/moscowRegistry.js');
    await loadMoscowData();
    const g = Game.create({ seed: 1, scenario: 'moscow' });
    g.stepDays(5);
    expect(g.state.traffic.cars.length).toBeGreaterThan(0);
    const sync = serializeState(g.state);
    const stats = {};
    const async = await serializeStateAsync(g.state, stats);
    expect(async).toBe(sync);
    expect(stats.slices).toBeGreaterThan(1);
  }, 60000);

  test('a slice never runs far beyond its budget between yields', async () => {
    const { loadMoscowData } = await import('../js/simulation/scenarios/moscowRegistry.js');
    await loadMoscowData();
    const g = Game.create({ seed: 1, scenario: 'moscow' });
    g.stepDays(5);
    const stats = {};
    await serializeStateAsync(g.state, stats);
    expect(stats.maxSliceMs).toBeLessThan(40); // generous: CI noise; bun measures ~8 ms
  }, 60000);
});

describe('streamed save', () => {
  test('streamed chunks concatenate to the sync string; every chunk <= 512 KB', async () => {
    const { loadMoscowData } = await import('../js/simulation/scenarios/moscowRegistry.js');
    await loadMoscowData();
    const g = Game.create({ seed: 1, scenario: 'moscow' });
    g.stepDays(5);
    const sync = serializeState(g.state);
    const parts = [];
    const n = await serializeStateAsync(g.state, {}, (c) => parts.push(c));
    expect(parts.join('')).toBe(sync);
    expect(n).toBe(sync.length);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(512 * 1024);
  }, 60000);
});

describe('save hold', () => {
  test('the loop holds ticks while a sliced save is in progress', async () => {
    const { beginSaveHold, endSaveHold, saveHeld } = await import('../js/simulation/saveHold.js');
    expect(saveHeld()).toBe(false);
    beginSaveHold();
    try { expect(saveHeld()).toBe(true); } finally { endSaveHold(); }
    expect(saveHeld()).toBe(false);
  });
});
