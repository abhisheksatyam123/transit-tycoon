// TP: sub-tropical climate (opt-in 'tropic'): desert and rainforest zones, desert ground, FOOD growth rule.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { isTropic, isArctic, desertLine, tropicZones, tropicZoneAt, tropicZonesReset, tropicGrowthAllowed, DESERT_COVERAGE } from '../js/simulation/climate.js';
import { recordTownDelivery, rollTownStats } from '../js/simulation/townGrowth.js';
import { drawTropicDesert, setTropicClimate, tropicState, TREE_LAYOUT_RAINFOREST, TREE_LAYOUT_SUB_TROPICAL, TREE_LAYOUT_CACTUS } from '../js/renderer/pack/tropic.js';
import { mapgenOptions } from '../js/simulation/game.js';

function flatMap(w, h, height, terrain = 'grass') {
  const tiles = [];
  for (let i = 0; i < w * h; i++) tiles.push({ terrain, height });
  return { width: w, height: h, tiles };
}
/** Left columns low (desert candidates), right columns high (rainforest): 9x9, desert covers x 1..2. */
function halfMap() {
  const m = { width: 9, height: 9, tiles: [] };
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) m.tiles.push({ terrain: 'grass', height: x < 4 ? 0 : 6, house: undefined });
  return m;
}

describe('tropic zones', () => {
  test('climate flag is explicit only', () => {
    expect(isTropic({ mapgen: { climate: 'tropic' } })).toBe(true);
    expect(isTropic({ mapgen: { climate: 'arctic' } })).toBe(false);
    expect(isTropic({})).toBe(false);
    expect(isArctic({ mapgen: { climate: 'tropic' } })).toBe(false);
  });

  test('mapgen options keep the tropic climate and drop the temperate default', () => {
    expect(mapgenOptions({ climate: 'tropic' })).toEqual({ climate: 'tropic' });
    expect(mapgenOptions({ climate: 'temperate' })).toEqual({});
  });

  test('desert line: the lowest level that covers ~35% of the land (OpenTTD CalculateCoverageLine)', () => {
    expect(desertLine(halfMap())).toBe(1); // 44% of tiles at level 0
    expect(desertLine(flatMap(6, 6, 1))).toBe(2); // every tile at level 1 is below level 2
  });

  test('water is zone 0; interior low land is desert; high land is rainforest', () => {
    const m = halfMap();
    m.tiles[4 * 9 + 0].terrain = 'water';
    const z = tropicZones(m);
    expect(z[4 * 9 + 0]).toBe(0);
    expect(z[4 * 9 + 1]).toBe(0); // next to water: the 3x3 block is not all land, so not desert
    expect(z[4 * 9 + 2]).toBe(1); // 3x3 all low land (x 1..3): desert
    expect(tropicZoneAt(m, 2, 4)).toBe(1);
    expect(z[4 * 9 + 7]).toBe(2); // high land with no desert around: rainforest
    expect(tropicZoneAt(m, -1, 0)).toBe(0);
  });

  test('zones are derived and cached per map; reset recomputes', () => {
    const m = flatMap(5, 5, 1);
    const a = tropicZones(m);
    expect(tropicZones(m)).toBe(a);
    tropicZonesReset(m);
    expect(tropicZones(m)).not.toBe(a);
    expect(DESERT_COVERAGE).toBeGreaterThan(0);
  });
});

describe('tropic growth rule (FOOD)', () => {
  function townIn(state, x, y) {
    return { x, y, name: 'T', population: 300, goodsThisMonth: 0, houses: [] };
  }
  test('desert towns need food last month; other towns and other climates are free', () => {
    const m = halfMap();
    const state = { mapgen: { climate: 'tropic' }, map: m };
    const town = townIn(state, 2, 4);
    expect(tropicZoneAt(m, 2, 4)).toBe(1);
    expect(tropicGrowthAllowed(state, town)).toBe(false);
    town.foodLastMonth = 10;
    expect(tropicGrowthAllowed(state, town)).toBe(false); // TP: WATER is needed too
    town.waterLastMonth = 10;
    expect(tropicGrowthAllowed(state, town)).toBe(true);
    // rainforest town: free
    const s2 = { mapgen: { climate: 'tropic' }, map: m };
    expect(tropicGrowthAllowed(s2, townIn(s2, 7, 4))).toBe(true);
    // temperate: always free, even on desert land
    const s3 = { map: m, mapgen: {} };
    expect(tropicGrowthAllowed(s3, townIn(s3, 2, 4))).toBe(true);
  });

  test('FOOD delivered in a tropic game becomes last month food; temperate keeps no field', () => {
    const town = { x: 0, y: 0, houses: [], goodsThisMonth: 0, goodsDelivered: 0, deliveredPassThisMonth: 0 };
    recordTownDelivery(town, 'FOOD', 7, { mapgen: { climate: 'tropic' } });
    rollTownStats({ towns: [], map: flatMap(2, 2, 1) }, town);
    expect(town.foodLastMonth).toBe(7);
    const t2 = { x: 0, y: 0, houses: [], goodsThisMonth: 0, goodsDelivered: 0, deliveredPassThisMonth: 0 };
    recordTownDelivery(t2, 'FOOD', 7, { mapgen: {} });
    expect(t2.foodThisMonth).toBeUndefined();
  });
});

describe('tropic render tables', () => {
  test('rainforest 7 types, sub-tropical 4, cactus 1 (4 rows each)', () => {
    expect(TREE_LAYOUT_RAINFOREST.length).toBe(28);
    expect(TREE_LAYOUT_SUB_TROPICAL.length).toBe(16);
    expect(TREE_LAYOUT_CACTUS.length).toBe(4);
    expect(TREE_LAYOUT_RAINFOREST[0]).toEqual([1835, 1842, 1835, 1849]);
  });

  test('desert drawing is refused without the pack, and the pack is set from the flag', () => {
    tropicState.pack = null;
    setTropicClimate(true, null);
    expect(tropicState.on).toBe(true);
    const ctx = {};
    expect(drawTropicDesert(ctx, 0, 0, [1, 1, 1, 1], 0)).toBe(false);
    setTropicClimate(false, null);
    expect(tropicState.on).toBe(false);
  });
});

describe('tropic game', () => {
  test('a tropic game generates a map with desert zones and round-trips the climate flag', () => {
    const game = Game.create({ seed: 4, mapgen: { climate: 'tropic' } });
    expect(game.state.mapgen.climate).toBe('tropic');
    const z = tropicZones(game.state.map);
    expect(z.some((v) => v === 1)).toBe(true);
    expect(z.some((v) => v === 2)).toBe(true);
  });
});
