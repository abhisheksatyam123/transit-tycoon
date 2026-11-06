// TP: sub-tropical WATER (water supply, water towers, water tankers, desert growth needs WATER too).
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { INDUSTRY_BY_ID } from '../js/config/industries.js';
import { CARGO_BY_ID } from '../js/config/cargos.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { modelAvailable } from '../js/simulation/vehicles.js';
import { tropicGrowthAllowed } from '../js/simulation/climate.js';
import { recordTownDelivery, rollTownStats } from '../js/simulation/townGrowth.js';

describe('tropic water', () => {
  test('WATER cargo and industry/vehicle definitions exist', () => {
    expect(CARGO_BY_ID.WATER.basePay).toBeGreaterThan(0);
    expect(INDUSTRY_BY_ID.water_supply.produces).toContain('WATER');
    expect(INDUSTRY_BY_ID.water_tower.accepts).toContain('WATER');
    expect(MODEL_BY_ID.trk_water.cargos).toContain('WATER');
    expect(MODEL_BY_ID.wag_water.cargos).toContain('WATER');
  });

  test('tropic map has a water supply and a water tower in towns; temperate has neither', () => {
    const g = Game.create({ seed: 3, width: 96, height: 96, townCount: 8, mapgen: { climate: 'tropic' } });
    const s = g.state;
    expect(s.industries.filter((i) => i.typeId === 'water_supply').length).toBeGreaterThanOrEqual(1);
    const towers = s.industries.filter((i) => i.typeId === 'water_tower');
    expect(towers.length).toBeGreaterThanOrEqual(1);
    expect(towers.every((t) => s.towns.some((tw) => Math.abs(tw.x - t.x) + Math.abs(tw.y - t.y) <= 16))).toBe(true);
    const t = Game.create({ seed: 3, width: 96, height: 96, townCount: 8 }).state;
    expect(t.industries.some((i) => i.typeId === 'water_supply' || i.typeId === 'water_tower')).toBe(false);
  });

  test('water vehicles are offered only in tropic games', () => {
    const tropic = { mapgen: { climate: 'tropic' }, industries: [], settings: {} };
    const temp = { mapgen: {}, industries: [], settings: {} };
    expect(modelAvailable(tropic, MODEL_BY_ID.trk_water)).toBe(true);
    expect(modelAvailable(temp, MODEL_BY_ID.trk_water)).toBe(false);
    expect(modelAvailable(temp, MODEL_BY_ID.wag_water)).toBe(false);
  });

  test('desert town needs FOOD and WATER last month to grow', () => {
    const m = { width: 9, height: 9, tiles: [] };
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) m.tiles.push({ terrain: 'grass', height: x < 4 ? 0 : 6 });
    const state = { mapgen: { climate: 'tropic' }, map: m };
    const town = { x: 2, y: 4, name: 'T', population: 300, goodsThisMonth: 0, houses: [] };
    expect(tropicGrowthAllowed(state, town)).toBe(false);
    recordTownDelivery(town, 'FOOD', 5, state);
    rollTownStats(state, town);
    expect(tropicGrowthAllowed(state, town)).toBe(false); // food only
    recordTownDelivery(town, 'FOOD', 5, state);
    recordTownDelivery(town, 'WATER', 5, state);
    rollTownStats(state, town);
    expect(tropicGrowthAllowed(state, town)).toBe(true);  // food + water in the same month
    rollTownStats(state, town);
    expect(tropicGrowthAllowed(state, town)).toBe(false); // nothing last month: lazy fields dropped
  });

  test('WATER delivery leaves temperate towns without a water field', () => {
    const town = { x: 1, y: 1, name: 'T', population: 300, goodsThisMonth: 0, houses: [] };
    recordTownDelivery(town, 'WATER', 5, { mapgen: {} });
    expect(town.waterThisMonth).toBeUndefined();
  });
});
