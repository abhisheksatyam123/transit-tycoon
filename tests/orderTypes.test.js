/** Order flags: load/unload modes, skip, modify, save round-trip and old-save compatibility. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { unload, loadingTick, loadCargo, normaliseOrders, orderFlagText } from '../js/simulation/orders.js';
import { waitingAmount, addWaiting } from '../js/simulation/stations.js';

/** Coal train with orders A(full load)->B; returns the vehicle with a loaded cargo packet. */
function setup(orders) {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, orders(L)).ok).toBe(true);
  const ctx = { state: g.state, emit() {} };
  return { g, L, v, ctx };
}

/** Put `amount` coal from station A aboard the vehicle (as if loaded there). */
function loadCoal(v, L, amount) {
  v.cargoId = 'COAL';
  v.load.amount = amount;
  v.load.sourceX = L.a.x;
  v.load.sourceY = L.a.y;
  v.load.sinceTick = 0;
  v.load.fromStationId = L.a.id;
}

describe('order normalisation', () => {
  test('legacy full flag still maps to load full; defaults are not stored', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
    expect(v.orders).toEqual([{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
    const r = normaliseOrders(g.state, v, [{ stationId: L.b.id, full: false, load: 'normal', unload: 'normal' }], () => 'rail');
    expect(r.ok).toBe(true);
    expect(r.orders).toEqual([{ stationId: L.b.id, full: false }]);
  });

  test('unknown load / unload modes are rejected', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: false }]);
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, load: 'bogus' }], () => 'rail').ok).toBe(false);
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, unload: 'bogus' }], () => 'rail').ok).toBe(false);
  });

  test('flag text for the order list', () => {
    expect(orderFlagText({ stationId: 1, full: false })).toBe('');
    expect(orderFlagText({ stationId: 1, full: true })).toBe(' (full load)');
    expect(orderFlagText({ stationId: 1, full: false, unload: 'transfer' })).toBe(' (transfer)');
    expect(orderFlagText({ stationId: 1, full: false, load: 'none', unload: 'none' })).toBe(' (no loading, no unloading)');
  });
});

describe('unload modes', () => {
  test('normal: delivers and pays at an accepting station, leaves cargo aboard otherwise', () => {
    const { g, L, v, ctx } = setup((L) => [{ stationId: L.b.id, full: false }]);
    expect(L.b.accepts.COAL).toBe(true);
    loadCoal(v, L, 40);
    const before = g.state.company.money;
    expect(unload(ctx, v, L.b)).toBeGreaterThan(0);
    expect(v.load.amount).toBe(0);
    expect(g.state.company.money).toBeGreaterThan(before);
  });

  test('normal: cargo is not unloaded at its own source station', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: false }]);
    loadCoal(v, L, 30);
    expect(unload(ctx, v, L.a)).toBe(0); // same station as the source: nothing happens
    expect(v.load.amount).toBe(30);
    expect(waitingAmount(L.a, 'COAL')).toBe(0);
  });

  test('unload all: cargo not accepted becomes waiting cargo at the station', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: false, unload: 'all' }]);
    L.a.accepts.COAL = false;
    loadCoal(v, L, 30);
    v.load.fromStationId = 999; // loaded elsewhere
    expect(unload(ctx, v, L.a)).toBe(0);
    expect(v.load.amount).toBe(0);
    expect(waitingAmount(L.a, 'COAL')).toBe(30);
  });

  test('transfer: cargo moves to the station as waiting cargo and nothing is paid', () => {
    const { g, v, L, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 25);
    const before = g.state.company.money;
    expect(unload(ctx, v, L.b)).toBe(0);
    expect(v.load.amount).toBe(0);
    expect(waitingAmount(L.b, 'COAL')).toBe(25);
    expect(g.state.company.money).toBe(before);
  });

  test('transfer: a vehicle never dumps cargo at the station it was loaded at', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 25);
    expect(unload(ctx, v, L.a)).toBe(0);
    expect(v.load.amount).toBe(25);
    expect(waitingAmount(L.a, 'COAL')).toBe(0);
  });

  test('none: cargo stays aboard even when the station accepts it', () => {
    const { g, v, L, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'none' }]);
    loadCoal(v, L, 30);
    const before = g.state.company.money;
    expect(unload(ctx, v, L.b)).toBe(0);
    expect(v.load.amount).toBe(30);
    expect(g.state.company.money).toBe(before);
  });

  test('transfer keeps the origin so the final delivery pays for the whole trip', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const packet = L.b.cargo.COAL[L.b.cargo.COAL.length - 1];
    expect(packet.sourceX).toBe(L.a.x);
    expect(packet.sourceY).toBe(L.a.y);
  });

  test('transfer cargo can be picked up later by another vehicle', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    expect(waitingAmount(L.b, 'COAL')).toBe(20);
    // a second vehicle (here the same struct, emptied) loads the transferred cargo at B
    v.load.amount = 0; v.load.fromStationId = null;
    expect(loadCargo(ctx, v, L.b)).toBe(20);
    expect(v.load.amount).toBe(20);
    expect(waitingAmount(L.b, 'COAL')).toBe(0);
  });
});

