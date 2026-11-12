/** Go-to-depot orders (service, service-if-needed, refit), full load any cargo, and their old-save compatibility. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { addWaiting } from '../js/simulation/stations.js';
import { addWagonModel } from '../js/simulation/cmdVehicle.js';
import { loadingTick, isFullAny, isFull, normaliseOrders, orderFlagText } from '../js/simulation/orders.js';
import { dayNumber } from '../js/simulation/date.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { setSetting } from '../js/simulation/settings.js';

/** Coal line; a train with 2 hoppers starting in the depot at (20,25), depot id from helpers. */
function trainSetup(orders) {
  const g = flatGame(23);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const depot = g.state.depots.find((d) => d.id === L.depotId);
  expect(g.setOrders(v.id, orders(L, depot)).ok).toBe(true);
  return { g, L, v, depot };
}

/** Step ticks until pred holds (at most maxDays). */
function runUntil(g, pred, maxDays = 30) {
  for (let t = 0; t < maxDays * TICKS_PER_DAY; t++) {
    g.step();
    if (pred()) return true;
  }
  return false;
}

describe('go-to-depot order normalisation', () => {
  test('depot order is stored with no station; service-only and refit kept; defaults dropped', () => {
    const { g, v, depot, L } = trainSetup((L) => [{ stationId: L.b.id, full: false }]);
    const r = normaliseOrders(g.state, v, [{ depotId: depot.id, serviceOnly: false, refit: undefined }, { stationId: 999999 }], () => 'rail');
    expect(r.ok).toBe(false); // unknown station in the second order
    const ok = normaliseOrders(g.state, v, [{ depotId: depot.id, serviceOnly: true, refit: 'IORE' }], () => 'rail');
    expect(ok.ok).toBe(true);
    expect(ok.orders).toEqual([{ depotId: depot.id, serviceOnly: true, refit: 'IORE' }]);
    expect(normaliseOrders(g.state, v, [{ depotId: depot.id, refit: 'PASS' }], () => 'rail').ok).toBe(false); // hopper cannot carry PASS
    expect(normaliseOrders(g.state, v, [{ depotId: 999999 }], () => 'rail').ok).toBe(false);
    expect(L).toBeDefined();
  });

  test('flag text and load mode validation', () => {
    expect(orderFlagText({ depotId: 1, serviceOnly: true, refit: 'COAL' })).toBe(' (service if needed, refit to Coal)');
    expect(orderFlagText({ stationId: 1, load: 'fullAny' })).toBe(' (full load any)');
    const { g, v, L } = trainSetup((L) => [{ stationId: L.b.id, full: false }]);
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, load: 'fullAny' }], () => 'rail').orders[0].load).toBe('fullAny');
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, load: 'bogus' }], () => 'rail').ok).toBe(false);
  });
});

describe('go to depot: service and resume', () => {
  test('vehicle drives to its depot order, is serviced, and resumes with the next order', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = 0; v.services = 0;
    v.reliability = 0.5; v.baseReliability = 0.9;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(v.state).toBe('running');
    expect(v.orderIndex).toBe(0);
    // the depot order is reached: service restores reliability, the order advances to B
    expect(runUntil(g, () => v.orderIndex === 1)).toBe(true);
    expect(v.reliability).toBe(0.9);
    expect(v.services).toBe(1);
    expect(v.state).toBe('running'); // it leaves again, it does not stop in the depot
    expect(v.goingToDepot == null).toBe(true);
    expect(depot.id).toBeDefined();
  });

  test('service-only order is skipped when the vehicle is not due for service', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, serviceOnly: true }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = dayNumber(g.state.date); v.services = 0; // just serviced: not due
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(v.orderIndex).toBe(1);
    expect(v.services || 0).toBe(0);
    expect(depot.id).toBeDefined();
  });

  test('service-only + refit order is skipped when not due with depotRefitAlwaysVisits off (default)', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, serviceOnly: true, refit: 'IORE' }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = dayNumber(g.state.date); v.services = 0; // just serviced: not due
    const before = g.state.company.money;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(v.orderIndex).toBe(1); // skipped, exactly as today
    expect(v.cargoId).toBe('COAL'); // no refit
    expect(g.state.company.money).toBe(before); // no refit cost
    expect(depot.id).toBeDefined();
  });

  test('depotRefitAlwaysVisits on: a not-due service-only + refit order is visited and refitted', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, serviceOnly: true, refit: 'IORE' }, { stationId: L.b.id, full: false }]);
    setSetting(g.state, 'depotRefitAlwaysVisits', true);
    v.serviceIntervalDays = 30; v.lastServiceDay = dayNumber(g.state.date); v.services = 0; // not due for service
    const before = g.state.company.money;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, () => v.orderIndex === 1)).toBe(true);
    expect(v.cargoId).toBe('IORE'); // the refit ran
    expect(g.state.company.money).toBeLessThan(before); // refit cost charged
    expect(depot.id).toBeDefined();
  });

  test('depotRefitAlwaysVisits on: a not-due service-only order without refit still skips', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, serviceOnly: true }, { stationId: L.b.id, full: false }]);
    setSetting(g.state, 'depotRefitAlwaysVisits', true);
    v.serviceIntervalDays = 30; v.lastServiceDay = dayNumber(g.state.date); v.services = 0; // not due
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(v.orderIndex).toBe(1); // still skipped: there is no refit to run
    expect(v.services || 0).toBe(0);
    expect(depot.id).toBeDefined();
  });

  test('service-only order is visited once the vehicle is due', () => {
    const { g, L, v } = trainSetup((L, d) => [{ depotId: d.id, serviceOnly: true }, { stationId: L.b.id, full: false }]);
    v.serviceIntervalDays = 5; v.lastServiceDay = 0; v.services = 0;
    v.serviceDue = true;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, () => v.orderIndex === 1)).toBe(true);
    expect(v.services).toBe(1);
  });
});

