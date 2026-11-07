import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { addWagons, removeWagons } from '../js/simulation/cmdVehicle.js';
import { refundValue } from '../js/simulation/vehicles.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { MAX_WAGONS } from '../js/simulation/constants.js';
import { Game } from '../js/simulation/game.js';
import { historyNeeded, getVehicleSegments } from '../js/simulation/vehicles.js';

function train(wagons = 2) {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('consist editor (T19)', () => {
  test('add wagon: capacity, value and money follow the inflated per-wagon price', () => {
    const { g, v } = train(2);
    const w = MODEL_BY_ID.wag_hopper;
    const unit = vehiclePrice(g.state, w.cost);
    const before = g.state.company.money, valueBefore = v.value;
    const dry = addWagons(g.ctx, v.id, 1, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBe(unit);
    expect(g.state.company.money).toBe(before);
    const r = g.addWagons(v.id, 1);
    expect(r.ok).toBe(true);
    expect(v.wagons).toBe(3);
    expect(v.capacity).toBe(w.capacity * 3);
    expect(v.value).toBe(valueBefore + refundValue(unit)); // OL CreateVehicle.cpp:163-165: added wagon's value is 7/8
    expect(g.state.company.money).toBe(before - unit);
  });

  test('remove wagon: a new train refunds the add price, value reduced, capacity follows', () => {
    const { g, v } = train(3);
    const w = MODEL_BY_ID.wag_hopper;
    const unit = vehiclePrice(g.state, w.cost);
    const before = g.state.company.money, valueBefore = v.value;
    const r = g.removeWagons(v.id, 2);
    expect(r.ok).toBe(true);
    // refund = removed wagons' share of the train's current value (cmdVehicle.removeWagons), value = full purchase value 7/8-based
    const full = vehiclePrice(g.state, MODEL_BY_ID[v.modelId].cost) + unit * 3;
    expect(r.cost).toBe(Math.min(valueBefore, Math.round((valueBefore * unit * 2) / full)));
    expect(v.wagons).toBe(1);
    expect(v.capacity).toBe(w.capacity);
    expect(v.value).toBe(valueBefore - r.cost); // value drops by the refund paid
    expect(g.state.company.money).toBe(before + r.cost); // refund paid = 7/8-based share (see refundValue)
  });

  test('remove wagon from a depreciated train refunds its share of the current value', () => {
    const { g, v } = train(3);
    v.value = Math.round(v.value / 2);
    const valueBefore2 = v.value; // the depreciated value the refund is computed from
    const unit = vehiclePrice(g.state, MODEL_BY_ID.wag_hopper.cost);
    const r = g.removeWagons(v.id, 1);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeLessThan(unit);
    const full = vehiclePrice(g.state, MODEL_BY_ID[v.modelId].cost) + unit * 3;
    expect(Math.abs(r.cost - (valueBefore2 * unit) / full)).toBeLessThanOrEqual(1); // refund = share of the current (halved) value
  });

  test('a train can go down to 0 wagons (engine alone) and not below', () => {
    const { g, v } = train(1);
    expect(g.removeWagons(v.id, 1).ok).toBe(true);
    expect(v.wagons).toBe(0);
    expect(v.capacity).toBe(0);
    expect(g.removeWagons(v.id, 1).ok).toBe(false);
  });

  test('limit: at most MAX_WAGONS wagons', () => {
    const { g, v } = train(MAX_WAGONS - 1);
    expect(g.addWagons(v.id, 1).ok).toBe(true);
    expect(v.wagons).toBe(MAX_WAGONS);
    const r = g.addWagons(v.id, 1);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/at most/);
    expect(v.wagons).toBe(MAX_WAGONS);
  });

  test('refuses when not in a depot, when loaded, or with bad counts / non-trains', () => {
    const { g, v } = train(2);
    v.state = 'running';
    expect(g.addWagons(v.id, 1).error).toMatch(/depot/);
    expect(g.removeWagons(v.id, 1).error).toMatch(/depot/);
    v.state = 'depot';
    v.load.amount = 5;
    expect(g.addWagons(v.id, 1).error).toMatch(/Unload/);
    v.load.amount = 0;
    expect(g.addWagons(v.id, 0).ok).toBe(false);
    expect(g.addWagons(v.id, 1.5).ok).toBe(false);
    expect(g.removeWagons(v.id, 5).error).toMatch(/Only 2/);
    const bus = g.buyVehicle(g.state.depots[0].id, { modelId: 'bus_city' });
    if (bus.ok) expect(g.addWagons(bus.vehicle.id, 1).error).toMatch(/Only trains/);
    expect(g.addWagons('nope', 1).ok).toBe(false);
  });

  test('money check: refuses a purchase the company cannot afford', () => {
    const { g, v } = train(2);
    g.state.company.money = 0;
    const r = g.addWagons(v.id, 1);
    expect(r.ok).toBe(false);
    expect(v.wagons).toBe(2);
  });

  test('save/load round-trip keeps the lengthened consist', () => {
    const { g, v } = train(2);
    expect(g.addWagons(v.id, 2).ok).toBe(true);
    const g2 = Game.deserialize(g.serialize());
    const v2 = g2.state.vehicles.find((x) => x.id === v.id);
    expect(v2.wagons).toBe(4);
    expect(v2.capacity).toBe(MODEL_BY_ID.wag_hopper.capacity * 4);
    expect(v2.value).toBe(v.value);
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('a lengthened train runs and its body (history / segments) matches its wagons', () => {
    const { g, v, L } = train(2);
    expect(g.addWagons(v.id, 3).ok).toBe(true);
    const st = (x) => g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));
    expect(g.setOrders(v.id, [{ stationId: st(10).id, full: false }, { stationId: st(40).id, full: false }]).ok).toBe(true);
    expect(g.startVehicle(v.id).ok).toBe(true);
    g.stepDays(20);
    expect(v.state).not.toBe('depot');
    expect(v.history.length).toBeGreaterThanOrEqual(historyNeeded(v));
    const segs = getVehicleSegments(v);
    expect(segs.length).toBe(1 + v.wagons);
  });
});
