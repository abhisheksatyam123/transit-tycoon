/** Block signals (T3b, signals.js + movement.js signalBlocker): build/remove/cost, blocks, head-on waiting. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { blockIndex } from '../js/simulation/signals.js';

function trackGame() {
  const g = flatGame(7);
  expect(g.buildRail(20, 24, 50, 24).ok).toBe(true);
  return g;
}

describe('signal build and remove', () => {
  test('build on straight track, cost, refusals, remove refunds and clears', () => {
    const g = trackGame();
    const s = g.state;
    const before = s.company.money;
    const r = g.buildSignal(30, 24);
    expect(r.ok).toBe(true);
    expect(s.map.tiles[24 * s.map.width + 30].signal).toBe(1);
    expect(s.company.money).toBeLessThan(before);
    expect(g.buildSignal(30, 24).ok).toBe(false); // already has one
    expect(g.buildSignal(30, 20).ok).toBe(false); // no rail
    expect(g.buildSignal(-1, 24).ok).toBe(false);
    // junction: add a crossing branch north at x=35
    expect(g.buildRail(35, 22, 35, 23).ok).toBe(true);
    expect(g.buildSignal(35, 24).ok).toBe(false);
    const rm = g.removeSignal(30, 24);
    expect(rm.ok).toBe(true);
    expect(s.map.tiles[24 * s.map.width + 30].signal).toBeUndefined();
    expect(g.removeSignal(30, 24).ok).toBe(false);
  });

  test('dry run prices without changing state', () => {
    const g = trackGame();
    const r = g.buildSignal(30, 24, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.map.tiles[24 * g.state.map.width + 30].signal).toBeUndefined();
  });

  test('demolishing the track removes the signal too', () => {
    const g = trackGame();
    g.buildSignal(30, 24);
    expect(g.demolish(30, 24, 30, 24).ok).toBe(true);
    expect(g.state.map.tiles[24 * g.state.map.width + 30].signal).toBeUndefined();
  });

  test('saves without signals carry no signal field (unchanged format)', () => {
    const g = trackGame();
    expect(g.serialize()).not.toContain('"signal"');
  });
});

describe('blocks', () => {
  test('a signal splits the line into two blocks; unsignalled line has none', () => {
    const g = trackGame();
    expect(blockIndex(g.state)).toBe(null);
    g.buildSignal(30, 24);
    const idx = blockIndex(g.state);
    const W = g.state.map.width;
    const a = idx.blockOf[24 * W + 25], b = idx.blockOf[24 * W + 35];
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(a).not.toBe(b);
    expect(idx.blockOf[24 * W + 30]).toBe(-1);
  });
});

/** Single-track line with a passing loop (siding) between two stations, signals on both approaches. */
function headOnWorld(withSignals) {
  const g = flatGame(19);
  const L = coalLine(g); // stations at (10..12,24) and (40..42,24), line 13..39 along y=24
  if (withSignals) {
    expect(g.buildSignal(30, 24).ok).toBe(true);
    expect(g.buildSignal(22, 24).ok).toBe(true);
  }
  const mk = (order) => {
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, order.map((s) => ({ stationId: s === 'a' ? L.a.id : L.b.id, full: false }))).ok).toBe(true);
    return r.vehicle;
  };
  return { g, east: mk(['b', 'a']), west: mk(['a', 'b']) };
}

describe('head-on trains with signals', () => {
  test('both head-on trains arrive; no train newly enters a block another train occupies', () => {
    const { g, east, west } = headOnWorld(true);
    expect(g.startVehicle(east.id).ok).toBe(true);
    expect(g.startVehicle(west.id).ok).toBe(true);
    const W = g.state.map.width;
    const blocksOf = (v) => {
      const idx = blockIndex(g.state);
      const out = new Set();
      for (const c of v.history) { const b = idx.blockOf[c.y * W + c.x]; if (b >= 0 && idx.bounded.has(b)) out.add(b); }
      return out;
    };
    let prev = new Map([[east, blocksOf(east)], [west, blocksOf(west)]]);
    let eastDone = false, westDone = false, violations = 0;
    for (let i = 0; i < 40 * 96 && !(eastDone && westDone); i++) {
      g.step();
      if (east.atStationId) eastDone = true;
      if (west.atStationId) westDone = true;
      for (const [v, other] of [[east, west], [west, east]]) {
        const now = blocksOf(v), was = prev.get(v), theirs = blocksOf(other);
        for (const b of now) if (!was.has(b) && theirs.has(b)) violations++;
        prev.set(v, now);
      }
    }
    expect(violations).toBe(0);
    expect(eastDone && westDone).toBe(true);
  });

  test('save/load mid-wait gives identical continuation', () => {
    const { g, east, west } = headOnWorld(true);
    g.startVehicle(east.id); g.startVehicle(west.id);
    for (let i = 0; i < 500; i++) g.step();
    const g2 = Game.deserialize(g.serialize());
    for (let i = 0; i < 1200; i++) { g.step(); g2.step(); }
    expect(g2.serialize()).toBe(g.serialize());
  });
});
