/** Unbunch depot order (OpenTTD unbunch): validation rules, spread departures of a bunched shared group, reset, save/load. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { normaliseOrders, orderFlagText } from '../js/simulation/orders.js';
import { unbunchListError, unbunchBlockReason } from '../js/simulation/unbunch.js';

/** Road y=24 x=20..50, bus stops at x=22 (A) and x=48 (B), road depot at (24,25). */
function busLine(seed = 61) {
  const g = flatGame(seed);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  expect(g.buildRoadStop(22, 24, 'bus').ok).toBe(true);
  expect(g.buildRoadStop(48, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  const s = g.state;
  const depot = s.depots[s.depots.length - 1];
  const sts = s.stations.slice(-2);
  return { g, s, depot, model: g.listModels('road')[0], A: sts[0], B: sts[1] };
}

const ORD = (L) => [{ stationId: L.A.id }, { depotId: L.depot.id, unbunch: true }, { stationId: L.B.id }];

describe('unbunch validation', () => {
  test('flag kept on a depot order; flag text shows it; default off', () => {
    const L = busLine();
    const r = normaliseOrders(L.s, { kind: 'bus' }, [{ depotId: L.depot.id, unbunch: true }, { depotId: L.depot.id }], () => 'bus');
    expect(r.ok).toBe(true);
    expect(r.orders[0]).toEqual({ depotId: L.depot.id, unbunch: true });
    expect(r.orders[1]).toEqual({ depotId: L.depot.id });
    expect(orderFlagText({ depotId: 1, unbunch: true })).toBe(' (unbunch)');
  });

  test('refused with service-if-needed or stop-in-depot', () => {
    const L = busLine();
    const v = { kind: 'bus' };
    const svc = normaliseOrders(L.s, v, [{ depotId: L.depot.id, unbunch: true, serviceOnly: true }], () => 'bus');
    expect(svc.ok).toBe(false);
    expect(svc.error).toMatch(/service if needed/);
    const halt = normaliseOrders(L.s, v, [{ depotId: L.depot.id, unbunch: true, halt: true }], () => 'bus');
    expect(halt.ok).toBe(false);
    expect(halt.error).toMatch(/stop in depot/);
  });

  test('one per list, not with full load, not with conditional orders', () => {
    const L = busLine();
    const two = unbunchListError([{ depotId: L.depot.id, unbunch: true }, { depotId: L.depot.id, unbunch: true }]);
    expect(two).toMatch(/Only one unbunch/);
    expect(unbunchListError([{ stationId: L.A.id, load: 'full' }, { depotId: L.depot.id, unbunch: true }])).toMatch(/full load/);
    expect(unbunchListError([{ stationId: L.A.id, full: true }, { depotId: L.depot.id, unbunch: true }])).toMatch(/full load/);
    expect(unbunchListError([{ stationId: L.A.id, load: 'fullAny' }, { depotId: L.depot.id, unbunch: true }])).toMatch(/full load/);
    expect(unbunchListError([{ cond: { var: 'load', op: '>', value: 0 } }, { depotId: L.depot.id, unbunch: true }])).toMatch(/conditional/);
    expect(unbunchListError([{ stationId: L.A.id }, { depotId: L.depot.id, unbunch: true }])).toBe(null);
  });

  test('UI block reason: non-depot rows refused, set rows always clearable', () => {
    const L = busLine();
    expect(unbunchBlockReason([{ stationId: L.A.id }], 0)).toMatch(/go-to-depot/);
    expect(unbunchBlockReason(ORD(L), 1)).toBe(null);
    const twice = [{ depotId: L.depot.id, unbunch: true }, { depotId: L.depot.id }];
    expect(unbunchBlockReason(twice, 1)).toMatch(/Only one/);
    expect(unbunchBlockReason([{ depotId: L.depot.id, unbunch: true }], 0)).toBe(null);
  });

  test('setOrders refuses a bad list and keeps the old one', () => {
    const L = busLine();
    const v = L.g.buyVehicle(L.depot.id, { modelId: L.model.id }).vehicle;
    expect(L.g.setOrders(v.id, [{ stationId: L.A.id, full: true }, { depotId: L.depot.id, unbunch: true }]).ok).toBe(false);
    expect(v.orders.some((o) => o.unbunch)).toBe(false);
  });
});

describe('unbunch spreads a bunched shared group', () => {
  test('three shared buses leave the depot at spread-out ticks after the first round trips', () => {
    const L = busLine();
    const a = L.g.buyVehicle(L.depot.id, { modelId: L.model.id }).vehicle;
    expect(L.g.setOrders(a.id, ORD(L)).ok).toBe(true);
    const b = L.g.cloneVehicle(a.id, { shareOrders: true }).vehicle;
    const c = L.g.cloneVehicle(a.id, { shareOrders: true }).vehicle;
    const fleet = [a, b, c];
    // all bunched: start together
    // every departure from the unbunch depot stamps ubLast (LeaveUnbunchingDepot): log the stamps
    const leaves = new Map(fleet.map((v) => [v.id, []]));
    for (const v of fleet) expect(L.g.startVehicle(v.id).ok).toBe(true);
    for (let t = 0; t < 80 * 96; t++) {
      L.g.step();
      for (const v of fleet) if (v.ubLast !== undefined && leaves.get(v.id).at(-1) !== v.ubLast) leaves.get(v.id).push(v.ubLast);
      if (fleet.every((v) => leaves.get(v.id).length >= 4)) break;
    }
    for (const v of fleet) expect(leaves.get(v.id).length).toBeGreaterThanOrEqual(4);
    // steady state: the group's departures are evenly spread, each gap = round trip / n / n (OpenTTD separation)
    const all = [...fleet.flatMap((v) => leaves.get(v.id).slice(2))].sort((x, y) => x - y);
    const gaps = all.slice(1).map((t, i) => t - all[i]);
    const sum = fleet.reduce((acc, v) => acc + v.ubRound, 0); // sum of round trips of the 3 members
    const sep = Math.max(Math.floor(sum / 9), 1); // total / n / n with n = 3
    expect(sum).toBeGreaterThan(0);
    // allow +1 tick: a departure can land one tick after its due tick (run-loop ordering)
    expect(gaps.slice(-4).every((gp) => gp === sep || gp === sep + 1)).toBe(true);
    // data kept lazy: present only on unbunch vehicles, and only once they visited the depot
    for (const v of fleet) expect(v.ubRound).toBeGreaterThan(0);
    expect(L.s.vehicles.every((w) => w.ubRound === undefined || w.orders.some((o) => o.unbunch))).toBe(true);
  });

  test('a non-shared vehicle with an unbunch order does not hold (no waiting without sharers)', () => {
    const L = busLine();
    const a = L.g.buyVehicle(L.depot.id, { modelId: L.model.id }).vehicle;
    expect(L.g.setOrders(a.id, ORD(L)).ok).toBe(true);
    expect(L.g.startVehicle(a.id).ok).toBe(true);
    for (let t = 0; t < 40 * 96; t++) {
      L.g.step();
      expect(a.ubHold === true && a.state === 'depot' && a.ubNext > L.s.tick).toBe(false);
    }
  });
});

describe('reset and save/load', () => {
  test('changing the order list resets the unbunch data', () => {
    const L = busLine();
    const a = L.g.buyVehicle(L.depot.id, { modelId: L.model.id }).vehicle;
    expect(L.g.setOrders(a.id, ORD(L)).ok).toBe(true);
    a.ubLast = 100; a.ubRound = 500; a.ubNext = 900;
    expect(L.g.setOrders(a.id, ORD(L)).ok).toBe(true);
    expect(a.ubLast).toBeUndefined();
    expect(a.ubRound).toBeUndefined();
    expect(a.ubNext).toBeUndefined();
  });

  test('round trip and next departure survive save/load', () => {
    const L = busLine();
    const a = L.g.buyVehicle(L.depot.id, { modelId: L.model.id }).vehicle;
    expect(L.g.setOrders(a.id, ORD(L)).ok).toBe(true);
    a.ubLast = 1000; a.ubRound = 777; a.ubNext = 1500; a.ubHold = true;
    const back = parseState(serializeState(L.s));
    const w = back.vehicles.find((x) => x.id === a.id);
    expect(w.ubLast).toBe(1000);
    expect(w.ubRound).toBe(777);
    expect(w.ubNext).toBe(1500);
    expect(w.ubHold).toBe(true);
    expect(w.orders.some((o) => o.unbunch)).toBe(true);
  });

  test('a vehicle without the flag has no unbunch fields in the save', () => {
    const L = busLine();
    const a = L.g.buyVehicle(L.depot.id, { modelId: L.model.id }).vehicle;
    expect(L.g.setOrders(a.id, [{ stationId: L.A.id }, { stationId: L.B.id }]).ok).toBe(true);
    const txt = serializeState(L.s);
    expect(txt.includes('ubRound')).toBe(false);
    expect(txt.includes('ubNext')).toBe(false);
  });
});
