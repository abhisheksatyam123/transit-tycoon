/** Timetable edits: change/clear wait + travel time and per-order speed limit (single, bulk, shared), movement cap. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';

function setup(n = 2) {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const orders = [{ stationId: L.a.id, full: false }, { stationId: L.b.id }];
  expect(g.setOrders(v.id, orders.slice(0, n)).ok).toBe(true);
  return { g, L, v };
}

describe('changeOrderTimes', () => {
  test('sets and clears wait and travel time of one order', () => {
    const { g, v } = setup();
    expect(g.changeOrderTimes(v.id, 1, { waitDays: 2, travelDays: 3 }).ok).toBe(true);
    expect(v.orders[1].waitDays).toBe(2);
    expect(v.orders[1].travelDays).toBe(3);
    expect(v.orders[0].waitDays).toBeUndefined();
    expect(g.changeOrderTimes(v.id, 1, { waitDays: null }).ok).toBe(true);
    expect(v.orders[1].waitDays).toBeUndefined();
    expect(v.orders[1].travelDays).toBe(3);
    expect(g.changeOrderTimes(v.id, 1, { waitDays: null, travelDays: null }).ok).toBe(true);
    expect(v.orders[1].travelDays).toBeUndefined();
  });

  test("'all' applies to every order (bulk clear)", () => {
    const { g, v } = setup();
    g.changeOrderTimes(v.id, 0, { waitDays: 1, travelDays: 1 });
    g.changeOrderTimes(v.id, 1, { waitDays: 4, travelDays: 5 });
    const r = g.changeOrderTimes(v.id, 'all', { waitDays: null, travelDays: null });
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(v.orders.every((o) => o.waitDays === undefined && o.travelDays === undefined)).toBe(true);
  });

  test('bulk set of wait days hits all orders', () => {
    const { g, v } = setup();
    expect(g.changeOrderTimes(v.id, 'all', { waitDays: 3 }).ok).toBe(true);
    expect(v.orders.map((o) => o.waitDays)).toEqual([3, 3]);
  });

  test('shared orders: change applies to every member', () => {
    const { g, v, L } = setup();
    const r2 = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    const w = r2.vehicle;
    g.setOrders(w.id, v.orders.map((o) => ({ ...o })));
    v.orderGroup = 7; w.orderGroup = 7;
    expect(g.changeOrderTimes(v.id, 1, { travelDays: 6 }).ok).toBe(true);
    expect(w.orders[1].travelDays).toBe(6);
    expect(g.changeOrderTimes(w.id, 'all', { waitDays: null, travelDays: null }).ok).toBe(true);
    expect(v.orders[1].travelDays).toBeUndefined();
  });

  test('rejects bad values, unknown vehicle/order, and an empty patch', () => {
    const { g, v } = setup();
    expect(g.changeOrderTimes(v.id, 0, { waitDays: -1 }).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 0, { travelDays: 999 }).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 9, { waitDays: 1 }).ok).toBe(false);
    expect(g.changeOrderTimes(999999, 0, { waitDays: 1 }).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 0, {}).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 0, { maxSpeed: 0.5 * 0 - 3 }).ok).toBe(false);
  });

  test('speed limit: set, clear one, clear all (shared)', () => {
    const { g, v } = setup();
    expect(g.changeOrderTimes(v.id, 0, { maxSpeed: 40 }).ok).toBe(true);
    expect(v.orders[0].maxSpeed).toBe(40);
    expect(v.orders[1].maxSpeed).toBeUndefined();
    expect(g.changeOrderTimes(v.id, 'all', { maxSpeed: 60 }).ok).toBe(true);
    expect(v.orders.map((o) => o.maxSpeed)).toEqual([60, 60]);
    expect(g.changeOrderTimes(v.id, 1, { maxSpeed: null }).ok).toBe(true);
    expect(v.orders[1].maxSpeed).toBeUndefined();
    expect(g.changeOrderTimes(v.id, 'all', { maxSpeed: null }).ok).toBe(true);
    expect(v.orders.every((o) => o.maxSpeed === undefined)).toBe(true);
  });

  test('speed limit survives modifyOrder and save/load round trip', () => {
    const { g, v } = setup();
    g.changeOrderTimes(v.id, 1, { maxSpeed: 50, waitDays: 1 });
    expect(g.modifyOrder(v.id, 1, { unload: 'all' }).ok).toBe(true);
    expect(v.orders[1].maxSpeed).toBe(50);
    const st = parseState(serializeState(g.state));
    const w = st.vehicles.find((x) => x.id === v.id);
    expect(w.orders[1].maxSpeed).toBe(50);
    expect(w.orders[1].waitDays).toBe(1);
    expect(w.orders[0].maxSpeed).toBeUndefined();
  });

  test('speed-limit cap: train speed while heading to the limited order stays under the cap; uncapped runs faster', () => {
    const run = (cap) => {
      const { g, v } = setup();
      if (cap) expect(g.changeOrderTimes(v.id, 1, { maxSpeed: cap }).ok).toBe(true);
      expect(g.startVehicle(v.id).ok).toBe(true);
      let peakTowards = 0;
      for (let t = 0; t < 1500; t++) {
        g.step();
        if (v.state === 'running' && v.orderIndex === 1) peakTowards = Math.max(peakTowards, v.speed);
      }
      return peakTowards;
    };
    const capped = run(12);
    const free = run(0);
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThanOrEqual(12 * KMH_TO_TILES_PER_TICK + 1e-9);
    expect(free).toBeGreaterThan(capped);
  });
});
