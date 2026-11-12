/**
 * Timetable correctness (G7 minimal, G8): conditional orders are skipped by the completeness check and
 * refuse travel/speed edits; aircraft order speed limits are refused, stripped on normalisation and
 * hidden from the orders UI.
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { AIRPORT_W, AIRPORT_H } from '../js/simulation/constants.js';
import { timetableComplete, scheduledDeparture, roundTicks } from '../js/simulation/ttSchedule.js';
import { setSetting } from '../js/simulation/settings.js';

function trainSetup() {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: false }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v };
}

/** First top-left corner (scanning from `from`) where an airport can be built (dry run). */
function findAirportSpot(game, from = { x: 4, y: 4 }, avoid = null) {
  for (let y = from.y; y < game.state.map.height - AIRPORT_H; y++) {
    for (let x = from.x; x < game.state.map.width - AIRPORT_W; x++) {
      if (avoid && Math.abs(avoid.x - x) + Math.abs(avoid.y - y) < 30) continue;
      if (game.buildAirport(x, y, { dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}

function planeSetup() {
  const game = Game.create({ seed: 5, width: 96, height: 96 });
  game.state.company.money = 5_000_000;
  const a = findAirportSpot(game);
  const A = game.buildAirport(a.x, a.y);
  const b = findAirportSpot(game, { x: 4, y: 4 }, a);
  const B = game.buildAirport(b.x, b.y);
  const r = game.buyVehicle(A.depotId, { modelId: 'ac_li2' });
  expect(r.ok).toBe(true);
  expect(game.setOrders(r.vehicle.id, [{ stationId: A.stationId }, { stationId: B.stationId }]).ok).toBe(true);
  return { game, v: r.vehicle, A, B };
}

describe('G7 conditional orders and timetable completeness', () => {
  test('conditional orders are skipped: a timed station route with a conditional is complete', () => {
    const { g, L, v } = trainSetup();
    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { stationId: L.b.id },
    ]).ok).toBe(true);
    expect(timetableComplete(v)).toBe(false);
    expect(g.setOrderTimetable(v.id, 0, { travelDays: 2 }).ok).toBe(true);
    expect(timetableComplete(v)).toBe(false);
    expect(g.setOrderTimetable(v.id, 2, { travelDays: 3 }).ok).toBe(true);
    expect(timetableComplete(v)).toBe(true);
    // spreading now works even though the conditional has no travel time
    const r = g.spreadTimetableStart(v.id);
    expect(r.ok).toBe(true);
  });

  test('a missing travel time on a real order still makes the timetable incomplete', () => {
    const { g, L, v } = trainSetup();
    g.setOrders(v.id, [{ stationId: L.a.id }, { stationId: L.b.id }]);
    g.setOrderTimetable(v.id, 0, { travelDays: 2 });
    expect(timetableComplete(v)).toBe(false);
    g.setOrderTimetable(v.id, 1, { travelDays: 2 });
    expect(timetableComplete(v)).toBe(true);
  });

  test('timetable times are refused on a conditional order (setOrderTimetable and changeOrderTimes)', () => {
    const { g, L, v } = trainSetup();
    g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { stationId: L.b.id },
    ]);
    expect(g.setOrderTimetable(v.id, 1, { travelDays: 5 }).ok).toBe(false);
    expect(g.setOrderTimetable(v.id, 1, { waitDays: 1 }).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 1, { travelDays: 5 }).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 1, { waitDays: 1 }).ok).toBe(false);
    expect(v.orders[1].travelDays).toBeUndefined();
    expect(v.orders[1].waitDays).toBeUndefined();
    // Ctrl-all applies to the station orders and leaves the conditional untouched
    expect(g.changeOrderTimes(v.id, 'all', { waitDays: 1 }).ok).toBe(true);
    expect(v.orders[0].waitDays).toBe(1);
    expect(v.orders[1].waitDays).toBeUndefined();
    expect(v.orders[2].waitDays).toBe(1);
  });

  test('separation engages on a route whose only untimed order is conditional', () => {
    const { g, L, v } = trainSetup();
    g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { stationId: L.b.id },
    ]);
    g.setOrderTimetable(v.id, 0, { travelDays: 2 });
    g.setOrderTimetable(v.id, 2, { travelDays: 3 });
    setSetting(g.state, 'timetableSeparation', true);
    expect(g.cloneVehicle(v.id, { shareOrders: true }).ok).toBe(true);
    expect(timetableComplete(v)).toBe(true);
    const T = roundTicks(v.orders);
    expect(T).toBe(5 * 96);
    const a = scheduledDeparture(g.state, v, 0);
    expect(a).not.toBeNull();
    g.state.tick = a + 1;
    expect(scheduledDeparture(g.state, v, 0) - a).toBe(T);
  });
});

describe('G8 order speed limits for aircraft and conditional orders', () => {
  test('land vehicles still accept and keep an order speed limit', () => {
    const { g, v } = trainSetup();
    expect(g.changeOrderTimes(v.id, 0, { maxSpeed: 200 }).ok).toBe(true);
    expect(v.orders[0].maxSpeed).toBe(200);
    expect(g.changeOrderTimes(v.id, 0, { maxSpeed: null }).ok).toBe(true);
    expect(v.orders[0].maxSpeed).toBeUndefined();
  });

  test('aircraft refuse an order speed limit (and keep wait edits)', () => {
    const { game, v } = planeSetup();
    expect(game.changeOrderTimes(v.id, 0, { maxSpeed: 200 }).ok).toBe(false);
    expect(v.orders[0].maxSpeed).toBeUndefined();
    expect(game.changeOrderTimes(v.id, 'all', { maxSpeed: 200 }).ok).toBe(false);
    expect(game.changeOrderTimes(v.id, 0, { maxSpeed: null }).ok).toBe(false);
    expect(game.changeOrderTimes(v.id, 0, { waitDays: 1 }).ok).toBe(true);
    expect(v.orders[0].waitDays).toBe(1);
  });

  test('conditional orders refuse a speed limit; Ctrl-all skips them', () => {
    const { g, L, v } = trainSetup();
    g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { stationId: L.b.id },
    ]);
    expect(g.changeOrderTimes(v.id, 1, { maxSpeed: 200 }).ok).toBe(false);
    expect(g.changeOrderTimes(v.id, 1, { travelDays: 2, maxSpeed: 200 }).ok).toBe(false);
    const all = g.changeOrderTimes(v.id, 'all', { maxSpeed: 200 });
    expect(all.ok).toBe(true);
    expect(all.count).toBe(2);
    expect(v.orders[0].maxSpeed).toBe(200);
    expect(v.orders[2].maxSpeed).toBe(200);
    expect(v.orders[1].maxSpeed).toBeUndefined();
  });

  test('normalisation drops maxSpeed on aircraft and conditional entries', () => {
    const { game, v, A, B } = planeSetup();
    expect(game.setOrders(v.id, [
      { stationId: A.stationId, maxSpeed: 200 },
      { stationId: B.stationId, maxSpeed: 300 },
    ]).ok).toBe(true);
    expect(v.orders.every((o) => o.maxSpeed === undefined)).toBe(true);

    const t = trainSetup();
    expect(t.g.setOrders(t.v.id, [
      { stationId: t.L.a.id, maxSpeed: 100 },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 }, maxSpeed: 300 },
      { stationId: t.L.b.id, maxSpeed: 120 },
    ]).ok).toBe(true);
    expect(t.v.orders[0].maxSpeed).toBe(100);
    expect(t.v.orders[1].maxSpeed).toBeUndefined();
    expect(t.v.orders[2].maxSpeed).toBe(120);
  });
});
