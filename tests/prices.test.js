import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { COSTS } from '../js/config/costs.js';
import { updateMonthly } from '../js/simulation/loco/economy.js';
import { buildCost, vehiclePrice, runningCost } from '../js/simulation/prices.js';
import { refundValue } from '../js/simulation/vehicles.js';
import { setSetting } from '../js/simulation/settings.js';
import { vehicleDaily } from '../js/simulation/loco/vehicle.js';
import { VEHICLE_MODELS } from '../js/config/vehicles.js';

const inflate = (g, n) => { for (let i = 0; i < n; i++) updateMonthly(g); };

describe('inflation-adjusted prices', () => {
  test('at game start prices equal table values', () => {
    const g = flatGame();
    const s = g.state;
    for (const k of Object.keys(COSTS)) expect(buildCost(s, k)).toBe(COSTS[k]);
    const m = g.listModels('engine')[0];
    const base = VEHICLE_MODELS.find((x) => x.id === m.id);
    expect(m.cost).toBe(base.cost);
    expect(vehiclePrice(s, base)).toBe(base.cost);
    expect(runningCost(s, 100)).toBe(100);
    expect(g.buildRail(10, 20, 14, 20, { dryRun: true }).cost).toBe(5 * COSTS.rail);
  });

  test('prices grow after inflating months and stay integers', () => {
    const g = flatGame();
    const before = g.buildRail(10, 20, 14, 20, { dryRun: true }).cost;
    const m = g.listModels('engine')[0];
    inflate(g, 36);
    const after = g.buildRail(10, 20, 14, 20, { dryRun: true }).cost;
    expect(after).toBeGreaterThan(before);
    expect(Number.isInteger(after)).toBe(true);
    expect(g.listModels('engine').find((x) => x.id === m.id).cost).toBeGreaterThan(m.cost);
    expect(buildCost(g.state, 'airport')).toBeGreaterThan(COSTS.airport);
  });

  test('vehicle purchase charges inflated price and sell refunds recorded value', () => {
    const g = flatGame();
    const { depotId } = coalLine(g);
    inflate(g, 24);
    const eng = g.listModels('engine')[0], wag = g.listModels('wagon').find((w) => w.cargos.includes('COAL'));
    const dry = g.buyVehicle(depotId, { modelId: eng.id, wagonModelId: wag.id, wagons: 2, cargoId: 'COAL' }, { dryRun: true });
    expect(dry.ok).toBe(true);
    const m0 = g.state.company.money;
    const r = g.buyVehicle(depotId, { modelId: eng.id, wagonModelId: wag.id, wagons: 2, cargoId: 'COAL' });
    expect(r.cost).toBe(dry.cost);
    expect(m0 - g.state.company.money).toBe(r.cost);
    expect(r.vehicle.value).toBe(refundValue(r.cost)); // sell-back = cost - cost/8 (OL CreateVehicle.cpp:163-165)
    expect(r.cost).toBeGreaterThan(VEHICLE_MODELS.find((x) => x.id === eng.id).cost);
  });

  test('inflation setting false keeps prices flat', () => {
    const g = flatGame();
    setSetting(g.state, 'inflation', false);
    const c0 = g.buildRail(10, 20, 14, 20, { dryRun: true }).cost;
    g.stepDays(70);
    expect(g.buildRail(10, 20, 14, 20, { dryRun: true }).cost).toBe(c0);
  });

  test("breakdowns 'none' prevents breakdowns, 'normal' allows them", () => {
    const run = (mode) => {
      const g = flatGame();
      const { depotId } = coalLine(g);
      const eng = g.listModels('engine')[0], wag = g.listModels('wagon').find((w) => w.cargos.includes('COAL'));
      const v = g.buyVehicle(depotId, { modelId: eng.id, wagonModelId: wag.id, wagons: 1, cargoId: 'COAL' }).vehicle;
      if (mode) setSetting(g.state, 'breakdowns', mode);
      v.state = 'running'; v.reliability = 0.2;
      let pending = 0;
      for (let d = 0; d < 400; d++) {
        vehicleDaily(g.ctx, v, g.rng, g.state.date.year);
        if (v.breakdownPending) { pending++; v.breakdownPending = false; }
        v.reliability = 0.2;
      }
      return pending;
    };
    expect(run('none')).toBe(0);
    expect(run('normal')).toBeGreaterThan(0);
    expect(run('reduced')).toBeLessThanOrEqual(run('normal'));
  });
});
