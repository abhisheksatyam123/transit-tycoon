/** Clone vehicle (copy / shared orders), shared order edits, unshare, sell leaves the share, save round-trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { refundValue } from '../js/simulation/vehicles.js';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { sharers } from '../js/simulation/sharedOrders.js';
import { vehiclePrice } from '../js/simulation/prices.js';

function setup() {
  const g = flatGame(21);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v };
}

describe('clone vehicle', () => {
  test('copy: same model/consist in the same depot, normal price, orders copied not shared', () => {
    const { g, L, v } = setup();
    const before = g.state.vehicles.length;
    const money = g.state.company.money;
    const r = g.cloneVehicle(v.id, { shareOrders: false });
    expect(r.ok).toBe(true);
    expect(g.state.vehicles.length).toBe(before + 1);
    const c = r.vehicle;
    expect(c.modelId).toBe(v.modelId);
    expect(c.wagonModelId).toBe(v.wagonModelId);
    expect(c.wagons).toBe(v.wagons);
    expect(c.cargoId).toBe(v.cargoId);
    expect(c.depotId).toBe(L.depotId);
    expect(c.state).toBe('depot');
    expect(c.orders).toEqual(v.orders);
    expect(c.orders).not.toBe(v.orders);
    expect(c.orderGroup).toBeUndefined();
    expect(c.value).toBe(refundValue(r.cost)); // recorded value = sell-back 7/8 of the price (OL CreateVehicle.cpp:163-165)
    expect(g.state.company.money).toBe(money - r.cost);
  });

  test('cost equals the normal buy price (inflated) for the same spec', () => {
    const { g, v } = setup();
    const buy = g.buyVehicle(v.depotId, { modelId: v.modelId, wagonModelId: v.wagonModelId, wagons: v.wagons, cargoId: v.cargoId }, { dryRun: true });
    const clone = g.cloneVehicle(v.id, { dryRun: true });
    expect(clone.ok).toBe(true);
    expect(clone.cost).toBe(buy.cost);
    expect(clone.cost).toBe(vehiclePrice(g.state, clone.cost));
  });

  test('clone with share orders joins one group; both members see the shared list', () => {
    const { g, L, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(v.orderGroup).toBeDefined();
    expect(c.orderGroup).toBe(v.orderGroup);
    expect(sharers(g.state, v)).toEqual([c]);
    expect(sharers(g.state, c)).toEqual([v]);
    expect(L.a.id).toBeDefined();
  });

  test('clone of an unknown vehicle fails', () => {
    const { g } = setup();
    expect(g.cloneVehicle(999999).ok).toBe(false);
  });
});

describe('shared orders', () => {
  test('editing orders of one member updates all members; each keeps its own orderIndex', () => {
    const { g, L, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    c.orderIndex = 1;
    expect(g.setOrders(v.id, [{ stationId: L.b.id }, { stationId: L.a.id, full: true }]).ok).toBe(true);
    expect(c.orders).toEqual(v.orders);
    expect(c.orderIndex).toBe(1);
    expect(v.orderIndex).toBe(0);
    expect(g.modifyOrder(c.id, 0, { unload: 'transfer' }).ok).toBe(true);
    expect(v.orders[0].unload).toBe('transfer');
  });

  test('unshare keeps the current orders and makes later edits independent', () => {
    const { g, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(g.unshareOrders(c.id).ok).toBe(true);
    expect(c.orderGroup).toBeUndefined();
    expect(v.orderGroup).toBeUndefined(); // group of two dissolves
    expect(c.orders).toEqual(v.orders);
    expect(g.unshareOrders(c.id).ok).toBe(false);
    g.setOrders(v.id, [{ stationId: v.orders[0].stationId }]);
    expect(c.orders.length).toBe(2);
  });

  test('selling a member removes it from the share; the rest stay shared', () => {
    const { g, L, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    const d = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    expect(sharers(g.state, v).length).toBe(2);
    // a depot-parked member can be sold
    expect(g.sellVehicle(c.id).ok).toBe(true);
    expect(sharers(g.state, v)).toEqual([d]);
    g.setOrders(v.id, [{ stationId: L.a.id }]);
    expect(d.orders.length).toBe(1);
  });

  test('cloning a vehicle without shared orders does not share its existing orders with a stranger', () => {
    const { g, v } = setup();
    const c = g.cloneVehicle(v.id).vehicle;
    expect(c.orderGroup).toBeUndefined();
    g.setOrders(c.id, [{ stationId: v.orders[0].stationId }]);
    expect(v.orders.length).toBe(2);
  });
});

describe('save compatibility', () => {
  test('shared order group survives serialize / deserialize', () => {
    const { g, v } = setup();
    const c = g.cloneVehicle(v.id, { shareOrders: true }).vehicle;
    const s = parseState(serializeState(g.state));
    const v2 = s.vehicles.find((x) => x.id === v.id);
    const c2 = s.vehicles.find((x) => x.id === c.id);
    expect(v2.orderGroup).toBe(c2.orderGroup);
    expect(v2.orderGroup).toBeDefined();
  });

  test('a plain vehicle serialises without the new fields', () => {
    const { g, v } = setup();
    const s = parseState(serializeState(g.state));
    const v2 = s.vehicles.find((x) => x.id === v.id);
    expect('orderGroup' in v2).toBe(false);
    expect('serviceIntervalDays' in v2).toBe(false);
    expect(Game).toBeDefined();
  });
});
