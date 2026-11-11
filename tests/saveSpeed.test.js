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
    // Robust statistic instead of a single worst-case bound. The old `maxSliceMs < 40` flaked under load:
    // the OS preempts the process mid-slice, so one slice can hit ~80-130 ms although the code is fine.
    // Measured on this fixture (moscow, 5 game days, ~18 slices): alone max 15-21 ms, median slice ~8.2 ms;
    // 4 parallel copies: max 20-79 ms, median 8.2-8.8 ms, mean (totalMs/slices, yields included) <= 14.7 ms.
    // So: the mean wall time per slice must stay under 40 ms (catches a sustained regression), and no single
    // slice may exceed the hard limit 250 ms (catches one long blocking slice; a real regression runs hundreds
    // of ms). The limit is the floor of 250 ms: 3x the worst loaded max is ~240 ms, and it must stay below the
    // 300 ms regression probe.
    expect(stats.totalMs / stats.slices).toBeLessThan(40);
    expect(stats.maxSliceMs).toBeLessThan(250);
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
