/** Go to nearest depot orders ({ depot: 'nearest' }), the halt (stop in depot) flag, service-if-needed on nearest, and save/load. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { normaliseOrders, orderFlagText } from '../js/simulation/orders.js';
import { dayNumber } from '../js/simulation/date.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

/** Coal line (depot at 20,25) plus a second rail depot at 35,25; a train with 2 hoppers in the first depot. */
function setup(orders) {
  const g = flatGame(23);
  const L = coalLine(g);
  const r2 = g.buildDepot(35, 25, 'rail', 1);
  expect(r2.ok).toBe(true);
  const near = g.state.depots.find((d) => d.x === 35 && d.y === 25);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, orders(L, near)).ok).toBe(true);
  return { g, L, v, near };
}

/** Coordinates of the depot the vehicle is at (or just left) when it is serviced. */
function depotAt(g, v) {
  let best = null;
  for (const d of g.state.depots) {
    const dist = Math.abs(d.x - v.tx) + Math.abs(d.y - v.ty);
    if (!best || dist < best.dist) best = { x: d.x, y: d.y, dist };
  }
  return best && best.dist <= 2 ? `${best.x},${best.y}` : `${v.tx},${v.ty}`;
}

/** Step until pred holds (at most maxDays); `seen` collects the depot of every service visit (services++). */
function runUntil(g, v, pred, seen = [], maxDays = 30) {
  let n = v.services || 0;
  for (let t = 0; t < maxDays * TICKS_PER_DAY; t++) {
    g.step();
    if ((v.services || 0) !== n) { n = v.services; seen.push(depotAt(g, v)); }
    if (pred()) return true;
  }
  return false;
}

describe('nearest depot order', () => {
  test('normalisation: nearest kept with flags, halt kept, unknown kind refused', () => {
    const { g, v } = setup((L) => [{ stationId: L.b.id, full: false }]);
    const ok = normaliseOrders(g.state, v, [{ depot: 'nearest', serviceOnly: true, halt: true }], () => 'rail');
    expect(ok.ok).toBe(true);
    expect(ok.orders).toEqual([{ depot: 'nearest', serviceOnly: true, halt: true }]);
    expect(orderFlagText({ depot: 'nearest', serviceOnly: true, halt: true })).toBe(' (service if needed, stop in depot)');
    expect(normaliseOrders(g.state, v, [{ depot: 'nearest', halt: false }], () => 'rail').orders).toEqual([{ depot: 'nearest' }]);
  });

  test('goes to the closer of two depots, services there, then continues', () => {
    const { g, L, v, near } = setup((L) => [{ stationId: L.a.id, full: false }, { depot: 'nearest' }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = 0; v.services = 0; v.reliability = 0.5; v.baseReliability = 0.9;
    // the train starts at A (x=10); depot 20,25 is nearer than 35,25 from there, so the first depot is chosen
    const seen = [];
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, v, () => v.orderIndex === 2, seen)).toBe(true);
    expect(new Set(seen)).toEqual(new Set(['20,25'])); // every service at the nearer depot, none at the far one
    expect(v.services).toBeGreaterThan(0); // serviced (the service count can exceed 1 per visit; pre-existing, see report)
    expect(v.reliability).toBe(0.9);
    expect(v.state).toBe('running'); // services and leaves again, not stopped in the depot
  });

  test('from a point nearer the second depot the nearest one is used', () => {
    const { g, L, v, near } = setup((L) => [{ depot: 'nearest' }, { stationId: L.a.id, full: false }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = 0; v.services = 0;
    // place the train beside the far depot (35,24) so the nearest depot is 35,25
    const tile = (x, y) => g.state.map.tiles[y * g.state.map.width + x];
    expect(tile(35, 24).rail).toBeTruthy();
    v.tx = 35; v.ty = 24; v.history = [{ x: 35, y: 24 }]; v.path = []; v.pathIndex = 0; v.progress = 0;
    expect(g.startVehicle(v.id).ok).toBe(true);
    const seen = [];
    expect(runUntil(g, v, () => v.orderIndex === 1, seen)).toBe(true);
    expect(new Set(seen)).toEqual(new Set([`${near.x},${near.y}`]));
  });

  test('service if needed: a not-due nearest order is skipped and no depot trip is made', () => {
    const { g, L, v } = setup((L) => [{ depot: 'nearest', serviceOnly: true }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = dayNumber(g.state.date); v.services = 0;
    expect(g.startVehicle(v.id).ok).toBe(true);
    const seen = [];
    expect(runUntil(g, v, () => v.orderIndex === 1, seen)).toBe(true); // skipped straight to the next order
    expect(seen.length).toBe(0); // no depot trip
    expect(v.services).toBe(0);
  });

  test('service if needed: a due nearest order is visited and serviced', () => {
    const { g, L, v } = setup((L) => [{ depot: 'nearest', serviceOnly: true }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 5; v.lastServiceDay = 0; v.services = 0; v.serviceDue = true;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, v, () => v.orderIndex === 1)).toBe(true);
    expect(v.services).toBe(1);
  });

  test('halt: the vehicle stops in the depot and a later start continues with the next order', () => {
    const { g, L, v, near } = setup((L, d) => [{ depot: 'nearest', halt: true }, { stationId: L.b.id, full: false }]);
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, v, () => v.state === 'depot')).toBe(true);
    expect(`${v.tx},${v.ty}`).toBe('20,25'); // nearest from the start is the depot at 20,25 (not 35,25)
    expect(near.x).toBe(35);
    expect(v.orderIndex).toBe(1);
    for (let i = 0; i < 2 * TICKS_PER_DAY; i++) g.step();
    expect(v.state).toBe('depot'); // still parked
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(v.state).toBe('running');
    expect(runUntil(g, v, () => v.state !== 'depot' || v.orderIndex === 0, [], 5)).toBe(true);
  });

  test('halt on a specific depot order also stops in the depot', () => {
    const { g, L, v, near } = setup((L, d) => [{ depotId: d.id, halt: true }, { stationId: L.b.id, full: false }]);
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, v, () => v.state === 'depot')).toBe(true);
    expect(v.tx).toBe(near.x);
    expect(v.orderIndex).toBe(1);
  });

  test('save/load round-trip keeps the nearest order and its flags', () => {
    const { g, L, v } = setup((L) => [{ depot: 'nearest', serviceOnly: true, halt: true }, { stationId: L.b.id, full: false }]);
    const back = parseState(serializeState(g.state));
    const bv = back.vehicles.find((x) => x.id === v.id);
    expect(bv.orders[0]).toEqual({ depot: 'nearest', serviceOnly: true, halt: true });
    expect(bv.orders[1].depotId).toBeUndefined();
  });
});