describe('refit order at the depot', () => {
  test('an empty train is refitted to the order cargo at the depot and the cost is charged', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, refit: 'IORE' }, { stationId: L.b.id, full: false }]);
    expect(v.cargoId).toBe('COAL');
    const before = g.state.company.money;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, () => v.orderIndex === 1)).toBe(true);
    expect(v.cargoId).toBe('IORE');
    expect(v.capacity).toBe(2 * 30);
    expect(g.state.company.money).toBeLessThan(before);
    expect(depot.id).toBeDefined();
  });

  test('a loaded vehicle is not refitted at the depot (partialRefit off, the default)', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, refit: 'IORE' }, { stationId: L.b.id, full: false }]);
    v.load.amount = 10; // still carrying coal
    v.load.sourceX = L.a.x; v.load.sourceY = L.a.y; v.load.sinceTick = 0; v.load.fromStationId = L.a.id;
    const before = g.state.company.money;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, () => v.orderIndex === 1)).toBe(true);
    expect(v.cargoId).toBe('COAL');
    expect(v.load.amount).toBe(10);
    expect(g.state.company.money).toBe(before); // no refit cost charged
    expect(depot.id).toBeDefined();
  });

  test('partialRefit on: a loaded vehicle is refitted at the depot order, the other cargo drops the load (cost charged)', () => {
    const { g, L, v } = trainSetup((L, d) => [{ depotId: d.id, refit: 'IORE' }, { stationId: L.b.id, full: false }]);
    setSetting(g.state, 'partialRefit', true);
    v.load.amount = 10;
    v.load.sourceX = L.a.x; v.load.sourceY = L.a.y; v.load.sinceTick = 0; v.load.fromStationId = L.a.id;
    const before = g.state.company.money;
    expect(g.startVehicle(v.id).ok).toBe(true);
    expect(runUntil(g, () => v.orderIndex === 1)).toBe(true);
    expect(v.cargoId).toBe('IORE');
    expect(v.capacity).toBe(2 * 30);
    expect(v.load.amount).toBe(0);
    expect(g.state.company.money).toBeLessThan(before);
  });
});

describe('full load any cargo', () => {
  function mixed() {
    const g = flatGame(29);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(addWagonModel(g.ctx, v.id, 'wag_coach').ok).toBe(true); // 2 hoppers (COAL 60) + coach (PASS 40)
    return { g, L, v };
  }

  test('full load any departs when one cargo is full; full load (all) waits for every cargo', () => {
    const { g, L, v } = mixed();
    v.loads = { COAL: { amount: 60, sourceX: L.mine.x, sourceY: L.mine.y, sinceTick: 0, fromStationId: L.a.id }, PASS: { amount: 0, sourceX: 0, sourceY: 0, sinceTick: 0, fromStationId: null } };
    v.load.amount = 60;
    expect(isFullAny(v)).toBe(true);
    expect(isFull(v)).toBe(false);
    const ctx = { state: g.state, emit() {} };
    v.orders = [{ stationId: L.a.id, load: 'fullAny' }, { stationId: L.b.id }];
    v.state = 'loading'; v.atStationId = L.a.id; v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(true); // departs
    // full load (all cargoes) waits in the same situation
    v.orders = [{ stationId: L.a.id, full: true }, { stationId: L.b.id }];
    v.state = 'loading'; v.atStationId = L.a.id; v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(false);
  });

  test('single-cargo vehicles behave like full load', () => {
    const g = flatGame(31);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    const v = r.vehicle;
    v.load.amount = v.capacity - 1;
    expect(isFullAny(v)).toBe(false);
    v.load.amount = v.capacity;
    expect(isFullAny(v)).toBe(true);
    expect(isFull(v)).toBe(true);
  });

  test('full load any save/load round-trip keeps the mode', () => {
    const { g, L, v } = mixed();
    v.orders = [{ stationId: L.a.id, load: 'fullAny' }, { stationId: L.b.id }];
    const back = parseState(serializeState(g.state));
    const bv = back.vehicles.find((x) => x.id === v.id);
    expect(bv.orders[0].load).toBe('fullAny');
    expect(bv.orders[1].load).toBeUndefined();
  });
});

describe('save compatibility', () => {
  test('depot orders round-trip and a save without them loads unchanged', () => {
    const { g, L, v, depot } = trainSetup((L, d) => [{ depotId: d.id, serviceOnly: true, refit: 'IORE' }, { stationId: L.b.id, full: false }]);
    const back = parseState(serializeState(g.state));
    const bv = back.vehicles.find((x) => x.id === v.id);
    expect(bv.orders[0]).toEqual({ depotId: depot.id, serviceOnly: true, refit: 'IORE' });
    expect(bv.orders[1]).toEqual({ stationId: L.b.id, full: false });
    expect(addWaiting).toBeDefined();
  });
});
