/** Timetables: order waitDays / travelDays, lateness, autofill, shared orders, save round-trip, no-timetable unchanged. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { currentOrder, loadingTick, arriveAtStation, advanceOrder } from '../js/simulation/orders.js';

function setup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: false }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v };
}

describe('timetable fields', () => {
  test('no-timetable orders stay free of timetable keys (save unchanged)', () => {
    const { v } = setup();
    expect(v.orders.every((o) => o.waitDays === undefined && o.travelDays === undefined)).toBe(true);
    expect(v.lateDays).toBeUndefined();
    expect(v.autofill).toBeUndefined();
  });

  test('setOrderTimetable stores waitDays/travelDays and 0 clears them', () => {
    const { g, v } = setup();
    expect(g.setOrderTimetable(v.id, 1, { waitDays: 2, travelDays: 3 }).ok).toBe(true);
    expect(v.orders[1].waitDays).toBe(2);
    expect(v.orders[1].travelDays).toBe(3);
    expect(g.setOrderTimetable(v.id, 1, { waitDays: 0 }).ok).toBe(true);
    expect(v.orders[1].waitDays).toBeUndefined();
    expect(v.orders[1].travelDays).toBe(3);
  });

  test('rejects bad values and unknown orders', () => {
    const { g, v } = setup();
    expect(g.setOrderTimetable(v.id, 0, { waitDays: -1 }).ok).toBe(false);
    expect(g.setOrderTimetable(v.id, 0, { travelDays: 1000 }).ok).toBe(false);
    expect(g.setOrderTimetable(v.id, 9, { waitDays: 1 }).ok).toBe(false);
    expect(g.setOrderTimetable(99999, 0, { waitDays: 1 }).ok).toBe(false);
  });

  test('timetable survives setOrders-free edits via modifyOrder and normalisation', () => {
    const { g, v } = setup();
    g.setOrderTimetable(v.id, 0, { waitDays: 1, travelDays: 2 });
    expect(g.modifyOrder(v.id, 0, { unload: 'all' }).ok).toBe(true);
    expect(v.orders[0].waitDays).toBe(1);
    expect(v.orders[0].travelDays).toBe(2);
    expect(v.orders[0].unload).toBe('all');
  });

  test('waitDays holds loading until the minimum wait has passed', () => {
    const { g, v } = setup();
    g.setOrderTimetable(v.id, 0, { waitDays: 1 });
    const ctx = g.ctx;
    const st = g.state.stations.find((s) => s.id === v.orders[0].stationId);
    v.state = 'loading'; v.atStationId = st.id; v.speed = 0;
    g.state.tick = 1000;
    v.arriveTick = 1000;
    v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(false);
    g.state.tick = 1000 + TICKS_PER_DAY - 1;
    v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(false);
    g.state.tick = 1000 + TICKS_PER_DAY;
    v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(true);
  });

  test('autofill: arming sets autofillLeft = number of orders; off clears it', () => {
    const { g, v } = setup();
    expect(g.setTimetableAutofill(v.id, true).ok).toBe(true);
    expect(v.autofill).toBe(true);
    expect(v.autofillLeft).toBe(2);
    expect(g.setTimetableAutofill(v.id, false).ok).toBe(true);
    expect(v.autofill).toBeUndefined();
    expect(v.autofillLeft).toBeUndefined();
  });

  test('autofill records waiting and travel time over a round, then turns itself off', () => {
    const { g, v } = setup();
    g.setTimetableAutofill(v.id, true);
    const ctx = g.ctx;
    const st0 = g.state.stations.find((s) => s.id === v.orders[0].stationId);
    // depart order 0 after 2 days of waiting; travel to order 1 took 3 days
    v.state = 'loading'; v.atStationId = st0.id; v.arriveTick = 0; v.loadingTicks = 1;
    g.state.tick = 2 * TICKS_PER_DAY;
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.orders[0].waitDays).toBe(2);
    expect(v.departTick).toBe(2 * TICKS_PER_DAY);
    expect(v.autofillLeft).toBe(1);
  });

  test('lateness: actual travel minus scheduled travel; on time clears it', () => {
    const { g, v } = setup();
    g.setOrderTimetable(v.id, 1, { travelDays: 2 });
    const ctx = g.ctx;
    const stA = g.state.stations.find((s) => s.id === v.orders[0].stationId);
    const stB = g.state.stations.find((s) => s.id === v.orders[1].stationId);
    // leave A at tick 0: loading finishes, order 1 has travelDays so departTick is recorded
    g.state.tick = 0;
    v.state = 'loading'; v.atStationId = stA.id; v.loadingTicks = 1; v.orderIndex = 0;
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.departTick).toBe(0);
    advanceOrder(v);
    // arrive at B after 4 days: 2 days late
    g.state.tick = 4 * TICKS_PER_DAY;
    arriveAtStation(ctx, v, stB);
    expect(v.lateDays).toBe(2);
    // a second round that is on time clears the lateness
    g.state.tick = 4 * TICKS_PER_DAY;
    v.orderIndex = 0; v.atStationId = stA.id; v.loadingTicks = 1;
    loadingTick(ctx, v);
    advanceOrder(v);
    g.state.tick = 6 * TICKS_PER_DAY;
    arriveAtStation(ctx, v, stB);
    expect(v.lateDays).toBeUndefined();
    // resetLateness on a late vehicle
    v.lateDays = 3;
    expect(g.resetLateness(v.id).ok).toBe(true);
    expect(v.lateDays).toBeUndefined();
  });

  test('shared orders: timetable edit applies to every member', () => {
    const { g, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(g.setOrderTimetable(v.id, 0, { waitDays: 3 }).ok).toBe(true);
    expect(c.orders[0].waitDays).toBe(3);
  });

  test('save/load round-trip keeps timetable and lateness fields', () => {
    const { g, v } = setup();
    g.setOrderTimetable(v.id, 1, { waitDays: 1, travelDays: 4 });
    v.lateDays = -2;
    v.autofill = true; v.autofillLeft = 1;
    const back = parseState(serializeState(g.state));
    const w = back.vehicles.find((x) => x.id === v.id);
    expect(w.orders[1].waitDays).toBe(1);
    expect(w.orders[1].travelDays).toBe(4);
    expect(w.lateDays).toBe(-2);
    expect(w.autofill).toBe(true);
    expect(w.autofillLeft).toBe(1);
  });
});

describe('resetLateness group scope', () => {
  function sharedSetup() {
    const { g, L, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    const d = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    return { g, v, c, d };
  }
  test('single vehicle clears only itself by default', () => {
    const { g, v, c } = sharedSetup();
    v.lateDays = 2; c.lateDays = 3;
    const r = g.resetLateness(v.id);
    expect(r.ok).toBe(true); expect(r.count).toBe(1);
    expect(v.lateDays).toBeUndefined(); expect(c.lateDays).toBe(3);
  });
  test('applyToGroup clears all shared members', () => {
    const { g, v, c, d } = sharedSetup();
    v.lateDays = 2; c.lateDays = 3; d.lateDays = 1;
    const r = g.resetLateness(v.id, { applyToGroup: true });
    expect(r.ok).toBe(true); expect(r.count).toBe(3);
    expect(v.lateDays).toBeUndefined(); expect(c.lateDays).toBeUndefined(); expect(d.lateDays).toBeUndefined();
  });
  test('non-shared with applyToGroup clears just itself', () => {
    const { g, v } = setup();
    v.lateDays = 5;
    const r = g.resetLateness(v.id, { applyToGroup: true });
    expect(r.ok).toBe(true); expect(r.count).toBe(1);
    expect(v.lateDays).toBeUndefined();
  });
  test('unknown vehicle error', () => {
    const { g } = setup();
    expect(g.resetLateness(999999).ok).toBe(false);
    expect(g.resetLateness(999999, { applyToGroup: true }).ok).toBe(false);
  });
});
