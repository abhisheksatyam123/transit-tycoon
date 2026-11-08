/** Timetable start date, spread evenly over a shared-order group, incomplete refusal, separation setting, save/load. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { loadingTick } from '../js/simulation/orders.js';
import { setSetting } from '../js/simulation/settings.js';
import { roundTicks, scheduledDeparture, timetableComplete } from '../js/simulation/ttSchedule.js';

/** Road y=24 from x=20 to x=50, bus stops at x=22 and x=48, depot (24,25). */
function busLine(seed = 41, sep = null) {
  const g = flatGame(seed);
  if (sep !== null) setSetting(g.state, 'timetableSeparation', sep);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  expect(g.buildRoadStop(22, 24, 'bus').ok).toBe(true);
  expect(g.buildRoadStop(48, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  const s = g.state;
  const depot = s.depots[s.depots.length - 1];
  const sts = s.stations.slice(-2);
  const model = g.listModels('road')[0];
  return { g, s, depot, model, A: sts[0], B: sts[1] };
}

/** One bus with orders A -> B (both timetabled: 12 days travel, 1 day wait; round = 26 days). */
function firstBus(L) {
  const r = L.g.buyVehicle(L.depot.id, { modelId: L.model.id });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(L.g.setOrders(v.id, [{ stationId: L.A.id, full: false }, { stationId: L.B.id, full: false }]).ok).toBe(true);
  L.g.setOrderTimetable(v.id, 0, { waitDays: 1, travelDays: 12 });
  L.g.setOrderTimetable(v.id, 1, { waitDays: 1, travelDays: 12 });
  return v;
}

describe('timetable start date', () => {
  test('start date holds a vehicle at its first stop until the start tick', () => {
    const L = busLine();
    const v = firstBus(L);
    const start = L.g.state.tick + 3 * TICKS_PER_DAY;
    expect(L.g.setTimetableStart(v.id, start).ok).toBe(true);
    expect(v.ttStart).toBe(start);
    const st = L.s.stations.find((x) => x.id === v.orders[0].stationId);
    v.state = 'loading'; v.atStationId = st.id; v.speed = 0; v.loadingTicks = 1; v.orderIndex = 0;
    v.arriveTick = L.g.state.tick;
    expect(loadingTick(L.g.ctx, v)).toBe(false);
    L.g.state.tick = start - 1;
    v.loadingTicks = 1;
    expect(loadingTick(L.g.ctx, v)).toBe(false);
    L.g.state.tick = start;
    v.loadingTicks = 1;
    expect(loadingTick(L.g.ctx, v)).toBe(true);
    expect(v.departTick).toBe(start);
  });

  test('clearing the start date removes the field; bad values are refused', () => {
    const L = busLine();
    const v = firstBus(L);
    L.g.setTimetableStart(v.id, 500);
    expect(L.g.setTimetableStart(v.id, null).ok).toBe(true);
    expect(v.ttStart).toBeUndefined();
    expect(L.g.setTimetableStart(v.id, -5).ok).toBe(false);
    expect(L.g.setTimetableStart(99999, 5).ok).toBe(false);
  });
});

describe('spread evenly', () => {
  test('3 buses sharing orders get start dates spaced by round / 3', () => {
    const L = busLine();
    const v = firstBus(L);
    const c1 = L.g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    const c2 = L.g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(v.orderGroup).toBeDefined();
    const T = roundTicks(v.orders);
    expect(T).toBe(26 * TICKS_PER_DAY);
    const r = L.g.spreadTimetableStart(v.id);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
    const starts = [v, c1, c2].map((w) => w.ttStart).sort((a, b) => a - b);
    expect(starts[1] - starts[0]).toBe(Math.round(T / 3));
    expect(starts[2] - starts[1]).toBe(Math.round(T / 3));
    expect(starts[0]).toBe(L.g.state.tick);
  });

  test('incomplete timetable (a travel time missing) is refused with an error', () => {
    const L = busLine();
    const v = firstBus(L);
    L.g.setOrderTimetable(v.id, 1, { travelDays: 0 });
    expect(timetableComplete(v)).toBe(false);
    const r = L.g.spreadTimetableStart(v.id);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/incomplete/i);
    expect(v.ttStart).toBeUndefined();
  });
});

describe('timetable separation', () => {
  /** Run `days` days with 3 buses on one line; returns the departure ticks from stop A (order 0). */
  function runLine(sep, days) {
    const L = busLine(41, sep);
    const v = firstBus(L);
    const c1 = L.g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    const c2 = L.g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(L.g.spreadTimetableStart(v.id).ok).toBe(true);
    const fleet = [v, c1, c2];
    for (const w of fleet) expect(L.g.startVehicle(w.id).ok).toBe(true);
    const departs = [];
    const seen = new Map(fleet.map((w) => [w.id, null]));
    const end = L.g.state.tick + days * TICKS_PER_DAY;
    while (L.g.state.tick < end) {
      L.g.step();
      for (const w of fleet) {
        if (w.departTick != null && w.departTick !== seen.get(w.id) && w.orderIndex === 1 && w.state !== 'loading') {
          seen.set(w.id, w.departTick); departs.push(w.departTick);
        }
      }
    }
    return { departs, fleet, L };
  }

  test('separation on: departure gaps stay within 1 day of round/3 over 8 months', () => {
    const { departs, L } = runLine(true, 240);
    const want = roundTicks(L.s.vehicles[0].orders) / 3 / TICKS_PER_DAY;
    expect(departs.length).toBeGreaterThan(20);
    const sorted = [...departs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const gapDays = (sorted[i] - sorted[i - 1]) / TICKS_PER_DAY;
      expect(Math.abs(gapDays - want)).toBeLessThanOrEqual(1);
    }
  }, 30000);

  test('separation off: no slot holds (scheduledDeparture is null)', () => {
    const L = busLine(41, false);
    const v = firstBus(L);
    L.g.cloneVehicle(v.id, { shareOrders: true });
    expect(scheduledDeparture(L.g.state, v, 0)).toBeNull();
  });

  test('separation on: scheduled departure slots advance by one round', () => {
    const L = busLine(41, true);
    const v = firstBus(L);
    L.g.cloneVehicle(v.id, { shareOrders: true });
    const T = roundTicks(v.orders);
    const a = scheduledDeparture(L.g.state, v, 0);
    L.g.state.tick = a + 1;
    const b = scheduledDeparture(L.g.state, v, 0);
    expect(b - a).toBe(T);
  });
});

describe('save / load', () => {
  test('ttStart survives a save round-trip', () => {
    const L = busLine();
    const v = firstBus(L);
    L.g.setTimetableStart(v.id, 12345);
    const back = parseState(serializeState(L.g.state));
    expect(back.vehicles.find((x) => x.id === v.id).ttStart).toBe(12345);
  });
});
