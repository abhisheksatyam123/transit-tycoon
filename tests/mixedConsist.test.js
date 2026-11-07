import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { addWagonModel, sellWagon, moveWagon, cloneVehicle } from '../js/simulation/cmdVehicle.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { refundValue } from '../js/simulation/vehicles.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { Game } from '../js/simulation/game.js';
import { loadCargo, isFull, unload } from '../js/simulation/orders.js';

/** A coal line with a depot and a train of 3 hoppers (uniform). */
function setup(wagons = 3) {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('mixed consists', () => {
  test('a plain train has no v.consist; adding a different wagon creates one', () => {
    const { g, v } = setup(3);
    expect(v.consist).toBeUndefined();
    expect(addWagonModel(g.ctx, v.id, 'wag_coach').ok).toBe(true);
    expect(v.wagons).toBe(4);
    expect(v.consist.map((w) => w.modelId)).toEqual(['wag_hopper', 'wag_hopper', 'wag_hopper', 'wag_coach']);
    expect(v.consist[3].cargoId).toBe('PASS');
    expect(v.capacity).toBe(3 * 30 + 40);
  });

  test('adding the same model as the others keeps the train uniform (no v.consist)', () => {
    const { g, v } = setup(2);
    expect(addWagonModel(g.ctx, v.id, 'wag_hopper').ok).toBe(true);
    expect(v.wagons).toBe(3);
    expect(v.consist).toBeUndefined();
  });

  test('a mixed train loads each cargo from the station and delivers both', () => {
    const { g, L, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    // both cargos waiting at the pickup station
    addWaiting(L.a, 'COAL', 500, L.mine.x, L.mine.y, g.state.tick, 4000);
    addWaiting(L.a, 'PASS', 500, L.mine.x, L.mine.y, g.state.tick, 4000);
    v.state = 'loading';
    v.atStationId = L.a.id;
    v.orders = [{ stationId: L.a.id }];
    // loadCargo fills each slice from its own cargo
    loadCargo(g.ctx, v, L.a);
    expect(v.loads.COAL.amount).toBe(60);
    expect(v.loads.PASS.amount).toBe(40);
    expect(v.load.amount).toBe(100);
    expect(waitingAmount(L.a, 'COAL')).toBe(500 - 60);
    expect(waitingAmount(L.a, 'PASS')).toBe(500 - 40);
  });

  test('deliver both cargos: the destination accepts coal and passengers; both are paid', () => {
    const { g, L, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    L.b.accepts.PASS = 8;
    v.loads = {
      COAL: { amount: 60, sourceX: L.mine.x, sourceY: L.mine.y, sinceTick: 0, fromStationId: L.a.id },
      PASS: { amount: 40, sourceX: L.mine.x, sourceY: L.mine.y, sinceTick: 0, fromStationId: L.a.id },
    };
    v.load.amount = 100; v.load.fromStationId = L.a.id;
    v.orders = [{ stationId: L.b.id }]; v.orderIndex = 0;
    const money = g.state.company.money;
    const earned = unload(g.ctx, v, L.b);
    expect(earned).toBeGreaterThan(0);
    expect(g.state.company.money - money).toBe(earned);
    expect(v.load.amount).toBe(0);
    expect(v.loads.COAL).toBeUndefined();
    expect(v.loads.PASS).toBeUndefined();
  });

  test('full load (any cargo full) is not satisfied until every slice is full', () => {
    const { g, L, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    v.loads = { COAL: { amount: 60, sourceX: 0, sourceY: 0, sinceTick: 0, fromStationId: null }, PASS: { amount: 39, sourceX: 0, sourceY: 0, sinceTick: 0, fromStationId: null } };
    v.load.amount = 99;
    expect(isFull(v)).toBe(false);
    v.loads.PASS.amount = 40;
    expect(isFull(v)).toBe(true);
    expect(L).toBeTruthy();
  });

  test('reorder: moveWagon swaps neighbours and keeps the consist', () => {
    const { g, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    expect(moveWagon(g.ctx, v.id, 2, -1).ok).toBe(true);
    expect(v.consist.map((w) => w.modelId)).toEqual(['wag_hopper', 'wag_coach', 'wag_hopper']);
    expect(moveWagon(g.ctx, v.id, 0, -1).ok).toBe(false);
    expect(v.capacity).toBe(30 * 2 + 40);
  });

  test('sell a specific wagon: refund follows depreciated value; train becomes uniform again', () => {
    const { g, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    const before = g.state.company.money;
    const r = sellWagon(g.ctx, v.id, 2);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBe(before + r.cost);
    expect(v.wagons).toBe(2);
    expect(v.consist).toBeUndefined();
    expect(v.capacity).toBe(60);
    expect(sellWagon(g.ctx, v.id, 9).ok).toBe(false);
  });

  test('a mixed consist is priced as its wagons (value includes each model price)', () => {
    const { g, v } = setup(1);
    const before = v.value;
    addWagonModel(g.ctx, v.id, 'wag_coach');
    expect(v.value).toBe(before + refundValue(vehiclePrice(g.state, MODEL_BY_ID.wag_coach.cost))); // OL CreateVehicle.cpp:163-165: 7/8 of the price
  });

  test('clone copies the consist', () => {
    const { g, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    const c = cloneVehicle(g.ctx, v.id);
    expect(c.ok).toBe(true);
    expect(c.vehicle.consist.map((w) => w.modelId)).toEqual(['wag_hopper', 'wag_hopper', 'wag_coach']);
    expect(c.vehicle.capacity).toBe(v.capacity);
  });

  test('save round-trip keeps v.consist and the per-cargo load', () => {
    const { g, v } = setup(2);
    addWagonModel(g.ctx, v.id, 'wag_coach');
    const g2 = Game.deserialize(g.serialize());
    const v2 = g2.state.vehicles.find((x) => x.id === v.id);
    expect(v2.consist).toEqual(v.consist);
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('plain train unchanged: no consist field, segments and capacity as before', () => {
    const { v } = setup(3);
    expect(Object.prototype.hasOwnProperty.call(v, 'consist')).toBe(false);
    expect(v.capacity).toBe(90);
  });
});

