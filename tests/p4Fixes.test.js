/** P4 playtest fixes: single-station full load, parcel merge/cap, depot auto-orient helper. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { loadingTick, distinctOrderStations } from '../js/simulation/orders.js';
import { addWaiting, waitingAmount, MAX_PARCELS } from '../js/simulation/stations.js';
import { autoDepotDir } from '../js/ui/tools/depot.js';

function setup(orders) {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, orders(L)).ok).toBe(true);
  return { g, L, v: r.vehicle, ctx: { state: g.state, emit() {} } };
}

describe('full load with fewer than 2 distinct stations', () => {
  test('single-station full-load vehicle departs instead of waiting forever', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: true }]);
    expect(distinctOrderStations(v)).toBe(1);
    v.atStationId = L.a.id;
    v.loadingTicks = 1;
    v.state = 'loading';
    expect(loadingTick(ctx, v)).toBe(true);
  });
  test('two-station full-load vehicle still waits', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
    expect(distinctOrderStations(v)).toBe(2);
    v.atStationId = L.a.id;
    v.loadingTicks = 1;
    v.state = 'loading';
    expect(loadingTick(ctx, v)).toBe(false);
  });
});

describe('station parcel merge and cap', () => {
  test('same source merges into one packet, totals preserved', () => {
    const st = { cargo: {} };
    addWaiting(st, 'COAL', 10, 3, 4, 100, 4000);
    addWaiting(st, 'COAL', 10, 5, 6, 110, 4000);
    addWaiting(st, 'COAL', 10, 3, 4, 120, 4000);
    expect(st.cargo.COAL.length).toBe(2);
    expect(waitingAmount(st, 'COAL')).toBe(30);
  });
  test('list length is capped at MAX_PARCELS', () => {
    const st = { cargo: {} };
    for (let i = 0; i < MAX_PARCELS + 20; i++) addWaiting(st, 'COAL', 1, i, 0, i, 4000);
    expect(st.cargo.COAL.length).toBeLessThanOrEqual(MAX_PARCELS);
    expect(waitingAmount(st, 'COAL')).toBe(MAX_PARCELS + 20);
  });
});

describe('depot auto-orient', () => {
  test('returns 0 when no neighbour road exists', () => {
    const g = flatGame(11);
    expect(autoDepotDir(g, 5, 5, 'road')).toBe(0);
  });
});
