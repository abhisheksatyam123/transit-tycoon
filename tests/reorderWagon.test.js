import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { reorderWagon } from '../js/simulation/cmdVehicle.js';
import { Game } from '../js/simulation/game.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { wagonList } from '../js/simulation/consist.js';

function mixedTrain() {
  const g = flatGame();
  const L = coalLine(g);
  // Buy engine, then add wagons of different types to create a mixed consist
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 3, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  // Make it mixed: sell wagon at index 1 and add a coach
  expect(g.sellWagon(v.id, 1).ok).toBe(true);
  expect(g.addWagonModel(v.id, 'wag_coach').ok).toBe(true);
  // Now consist should be hopper, hopper, coach (order depends on impl) - normalize by reordering
  // wagonList gives current order; let's set up explicitly via reorder if needed
  return { g, L, v };
}

function train(wagons = 3) {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('reorderWagon (A1 CMD_MoveRailVehicle)', () => {
  test('reorders wagons within a consist', () => {
    const { g, v } = mixedTrain();
    const before = wagonList(v).map(w => w.modelId);
    expect(before.length).toBe(3);
    // Move last to front
    const r = g.reorderWagon(v.id, 2, 0);
    expect(r.ok).toBe(true);
    expect(r.fromIndex).toBe(2);
    expect(r.toIndex).toBe(0);
    expect(r.wagons).toBe(3);
    const after = wagonList(v).map(w => w.modelId);
    expect(after[0]).toBe(before[2]);
    expect(after[1]).toBe(before[0]);
    expect(after[2]).toBe(before[1]);
  });

  test('reorders middle wagon later', () => {
    const { g, v } = mixedTrain();
    const before = wagonList(v).map(w => w.modelId);
    const r = g.reorderWagon(v.id, 0, 2);
    expect(r.ok).toBe(true);
    const after = wagonList(v).map(w => w.modelId);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[2]);
    expect(after[2]).toBe(before[0]);
  });

  test('no-op when fromIndex equals toIndex', () => {
    const { g, v } = mixedTrain();
    const before = JSON.stringify(wagonList(v));
    const money = g.state.company.money;
    const r = g.reorderWagon(v.id, 1, 1);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(0);
    expect(JSON.stringify(wagonList(v))).toBe(before);
    expect(g.state.company.money).toBe(money);
  });

  test('invalid indices return errors', () => {
    const { g, v } = train(2);
    expect(g.reorderWagon(v.id, -1, 0).ok).toBe(false);
    expect(g.reorderWagon(v.id, 0, 5).ok).toBe(false);
    expect(g.reorderWagon(v.id, 2, 0).error).toMatch(/No such wagon/);
    expect(g.reorderWagon(v.id, 0.5, 0).ok).toBe(false);
    expect(g.reorderWagon('nope', 0, 1).ok).toBe(false);
  });

  test('refuses when not in depot, not a train, or rival owned', () => {
    const { g, v } = train(2);
    v.state = 'running';
    expect(g.reorderWagon(v.id, 0, 1).error).toMatch(/depot/);
    v.state = 'depot';
    // rival ownership via opts
    const r = reorderWagon(g.ctx, v.id, 0, 1, { owner: 999 });
    expect(r.ok).toBe(false);
    // non-train
    const bus = g.buyVehicle(g.state.depots[0].id, { modelId: 'bus_city' });
    if (bus.ok) {
      const br = g.reorderWagon(bus.vehicle.id, 0, 1);
      expect(br.ok).toBe(false);
      expect(br.error).toMatch(/Only trains/);
    }
  });

  test('dryRun does not mutate state', () => {
    const { g, v } = mixedTrain();
    const before = JSON.stringify(wagonList(v));
    const money = g.state.company.money;
    const r = g.reorderWagon(v.id, 0, 2, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.fromIndex).toBe(0);
    expect(r.toIndex).toBe(2);
    expect(r.cost).toBe(0);
    expect(JSON.stringify(wagonList(v))).toBe(before);
    expect(g.state.company.money).toBe(money);
  });

  test('save/load preserves reordered consist', () => {
    const { g, v } = mixedTrain();
    const before = wagonList(v).map(w => w.modelId);
    expect(g.reorderWagon(v.id, 2, 0).ok).toBe(true);
    const after = wagonList(v).map(w => w.modelId);
    expect(after[0]).toBe(before[2]);
    const g2 = Game.deserialize(g.serialize());
    const v2 = g2.state.vehicles.find(x => x.id === v.id);
    expect(wagonList(v2).map(w => w.modelId)).toEqual(after);
    expect(v2.wagons).toBe(v.wagons);
    expect(v2.capacity).toBe(v.capacity);
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('old saves without consist load and reorder works (uniform)', () => {
    const { g, v } = train(3);
    // uniform train has no v.consist
    expect(v.consist).toBeUndefined();
    const before = wagonList(v).map(w => w.modelId);
    const r = g.reorderWagon(v.id, 0, 2);
    expect(r.ok).toBe(true);
    // uniform same-model reorder keeps uniform semantics; setWagonList may collapse uniform
    const after = wagonList(v);
    expect(after.length).toBe(3);
    expect(v.wagons).toBe(3);
  });
});
