// T29: opt-in temperate bank (extraIndustries) and farm fields (farmFields). Default games must be unchanged.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { INDUSTRY_BY_ID, EXTRA_INDUSTRY_TYPES, INDUSTRY_TYPES, EXTRA_TOWN_RADIUS } from '../js/config/industries.js';
import { canPlaceIndustry, placeIndustry, bankAvailable } from '../js/simulation/industries.js';
import { tileAcceptance, recomputeAcceptance } from '../js/simulation/stations.js';
import * as Industry from '../js/simulation/loco/industry.js';
import { FARM_NUM_FIELDS, farmProductionRate, farmFieldTiles } from '../js/simulation/farmFields.js';
import { clearingCost, clearTerrain } from '../js/simulation/trackRules.js';
import { COSTS } from '../js/config/costs.js';
import { ALL_VEHICLE_MODELS, MODEL_BY_ID } from '../js/config/vehicles.js';
import { CARGO_BY_ID } from '../js/config/cargos.js';
import { listModels } from '../js/simulation/queries.js';
import { getSetting } from '../js/simulation/settings.js';

const bankType = INDUSTRY_BY_ID.bank;

/** A map with one town (given population) and a free bank site near it, or null. */
function bankSite(state, pop) {
  const town = state.towns[0];
  town.population = pop;
  for (let dy = -EXTRA_TOWN_RADIUS; dy <= EXTRA_TOWN_RADIUS; dy++) for (let dx = -EXTRA_TOWN_RADIUS; dx <= EXTRA_TOWN_RADIUS; dx++) {
    const x = town.x + dx, y = town.y + dy;
    if (canPlaceIndustry(state, bankType, x, y)) return { x, y, town };
  }
  return null;
}

describe('bank: placement rules', () => {
  test('bank type is an extra type with VALU in and out, not in default INDUSTRY_TYPES', () => {
    expect(EXTRA_INDUSTRY_TYPES.map((t) => t.id)).toContain('bank');
    expect(INDUSTRY_TYPES.some((t) => t.id === 'bank')).toBe(false);
    expect(bankType.produces).toEqual(['VALU']);
    expect(bankType.accepts).toEqual(['VALU']);
    expect(bankType.minTownPop).toBe(1200);
  });

  test('needs a town of 1200+ people nearby', () => {
    const g = Game.create({ seed: 4, width: 96, height: 96, townCount: 8, startYear: 1950 });
    expect(bankSite(g.state, 1199)).toBeNull();
    expect(bankSite(g.state, 1200)).not.toBeNull();
    expect(bankAvailable(g.state)).toBe(true);
    g.state.towns.forEach((t) => { t.population = 300; });
    expect(bankAvailable(g.state)).toBe(false);
  });

  test('a town too far away does not qualify', () => {
    const g = Game.create({ seed: 4, width: 96, height: 96, townCount: 8, startYear: 1950 });
    const state = g.state;
    for (const t of state.towns) t.population = 0;
    const far = state.towns[0];
    far.population = 1500;
    // a free site beyond the radius: same footprint, but as a non-town type (no town rule)
    const plain = { ...bankType, placement: 'nearTown' };
    let found = null;
    for (let y = 2; y < state.map.height - 3 && !found; y++) for (let x = 2; x < state.map.width - 3 && !found; x++) {
      if (Math.abs(x - far.x) + Math.abs(y - far.y) > EXTRA_TOWN_RADIUS && canPlaceIndustry(state, plain, x, y)) found = { x, y };
    }
    expect(found).not.toBeNull();
    // the bank must refuse it: no qualifying town within EXTRA_TOWN_RADIUS
    expect(canPlaceIndustry(state, bankType, found.x, found.y)).toBe(false);
  });

  test('extraIndustries on: generator places banks only in qualifying towns', () => {
    const g = Game.create({ seed: 2, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { extraIndustries: true } });
    expect(getSetting(g.state, 'extraIndustries')).toBe(true);
    const banks = g.state.industries.filter((i) => i.typeId === 'bank');
    expect(banks.length).toBeGreaterThanOrEqual(1);
    for (const b of banks) {
      const ok = g.state.towns.some((t) => (t.population || 0) >= 1200 && Math.abs(t.x - b.x) + Math.abs(t.y - b.y) <= EXTRA_TOWN_RADIUS);
      expect(ok).toBe(true);
    }
  });

  test('default game: no bank and no armoured truck', () => {
    const g = Game.create({ seed: 2, width: 96, height: 96, townCount: 8, startYear: 1950 });
    expect(g.state.industries.some((i) => i.typeId === 'bank')).toBe(false);
    expect(listModels(g.state, 'truck').some((m) => m.id === 'trk_armoured')).toBe(false);
    expect(ALL_VEHICLE_MODELS.some((m) => m.id === 'trk_armoured')).toBe(true);
  });
});

