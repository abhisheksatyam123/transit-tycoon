/** Timetable lateness (opt-in `timetableLateness`, OpenTTD lateness counter): G1, G2, G5. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { loadingTick, arriveAtStation, advanceOrder, noteDepotDeparture } from '../js/simulation/orders.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { resolveConditionals } from '../js/simulation/condOrders.js';

function setup(on = false) {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: false }, { stationId: L.b.id }]).ok).toBe(true);
  if (on) setSetting(g.state, 'timetableLateness', true);
  const stA = g.state.stations.find((s) => s.id === v.orders[0].stationId);
  const stB = g.state.stations.find((s) => s.id === v.orders[1].stationId);
  return { g, L, v, stA, stB };
}

/** Leave A at tick 0 (order 0), then advance to order 1. */
function departA(g, v, stA) {
  g.state.tick = 0;
  v.state = 'loading'; v.atStationId = stA.id; v.speed = 0; v.loadingTicks = 1; v.orderIndex = 0;
  expect(loadingTick(g.ctx, v)).toBe(true);
  advanceOrder(v);
}

describe('timetableLateness default OFF', () => {
  test('an early vehicle still waits exactly waitDays (today behaviour)', () => {
    const { g, v, stA } = setup(false);
    g.setOrderTimetable(v.id, 0, { waitDays: 1 });
    const ctx = g.ctx;
    v.state = 'loading'; v.atStationId = stA.id; v.speed = 0;
    g.state.tick = 1000; v.arriveTick = 1000; v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(false);
    g.state.tick = 1000 + TICKS_PER_DAY - 1; v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(false);
    g.state.tick = 1000 + TICKS_PER_DAY; v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.lateTicks).toBeUndefined();
    expect(v.ttStarted).toBeUndefined();
  });

  test('off: no lateness booking on an early arrival', () => {
    const { g, v, stA, stB } = setup(false);
    g.setOrderTimetable(v.id, 1, { travelDays: 2 });
    departA(g, v, stA);
    g.state.tick = TICKS_PER_DAY; // one day early against the 2-day schedule
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateDays).toBe(-1); // legacy leg-only display value
    expect(v.lateTicks).toBeUndefined();
    expect(v.ttStarted).toBeUndefined();
  });
});

describe('timetableLateness ON', () => {
  test('early arrival waits longer: max(timetabled wait - lateness, 0)', () => {
    const { g, v, stA, stB } = setup(true);
    g.setOrderTimetable(v.id, 1, { travelDays: 2, waitDays: 2 });
    departA(g, v, stA);
    g.state.tick = TICKS_PER_DAY; // 1 day early
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateTicks).toBe(-TICKS_PER_DAY);
    const arrivedAt = g.state.tick;
    // target = 2 days - (-1 day) = 3 days from arrival
    v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(false);
    g.state.tick = arrivedAt + 2 * TICKS_PER_DAY; v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(false);
    g.state.tick = arrivedAt + 3 * TICKS_PER_DAY; v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(true); // longer than the plain 2-day wait
    expect(v.lateTicks).toBeUndefined(); // the extra 1 day of waiting cancels the early running
  });

  test('late arrival waits less, never below zero', () => {
    const { g, v, stA, stB } = setup(true);
    g.setOrderTimetable(v.id, 1, { travelDays: 2, waitDays: 2 });
    departA(g, v, stA);
    g.state.tick = 4 * TICKS_PER_DAY; // 2 days late -> target max(2 - 2, 0) = 0
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateTicks).toBe(2 * TICKS_PER_DAY);
    v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(true); // departs at once, no hold

    // even later: the target is floored at 0 (not negative)
    const { g: g2, v: v2, stA: a2, stB: b2 } = setup(true);
    g2.setOrderTimetable(v2.id, 1, { travelDays: 2, waitDays: 2 });
    departA(g2, v2, a2);
    g2.state.tick = 5 * TICKS_PER_DAY; // 3 days late
    arriveAtStation(g2.ctx, v2, b2);
    expect(v2.lateTicks).toBe(3 * TICKS_PER_DAY);
    v2.loadingTicks = 1;
    expect(loadingTick(g2.ctx, v2)).toBe(true);
  });

  test('lateness accumulates across two legs (G2)', () => {
    const { g, v, stA, stB } = setup(true);
    g.setOrderTimetable(v.id, 0, { travelDays: 2 });
    g.setOrderTimetable(v.id, 1, { travelDays: 2 });
    departA(g, v, stA); // departs A at tick 0
    g.state.tick = 3 * TICKS_PER_DAY; // 1 day late into B
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateTicks).toBe(TICKS_PER_DAY);
    v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(true); // no wait: the 1-day lateness is kept
    advanceOrder(v); // back to order 0
    g.state.tick = 7 * TICKS_PER_DAY; // 4 days for a 2-day leg: another 2 days late
    arriveAtStation(g.ctx, v, stA);
    expect(v.lateTicks).toBe(3 * TICKS_PER_DAY); // 1 + 2, not just the last leg
  });

  test('ttStart seeds lateness on the first arrival and is consumed (G5)', () => {
    const { g, v, stA } = setup(true);
    g.setOrderTimetable(v.id, 0, { travelDays: 2, waitDays: 1 });
    expect(g.setTimetableStart(v.id, 1000).ok).toBe(true);
    g.state.tick = 1000 + 2 * TICKS_PER_DAY;
    v.orderIndex = 0;
    arriveAtStation(g.ctx, v, stA);
    expect(v.lateTicks).toBe(2 * TICKS_PER_DAY);
    expect(v.ttStart).toBeUndefined(); // consumed
    expect(v.ttStarted).toBe(true);
    // a second arrival does not re-seed
    v.lateTicks = 5 * TICKS_PER_DAY;
    g.state.tick += TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stA);
    expect(v.lateTicks).toBe(5 * TICKS_PER_DAY);
  });

  test('resetLateness clears lateTicks and ttStarted', () => {
    const { g, v } = setup(true);
    v.lateTicks = 3 * TICKS_PER_DAY; v.lateDays = 3; v.ttStarted = true;
    expect(g.resetLateness(v.id).ok).toBe(true);
    expect(v.lateTicks).toBeUndefined();
    expect(v.ttStarted).toBeUndefined();
    expect(v.lateDays).toBeUndefined();
  });
});