describe('load modes', () => {
  test('load none: a loading vehicle does not take waiting cargo', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: false, load: 'none' }]);
    addWaiting(L.a, 'COAL', 50, L.a.x, L.a.y, 0, 4000);
    v.atStationId = L.a.id;
    v.loadingTicks = 1;
    v.state = 'loading';
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.load.amount).toBe(0);
    expect(waitingAmount(L.a, 'COAL')).toBe(50);
  });

  test('normal load takes waiting cargo', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.a.id, full: false }]);
    addWaiting(L.a, 'COAL', 50, L.a.x, L.a.y, 0, 4000);
    v.cargoId = 'COAL';
    v.atStationId = L.a.id;
    v.loadingTicks = 1;
    v.state = 'loading';
    loadingTick(ctx, v);
    expect(v.load.amount).toBeGreaterThan(0);
  });
});

describe('modify and skip', () => {
  test('modifyOrder sets flags on one order and keeps the others', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
    expect(g.modifyOrder(v.id, 1, { unload: 'transfer' }).ok).toBe(true);
    expect(v.orders[1]).toEqual({ stationId: L.b.id, full: false, unload: 'transfer' });
    expect(v.orders[0]).toEqual({ stationId: L.a.id, full: true });
    expect(g.modifyOrder(v.id, 1, { unload: 'normal' }).ok).toBe(true);
    expect(v.orders[1]).toEqual({ stationId: L.b.id, full: false });
  });

  test('modifyOrder rejects bad index and modes, and keeps the order index', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: false }, { stationId: L.b.id, full: false }]);
    v.orderIndex = 1;
    expect(g.modifyOrder(v.id, 5, { unload: 'all' }).ok).toBe(false);
    expect(g.modifyOrder(v.id, 0, { load: 'nope' }).ok).toBe(false);
    expect(g.modifyOrder(v.id, 0, { unload: 'all' }).ok).toBe(true);
    expect(v.orderIndex).toBe(1);
  });

  test('skipToOrder jumps the index and abandons a loading stop', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: false }, { stationId: L.b.id, full: false }]);
    v.state = 'loading';
    v.atStationId = L.a.id;
    v.loadingTicks = 30;
    expect(g.skipToOrder(v.id, 1).ok).toBe(true);
    expect(v.orderIndex).toBe(1);
    expect(v.state).not.toBe('loading');
    expect(v.atStationId).toBe(null);
  });

  test('skipToOrder rejects out-of-range indices', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: false }]);
    expect(g.skipToOrder(v.id, 1).ok).toBe(false);
    expect(g.skipToOrder(v.id, -1).ok).toBe(false);
    expect(g.skipToOrder(999, 0).ok).toBe(false);
  });
});

describe('save compatibility', () => {
  test('flags round-trip through serialize / deserialize', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: true, load: 'full' }, { stationId: L.b.id, full: false, unload: 'transfer' }]);
    const g2 = Game.deserialize(g.serialize());
    const v2 = g2.state.vehicles.find((x) => x.id === v.id);
    expect(v2.orders[1]).toEqual({ stationId: L.b.id, full: false, unload: 'transfer' });
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('an old save with only {stationId, full} orders loads with normal behaviour', () => {
    const { g, L, v } = setup((L) => [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
    const old = JSON.parse(g.serialize());
    const ov = old.vehicles.find((x) => x.id === v.id);
    ov.orders = [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }];
    const g2 = Game.deserialize(JSON.stringify(old));
    const v2 = g2.state.vehicles.find((x) => x.id === v.id);
    expect(v2.orders).toEqual([{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]);
  });
});
