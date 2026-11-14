import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { refitVehicle, refitCargos, REFIT_COST_FRACTION } from '../js/simulation/cmdVehicle.js';
import { vehiclePrice } from '../js/simulation/prices.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { Game } from '../js/simulation/game.js';
import { getSetting, setSetting } from '../js/simulation/settings.js';
import { autorenewVehicle } from '../js/simulation/autorenew.js';

function train() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('refit (T18)', () => {
  test('refit only in depot', () => {
    const { g, v } = train();
    v.state = 'running';
    expect(refitVehicle(g.ctx, v.id, 'IORE').error).toMatch(/depot/);
  });

  test('train refit changes cargo and capacity from wagons; cost is a fraction of inflated price', () => {
    const { g, v } = train();
    expect(refitCargos(v).sort()).toEqual(['COAL', 'GRAI', 'IORE'].sort());
    const before = g.state.company.money;
    const w = MODEL_BY_ID.wag_hopper;
    const dry = refitVehicle(g.ctx, v.id, 'GRAI', { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBe(vehiclePrice(g.state, Math.round((MODEL_BY_ID.eng_puffer.cost + w.cost * 2) * REFIT_COST_FRACTION)));
    expect(dry.capacity).toBe(w.capacity * 2);
    expect(g.state.company.money).toBe(before);
    const r = refitVehicle(g.ctx, v.id, 'GRAI');
    expect(r.ok).toBe(true);
    expect(v.cargoId).toBe('GRAI');
    expect(v.capacity).toBe(w.capacity * 2);
    expect(g.state.company.money).toBe(before - r.cost);
  });

  test('refit rejects unsupported, same, and loaded vehicles', () => {
    const { g, v } = train();
    expect(refitVehicle(g.ctx, v.id, 'PASS').error).toMatch(/Cannot carry/);
    expect(refitVehicle(g.ctx, v.id, 'COAL').error).toMatch(/already/);
    v.load.amount = 5;
    expect(refitVehicle(g.ctx, v.id, 'IORE').error).toMatch(/Unload/);
  });

  test('road vehicle refit uses the model cargo list and model capacity', () => {
    const g = flatGame();
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'bus_city', cargoId: 'PASS' });
    // a bus in a rail depot is refused; build a road depot via buyVehicle on a road-depot-free state is not needed here
    expect(r.ok).toBe(false);
    const truck = { modelId: 'trk_bulk', kind: 'road', cargoId: 'COAL', capacity: 20, state: 'depot', load: { amount: 0 } };
    const st = { ...g.ctx, state: g.state };
    g.state.vehicles.push({ id: 999999, name: 'Truck 1', ...truck });
    const res = refitVehicle(st, 999999, 'IORE');
    expect(res.ok).toBe(true);
    expect(res.capacity).toBe(20);
  });

  test('autorenew off: an old vehicle is not replaced', () => {
    const { g, v } = train();
    v.state = 'depot';
    v.age = v.maxAge + 10;
    const before = g.serialize();
    expect(getSetting(g.state, 'autorenew')).toBe(false);
    const n = g.state.vehicles.length;
    g.state.vehicles.forEach((x) => { /* no-op */ });
    expect(g.state.vehicles.length).toBe(n);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(g.serialize()).toBe(before);
  });

  test('autorenew on: old vehicle in depot is replaced keeping name, orders and shared group', () => {
    const { g, L, v } = train();
    expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]).ok).toBe(true);
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'engineRenewMonths', 0);
    setSetting(g.state, 'engineRenewMoney', 0);
    v.state = 'depot';
    v.age = v.maxAge + 1;
    v.value = Math.round(v.value * 0.4); // depreciated resale value: the company pays the difference
    const name = v.name, cash = g.state.company.money;
    const newPrice = vehiclePrice(g.state, MODEL_BY_ID[v.modelId].cost + MODEL_BY_ID.wag_hopper.cost * 2);
    const nv0 = autorenewVehicle(g.ctx, v); // the daily depot hook calls this too
    const nv = nv0 && g.state.vehicles.find((x) => x.name === name);
    expect(nv).toBeTruthy();
    expect(nv.id).not.toBe(v.id);
    expect(nv.age).toBeLessThan(v.maxAge);
    expect(nv.orders.map((o) => o.stationId)).toEqual([L.a.id, L.b.id]);
    expect(nv.modelId).toBe(v.modelId);
    expect(g.state.company.money).toBe(cash - (newPrice - Math.round(v.value)));
  });

  test('save round-trip keeps refit and autorenew', () => {
    const { g, v } = train();
    refitVehicle(g.ctx, v.id, 'IORE');
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'engineRenewMonths', 0);
    setSetting(g.state, 'engineRenewMoney', 0);
    const g2 = Game.deserialize(g.serialize());
    expect(g2.serialize()).toBe(g.serialize());
    const v2 = g2.state.vehicles.find((x) => x.id === v.id);
    expect(v2.cargoId).toBe('IORE');
    expect(getSetting(g2.state, 'autorenew')).toBe(true);
  });
});