describe('timetableLateness setting + save', () => {
  test('one SETTING_META entry exists and the default is off', () => {
    const rows = SETTING_META.filter((m) => m.key === 'timetableLateness');
    expect(rows.length).toBe(1);
    expect(rows[0].group).toBe('vehicles');
    expect(DEFAULT_SETTINGS.timetableLateness).toBe(false);
  });

  test('a default-game save gains no lateTicks/ttStarted keys', () => {
    const { g, v } = setup(false);
    g.setOrderTimetable(v.id, 0, { waitDays: 1, travelDays: 2 });
    const back = parseState(serializeState(g.state));
    const w = back.vehicles.find((x) => x.id === v.id);
    expect(w.lateTicks).toBeUndefined();
    expect(w.ttStarted).toBeUndefined();
    expect(w.lateDays).toBeUndefined();
  });

  test('with the setting on, an old-save lateDays value seeds lateTicks once', () => {
    const { g, v, stA } = setup(true);
    g.setOrderTimetable(v.id, 0, { waitDays: 3 });
    v.lateDays = 2; // legacy value only
    v.state = 'loading'; v.atStationId = stA.id; v.speed = 0;
    g.state.tick = 1000; v.arriveTick = 1000; v.loadingTicks = 1;
    // target = 3 days - 2 days = 1 day: still holding, lateTicks materialised from lateDays
    expect(loadingTick(g.ctx, v)).toBe(false);
    expect(v.lateTicks).toBe(2 * TICKS_PER_DAY);
  });
});

describe('timetable legs through conditional and depot orders', () => {
  /** Depart order 0 at tick 0 with loading done (same driver as departA). */
  function leaveFirst(g, v, stA) {
    g.state.tick = 0;
    v.state = 'loading'; v.atStationId = stA.id; v.speed = 0; v.loadingTicks = 1; v.orderIndex = 0;
    expect(loadingTick(g.ctx, v)).toBe(true);
  }

  test('lateness is booked on the leg after a conditional order', () => {
    const { g, L, v, stA, stB } = setup(true);
    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { stationId: L.b.id },
    ]).ok).toBe(true);
    expect(g.setOrderTimetable(v.id, 2, { travelDays: 2 }).ok).toBe(true);
    leaveFirst(g, v, stA);
    // the leg is measured even though the order after S1 is conditional
    expect(v.departTick).toBe(0);
    advanceOrder(v);
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(2);
    v.state = 'loading'; v.atStationId = stB.id; v.loadingTicks = 1;
    g.state.tick = 3 * TICKS_PER_DAY; // one day late against the 2-day schedule
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateTicks).toBe(TICKS_PER_DAY);
  });

  test('estimates fill the leg after a conditional order', () => {
    const { g, L, v, stA, stB } = setup(true);
    setSetting(g.state, 'timetableEstimates', true);
    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { stationId: L.b.id },
    ]).ok).toBe(true);
    leaveFirst(g, v, stA);
    expect(v.departTick).toBe(0);
    advanceOrder(v);
    resolveConditionals(g.state, v);
    v.state = 'loading'; v.atStationId = stB.id; v.loadingTicks = 1;
    g.state.tick = 2 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.orders[2].estTravelDays).toBe(2); // recorded on the station order, not on the conditional
  });

  test('a depot order between stations does not inflate the measured leg', () => {
    const { g, L, v, stA, stB } = setup(true);
    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { depotId: L.depotId },
      { stationId: L.b.id },
    ]).ok).toBe(true);
    expect(g.setOrderTimetable(v.id, 2, { travelDays: 2 }).ok).toBe(true);
    leaveFirst(g, v, stA);
    expect(v.departTick).toBe(0); // measured: the walk skips the depot order
    advanceOrder(v); // depot order
    g.state.tick += 5 * TICKS_PER_DAY; // time spent in the depot
    noteDepotDeparture(g.state, v); // what the depot visit calls when the vehicle leaves
    expect(v.departTick).toBe(5 * TICKS_PER_DAY); // the leg restarts at the depot exit
    advanceOrder(v);
    g.state.tick += TICKS_PER_DAY; // one day of travel against the 2-day schedule
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateTicks).toBe(-TICKS_PER_DAY); // early by one day: the 5 depot days are not booked
  });
});
