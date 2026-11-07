/**
 * One depot visit = one service (OpenTTD: one VehicleServiceInDepot per depot entry). Covers go-to-depot orders,
 * service trips (serviceAtDepot) and send-to-depot. A visit must not count twice on consecutive ticks.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

function setup(orders) {
  const g = flatGame(23);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const depot = g.state.depots.find((d) => d.id === L.depotId);
  expect(g.setOrders(v.id, orders(L, depot)).ok).toBe(true);
  return { g, L, v, depot };
}

/** Run `days` days, recording the tick of every services increment; returns the tick list. */
function serviceTicks(g, v, days) {
  const ticks = [];
  let last = v.services || 0;
  for (let t = 0; t < days * TICKS_PER_DAY; t++) {
    g.step();
    const n = v.services || 0;
    if (n !== last) { ticks.push(t); last = n; }
  }
  return ticks;
}

/** Two increments within a few ticks are one depot visit counted twice. */
function assertOnePerVisit(ticks) {
  for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThan(10);
}

describe('depot service count: one visit, one service', () => {
  test('go-to-depot order with a service interval: each visit counts once', () => {
    const { g, L, v } = setup((L, d) => [{ stationId: L.a.id, full: false }, { stationId: L.b.id, full: false }, { depotId: d.id }]);
    v.serviceIntervalDays = 1; v.lastServiceDay = 0; v.services = 0;
    g.startVehicle(v.id);
    const ticks = serviceTicks(g, v, 40);
    expect(ticks.length).toBeGreaterThan(0);
    assertOnePerVisit(ticks);
  });

  test('service trip (serviceAtDepot) ending on a depot-order depot: counts once', () => {
    const { g, L, v } = setup((L, d) => [{ stationId: L.a.id, full: false }, { stationId: L.b.id, full: false }, { depotId: d.id }]);
    v.serviceIntervalDays = 1; v.lastServiceDay = 0; v.services = 0;
    g.startVehicle(v.id);
    assertOnePerVisit(serviceTicks(g, v, 40));
  });

  test('send to depot (service) with a go-to-depot order at that depot: counts once', () => {
    const { g, v } = setup((L, d) => [{ stationId: L.b.id, full: false }, { depotId: d.id }]);
    v.serviceIntervalDays = 30; v.lastServiceDay = 0; v.services = 0;
    g.startVehicle(v.id);
    for (let i = 0; i < 20; i++) g.step();
    expect(g.sendToDepot(v.id, { service: true }).ok).toBe(true);
    assertOnePerVisit(serviceTicks(g, v, 20));
  });
});
