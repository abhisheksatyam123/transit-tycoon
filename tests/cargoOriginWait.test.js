/** Origin waiting does not age cargo (OpenLoco Station.cpp enrouteAge: 0 at origin); transfers keep their age. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { transitDays, loadCargo } from '../js/simulation/orders.js';
import { addWaiting, takeWaiting } from '../js/simulation/stations.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

function setup() {
  const g = flatGame(21);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('origin waiting does not count as transit', () => {
  test('cargo produced and left 30 days at the origin pays as if transit started at pickup', () => {
    const { g, L, v } = setup();
    const st = L.a;
    st.cargo.COAL = [];
    addWaiting(st, 'COAL', 50, st.x, st.y, 0, 9999); // produced at tick 0
    g.state.tick = 30 * TICKS_PER_DAY;
    v.load = { amount: 0, sourceX: st.x, sourceY: st.y, sinceTick: g.state.tick, fromStationId: null };
    v.cargoId = 'COAL';
    v.capacity = 100;
    const ctx = { state: g.state, emit() {} };
    loadCargo(ctx, v, st);
    expect(v.load.amount).toBe(50);
    expect(transitDays(g.state, v.load)).toBeCloseTo(0, 6);
    // delivered 10 days later: transit is 10 days, not 40
    g.state.tick = 40 * TICKS_PER_DAY;
    expect(transitDays(g.state, v.load)).toBeCloseTo(10, 6);
  });

  test('transfer cargo waiting at an intermediate station keeps its age', () => {
    const { g, L } = setup();
    const st = L.a;
    st.cargo.COAL = [];
    // loaded at tick 0 elsewhere, transferred here at day 20: parcel carries the original pickup tick, xfer flag set
    addWaiting(st, 'COAL', 40, L.mine.x, L.mine.y, 0, 9999, 0, null, undefined, true);
    const got = takeWaiting(st, 'COAL', 40, undefined, 50 * TICKS_PER_DAY);
    expect(got.sinceTick).toBe(0); // age kept: not reset by the pickup tick
    g.state.tick = 50 * TICKS_PER_DAY;
    expect(transitDays(g.state, { sinceTick: got.sinceTick })).toBeCloseTo(50, 6);
  });

  test('origin parcels merged with transfer parcels stay separate (no age mixing)', () => {
    const { L } = setup();
    const st = L.a;
    st.cargo.COAL = [];
    addWaiting(st, 'COAL', 10, L.mine.x, L.mine.y, 0, 9999, 0, null, undefined, true);
    addWaiting(st, 'COAL', 10, L.mine.x, L.mine.y, 500, 9999);
    expect(st.cargo.COAL.length).toBe(2);
  });

  test('xfer flag survives save/load (parcels-v3); old format without it still loads', () => {
    const { g, L } = setup();
    const st = L.a;
    st.cargo.COAL = [];
    addWaiting(st, 'COAL', 10, L.mine.x, L.mine.y, 123, 9999, 0, null, undefined, true);
    addWaiting(st, 'COAL', 5, L.mine.x, L.mine.y, 456, 9999);
    const back = parseState(serializeState(g.state));
    const bst = back.stations.find((s) => s.id === st.id);
    const list = bst.cargo.COAL;
    expect(list.find((p) => p.xfer === true).sinceTick).toBe(123);
    expect(list.find((p) => p.xfer !== true).sinceTick).toBe(456);
  });
});