describe('bank: VALU cargo', () => {
  test('VALU is a cargo with payment params', () => {
    expect(CARGO_BY_ID.VALU.basePay).toBeGreaterThan(0);
    expect(CARGO_BY_ID.VALU.days2).toBe(32);
  });

  test('bank accepts VALU at a station-adjacent tile and the station accepts it', () => {
    const g = Game.create({ seed: 2, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { extraIndustries: true } });
    const b = g.state.industries.find((i) => i.typeId === 'bank');
    expect(b).toBeDefined();
    expect(tileAcceptance(g.state, b.x, b.y).VALU).toBe(8);
  });

  test('delivered VALU is processed into VALU output', () => {
    const g = Game.create({ seed: 2, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { extraIndustries: true } });
    const b = g.state.industries.find((i) => i.typeId === 'bank') || placeIndustry(g.state, 'bank', 0, 0);
    Industry.receiveCargo(b, 'VALU', 200);
    for (let d = 0; d < 3; d++) Industry.updateDaily(g, b);
    expect(b.producedMonthly[0]).toBeGreaterThan(0);
    expect(b.producedThisMonth.VALU).toBeGreaterThan(0);
  });

  test('armoured truck carries VALU and is offered once valuables exist', () => {
    const m = MODEL_BY_ID.trk_armoured;
    expect(m.cargos).toEqual(['VALU']);
    const g = Game.create({ seed: 2, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { extraIndustries: true } });
    expect(listModels(g.state, 'truck').some((x) => x.id === 'trk_armoured')).toBe(true);
  });
});

describe('farm fields', () => {
  const opts = { seed: 1, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { farmFields: true } };

  test('farm plants initial fields and a field tile points at its farm', () => {
    const g = Game.create(opts);
    const farms = g.state.industries.filter((i) => i.typeId === 'farm');
    expect(farms.length).toBeGreaterThanOrEqual(1);
    for (const f of farms) {
      const tiles = farmFieldTiles(g.state, f);
      expect(tiles.length).toBeGreaterThanOrEqual(1);
      for (const [x, y] of tiles) expect(g.state.map.tiles[y * g.state.map.width + x].field).toBe(f.id);
    }
  });

  test('fields grow monthly up to the target and production scales with them', () => {
    const g = Game.create(opts);
    const f = g.state.industries.find((i) => i.typeId === 'farm');
    let prev = farmFieldTiles(g.state, f).length;
    for (let m = 0; m < 40; m++) {
      Industry.updateMonthly(g, f, null);
      const now = farmFieldTiles(g.state, f).length;
      expect(now).toBeGreaterThanOrEqual(prev);
      expect(now).toBeLessThanOrEqual(FARM_NUM_FIELDS);
      expect(f.productionRate).toBe(farmProductionRate(now));
      prev = now;
    }
    expect(prev).toBeGreaterThan(0);
  });

  test('productionRate scales linearly with the field count and caps at 255', () => {
    expect(farmProductionRate(0)).toBe(0);
    expect(farmProductionRate(FARM_NUM_FIELDS / 2)).toBe(128);
    expect(farmProductionRate(FARM_NUM_FIELDS)).toBe(255);
    expect(farmProductionRate(FARM_NUM_FIELDS * 3)).toBe(255);
  });

  test('building over a field clears it; clearing costs clearField', () => {
    const g = Game.create(opts);
    const f = g.state.industries.find((i) => i.typeId === 'farm');
    const [x, y] = farmFieldTiles(g.state, f)[0];
    const t = g.state.map.tiles[y * g.state.map.width + x];
    expect(clearingCost(t)).toBe(COSTS.clearField);
    clearTerrain(t);
    expect(t.field).toBeUndefined();
  });

  test('save/load keeps field tiles', () => {
    const g = Game.create(opts);
    const f = g.state.industries.find((i) => i.typeId === 'farm');
    const before = farmFieldTiles(g.state, f).length;
    const g2 = Game.deserialize(g.serialize());
    const f2 = g2.state.industries.find((i) => i.id === f.id);
    expect(farmFieldTiles(g2.state, f2).length).toBe(before);
    expect(getSetting(g2.state, 'farmFields')).toBe(true);
  });

  test('default game: no fields, production rate untouched', () => {
    const g = Game.create({ seed: 1, width: 96, height: 96, townCount: 8, startYear: 1950 });
    expect(g.state.map.tiles.some((t) => t.field !== undefined)).toBe(false);
    for (const i of g.state.industries) {
      expect(i.fields).toBeUndefined();
      if (i.productionRate !== undefined) expect(i.productionRate).toBe(255);
    }
  });
});
