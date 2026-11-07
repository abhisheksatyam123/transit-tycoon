/** difficulty cost settings (OpenTTD difficulty.vehicle_costs / construction_cost): vehicleCostPercent, constructionCostPercent. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { buildCost, constructionTotal, vehiclePrice, runningCost } from '../js/simulation/prices.js';
import { monthlyRunningCost } from '../js/simulation/loco/vehicle.js';
import { COSTS } from '../js/config/costs.js';
import { VEHICLE_MODELS } from '../js/config/vehicles.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { SETTING_META, groupOfSetting } from '../js/ui/settingsGroups.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };
const railModel = VEHICLE_MODELS.find((m) => m.kind === 'rail' && m.cost > 0) || VEHICLE_MODELS.find((m) => m.cost > 0);

describe('difficulty cost settings', () => {
  test('defaults are 100 and leave prices unchanged', () => {
    expect(DEFAULT_SETTINGS.vehicleCostPercent).toBe(100);
    expect(DEFAULT_SETTINGS.constructionCostPercent).toBe(100);
    const g = Game.create(small);
    expect(buildCost(g.state, 'rail')).toBe(Math.round(COSTS.rail));
    expect(vehiclePrice(g.state, railModel.cost)).toBe(Math.round(railModel.cost));
    expect(runningCost(g.state, 1000)).toBe(1000);
  });

  test('200% doubles a rail build cost and a vehicle purchase price', () => {
    const g = Game.create(small);
    const rail0 = buildCost(g.state, 'rail');
    const veh0 = vehiclePrice(g.state, railModel);
    setSetting(g.state, 'constructionCostPercent', 200);
    setSetting(g.state, 'vehicleCostPercent', 200);
    expect(buildCost(g.state, 'rail')).toBe(rail0 * 2);
    expect(constructionTotal(g.state, COSTS.rail)).toBe(rail0 * 2);
    expect(vehiclePrice(g.state, railModel)).toBe(veh0 * 2);
  });

  test('50% halves construction and vehicle prices', () => {
    const g = Game.create(small);
    const rail0 = buildCost(g.state, 'rail');
    const veh0 = vehiclePrice(g.state, railModel);
    setSetting(g.state, 'constructionCostPercent', 50);
    setSetting(g.state, 'vehicleCostPercent', 50);
    expect(buildCost(g.state, 'rail')).toBe(Math.round(rail0 / 2));
    expect(vehiclePrice(g.state, railModel)).toBe(Math.round(veh0 / 2));
  });

  test('construction setting does not touch vehicle prices and vice versa', () => {
    const g = Game.create(small);
    const veh0 = vehiclePrice(g.state, railModel);
    setSetting(g.state, 'constructionCostPercent', 200);
    expect(vehiclePrice(g.state, railModel)).toBe(veh0);
    setSetting(g.state, 'constructionCostPercent', 100);
    setSetting(g.state, 'vehicleCostPercent', 150);
    expect(buildCost(g.state, 'rail')).toBe(Math.round(COSTS.rail));
  });

  test('running cost scales with vehicleCostPercent', () => {
    const g = Game.create(small);
    const v = { runningCost: 120000 };
    const base = monthlyRunningCost(v, g.state);
    expect(base).toBeGreaterThan(0);
    setSetting(g.state, 'vehicleCostPercent', 200);
    expect(monthlyRunningCost(v, g.state)).toBe(Math.round(base * 2));
    setSetting(g.state, 'vehicleCostPercent', 50);
    expect(monthlyRunningCost(v, g.state)).toBe(Math.round(base / 2));
    expect(runningCost(g.state, 1000)).toBe(500);
  });

  test('save/load keeps the cost settings', () => {
    const g = Game.create(small);
    setSetting(g.state, 'vehicleCostPercent', 150);
    setSetting(g.state, 'constructionCostPercent', 75);
    const loaded = parseState(serializeState(g.state));
    expect(getSetting(loaded, 'vehicleCostPercent')).toBe(150);
    expect(getSetting(loaded, 'constructionCostPercent')).toBe(75);
  });

  test('settings window exposes both as selects in the economy group', () => {
    for (const key of ['vehicleCostPercent', 'constructionCostPercent']) {
      const m = SETTING_META.find((x) => x.key === key);
      expect(m.type).toBe('select');
      expect(m.options.map(([v]) => v)).toEqual(['50', '75', '100', '125', '150', '200']);
      expect(groupOfSetting(key)).toBe('economy');
    }
  });
});
