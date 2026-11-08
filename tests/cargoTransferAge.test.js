/**
 * Cargo transfer merge enrouteAge (OpenLoco Vehicles/VehicleHead.cpp:3202-3210).
 * When cargo is transferred/unloaded at a station, st.cargoAge blends existing
 * waiting cargo age and incoming transit age via weighted average.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { unload } from '../js/simulation/orders.js';
import { addWaiting } from '../js/simulation/stations.js';

function setup() {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  v.cargoId = 'COAL';
  return { g, L, v, st: L.b };
}

describe('cargo transfer merge enrouteAge', () => {
  test('transfer to empty station sets st.cargoAge to incoming transit days', () => {
    const { g, v, st } = setup();
    // Configure station so it does not accept COAL (forces transfer)
    st.accepts.COAL = 0;
    // Set vehicle orders to transfer at st
    v.orders = [{ type: 'station', stationId: st.id, unload: 'transfer' }];
    v.orderIndex = 0;

    // Load loaded 10 days ago
    g.state.tick = 20 * TICKS_PER_DAY;
    v.load = {
      amount: 40,
      cargoId: 'COAL',
      sourceX: 1,
      sourceY: 1,
      sinceTick: 10 * TICKS_PER_DAY,
      fromStationId: 999, // different station
    };

    const ctx = { state: g.state, emit() {} };
    unload(ctx, v, st);

    expect(v.load.amount).toBe(0);
    expect(st.cargoAge).toBeDefined();
    expect(st.cargoAge.COAL).toBe(10); // 20 - 10 = 10 days
  });

  test('transfer to station with existing waiting cargo blends st.cargoAge as a weighted average', () => {
    const { g, v, st } = setup();
    st.accepts.COAL = 0;
    v.orders = [{ type: 'station', stationId: st.id, unload: 'transfer' }];
    v.orderIndex = 0;

    // Station already has 20 units with age 5
    st.cargo.COAL = [];
    addWaiting(st, 'COAL', 20, 1, 1, 0, 9999, 0, null, undefined, true);
    st.cargoAge = { COAL: 5 };

    // Vehicle transfers 40 units that have been in transit for 20 days
    g.state.tick = 30 * TICKS_PER_DAY;
    v.load = {
      amount: 40,
      cargoId: 'COAL',
      sourceX: 2,
      sourceY: 2,
      sinceTick: 10 * TICKS_PER_DAY, // 30 - 10 = 20 days
      fromStationId: 999,
    };

    const ctx = { state: g.state, emit() {} };
    unload(ctx, v, st);

    // Weighted average: (5 * 20 + 20 * 40) / (20 + 40) = (100 + 800) / 60 = 900 / 60 = 15
    expect(st.cargoAge.COAL).toBe(15);
  });

  test('clamps merged age and incoming age to 255', () => {
    const { g, v, st } = setup();
    st.accepts.COAL = 0;
    v.orders = [{ type: 'station', stationId: st.id, unload: 'transfer' }];
    v.orderIndex = 0;

    // Incoming transit days = 300 days (> 255)
    g.state.tick = 400 * TICKS_PER_DAY;
    v.load = {
      amount: 50,
      cargoId: 'COAL',
      sourceX: 1,
      sourceY: 1,
      sinceTick: 100 * TICKS_PER_DAY,
      fromStationId: 999,
    };

    const ctx = { state: g.state, emit() {} };
    unload(ctx, v, st);

    // Clamped to 255 on empty station
    expect(st.cargoAge.COAL).toBe(255);

    // Blend when clamped
    st.cargoAge.COAL = 250;
    v.load = {
      amount: 50,
      cargoId: 'COAL',
      sourceX: 1,
      sourceY: 1,
      sinceTick: 0, // 400 days in transit
      fromStationId: 999,
    };
    unload(ctx, v, st);
    // (250 * 50 + 400 * 50) / 100 = 325 -> clamped to 255
    expect(st.cargoAge.COAL).toBe(255);
  });
});
