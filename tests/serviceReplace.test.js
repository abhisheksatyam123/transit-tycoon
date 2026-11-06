/** T18c: autoreplace / autorenew also apply on an automatic service visit (the replacement keeps the route);
 *  vehicle list late column helpers. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { autorenewVehicle } from '../js/simulation/autorenew.js';
import { sortVehicles, lateLabel, hasVehicleTimetable } from '../js/ui/windows/vehicleList.js';

function setup({ interval = 0, full = true } = {}) {
  const g = flatGame(33);
  setSetting(g.state, 'breakdowns', 'normal');
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full }, { stationId: L.b.id, full: false }]).ok).toBe(true);
  if (interval) expect(g.setServiceInterval(v.id, interval).ok).toBe(true);
  expect(g.startVehicle(v.id).ok).toBe(true);
  return { g, L, v };
}

describe('service-visit replacement (T18c)', () => {
  test('a running vehicle on a service trip is replaced in place: route, orders and timetable carry over', () => {
    const { g, v } = setup();
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    const depot = g.state.depots.find((d) => d.id === v.depotId);
    // mid-route, heading to its depot for service
    v.state = 'running';
    v.goingToDepot = depot.id;
    v.serviceTrip = true;
    v.path = [{ x: v.tx, y: v.ty }, { x: v.tx + 1, y: v.ty }, { x: v.tx + 2, y: v.ty }];
    v.pathIndex = 1; v.progress = 0.5; v.speed = 0.3;
    v.orderIndex = 1; v.lateDays = 2; v.departTick = 77;
    const { x, y } = v;
    const before = g.state.vehicles.length;
    const nv = autorenewVehicle(g.ctx, v, { serviceVisit: true });
    expect(nv).toBeTruthy();
    expect(nv.modelId).toBe('eng_comet');
    expect(g.state.vehicles.length).toBe(before);
    expect(nv.name).toBe(v.name);
    expect(nv.state).toBe('running');
    expect(nv.goingToDepot).toBe(depot.id);
    expect(nv.serviceTrip).toBe(true);
    expect([nv.x, nv.y]).toEqual([x, y]);
    expect(nv.path.length).toBe(3);
    expect(nv.pathIndex).toBe(1);
    expect(nv.progress).toBe(0.5);
    expect(nv.orderIndex).toBe(1);
    expect(nv.lateDays).toBe(2);
    expect(nv.departTick).toBe(77);
    expect(nv.orders.map((o) => o.stationId)).toEqual(v.orders.map((o) => o.stationId));
  });

  test('a running vehicle without a service trip is not touched (only depot visits and service visits)', () => {
    const { g, v } = setup();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'running';
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
  });

  test('no rule and autorenew off: a service visit replaces nothing', () => {
    const { g, v } = setup();
    v.state = 'running';
    v.goingToDepot = v.depotId;
    v.serviceTrip = true;
    expect(autorenewVehicle(g.ctx, v, { serviceVisit: true })).toBe(null);
  });

  test('an automatic service visit with an autoreplace rule replaces the vehicle and it keeps running', () => {
    const { g, v } = setup({ interval: 1, full: false });
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    const name = v.name;
    const cash = g.state.company.money;
    let replaced = null;
    for (let i = 0; i < 96 * 20 && !replaced; i++) {
      g.step();
      replaced = g.state.vehicles.find((x) => x.name === name && x.modelId === 'eng_comet') || null;
    }
    expect(replaced).toBeTruthy();
    expect(g.state.company.money).toBeLessThan(cash);
    expect(replaced.orders.length).toBe(2);
    for (let i = 0; i < 96 * 10; i++) g.step();
    expect(g.state.vehicles.find((x) => x.name === name).state).not.toBe('lost');
  });

  test('replacement skipped on service visit when unaffordable: vehicle kept', () => {
    const { g, v } = setup();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    v.state = 'running';
    v.goingToDepot = v.depotId;
    v.serviceTrip = true;
    g.state.company.money = 10;
    const n = g.state.vehicles.length;
    expect(autorenewVehicle(g.ctx, v, { serviceVisit: true })).toBe(null);
    expect(g.state.vehicles.length).toBe(n);
    expect(g.state.vehicles.includes(v)).toBe(true);
  });
});

describe('vehicle list late column (T18c / #39b)', () => {
  const V = [
    { id: 1, name: 'T 1', unitNumber: 1, orders: [{ stationId: 1, waitDays: 2 }], lateDays: 3 },
    { id: 2, name: 'T 2', unitNumber: 2, orders: [{ stationId: 1 }] },
    { id: 3, name: 'T 3', unitNumber: 3, orders: [{ stationId: 1, travelDays: 4 }], lateDays: -1 },
  ];

  test('only timetabled vehicles get a late label', () => {
    expect(hasVehicleTimetable(V[1])).toBe(false);
    expect(lateLabel(V[1])).toBe('');
    expect(lateLabel(V[0])).toBe('+3 d');
    expect(lateLabel(V[2])).toBe('-1 d');
    expect(lateLabel({ orders: [{ stationId: 1, waitDays: 1 }] })).toBe('on time');
  });

  test('sort by lateness, untimetabled vehicles count as 0', () => {
    expect(sortVehicles(V, { sort: 'lateDays', dir: -1 }).map((v) => v.id)).toEqual([1, 2, 3]);
    expect(sortVehicles(V, { sort: 'lateDays', dir: 1 }).map((v) => v.id)).toEqual([3, 2, 1]);
  });
});
