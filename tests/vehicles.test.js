import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';

function trainSetup() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: g.listModels('engine')[0].id, wagonModelId: 'wag_hopper', wagons: 4, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]).ok).toBe(true);
  return { g, L, v };
}

describe('vehicles', () => {
  test('buyVehicle with dryRun returns cost and does not add a vehicle', () => {
    const g = flatGame();
    const L = coalLine(g);
    const before = g.serialize();
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.serialize()).toBe(before);
  });

  test('buying with insufficient money fails', () => {
    const g = flatGame();
    const L = coalLine(g);
    g.state.company.money = 100;
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r).toEqual({ ok: false, error: 'Not enough money' });
  });

  test('a freshly bought train starts in depot with no segments', () => {
    const { g, v } = trainSetup();
    expect(v.state).toBe('depot');
    expect(g.getVehicleSegments(v)).toEqual([]);
  });

  test('a running train returns 1 + wagons segments', () => {
    const { g, v } = trainSetup();
    expect(g.startVehicle(v.id).ok).toBe(true);
    let segs = [];
    for (let i = 0; i < 2000 && segs.length === 0; i++) { g.step(); segs = g.getVehicleSegments(v); }
    expect(segs.length).toBe(1 + v.wagons);
    expect(segs[0].part).toBe('loco');
    expect(segs.slice(1).every((s) => s.part === 'wagon')).toBe(true);
  });

  test('bus scenario between two bus stops runs without throwing and moves', () => {
    const g = flatGame();
    expect(g.buildRoad(10, 30, 40, 30).ok).toBe(true);
    const sa = g.buildRoadStop(12, 30, 'bus'), sb = g.buildRoadStop(38, 30, 'bus');
    expect(sa.ok && sb.ok).toBe(true);
    const dep = g.buildDepot(25, 31, 'road', 1);
    expect(dep.ok).toBe(true);
    const models = g.listModels('bus');
    expect(models.length).toBeGreaterThan(0);
    const r = g.buyVehicle(dep.depotId, { modelId: models[0].id });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: sa.stationId, full: false }, { stationId: sb.stationId, full: false }]).ok).toBe(true);
    expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
    const start = { x: r.vehicle.tx, y: r.vehicle.ty };
    const seen = new Set();
    expect(() => { for (let i = 0; i < 5000; i++) { g.step(); seen.add(`${r.vehicle.tx},${r.vehicle.ty}`); } }).not.toThrow();
    expect(seen.size).toBeGreaterThan(1);
    expect(start).toBeDefined();
  });

  test('coal train earns money via income event and money increases', () => {
    const { g, v, L } = trainSetup();
    void L;
    let income = 0;
    g.on('income', (e) => { income += e?.amount ?? 1; });
    const m0 = g.state.company.money;
    expect(g.startVehicle(v.id).ok).toBe(true);
    for (let i = 0; i < 30000; i++) g.step();
    expect(income).toBeGreaterThan(0);
    expect(g.state.company.money).toBeGreaterThan(m0);
  }, 60000);
});
