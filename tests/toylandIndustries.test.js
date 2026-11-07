// TY2: toyland industries and cargos (OpenTTD LandscapeType::Toyland set). Toyland games only.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { INDUSTRY_TYPES, TOYLAND_INDUSTRY_TYPES, INDUSTRY_BY_ID } from '../js/config/industries.js';
import { CARGO_BY_ID } from '../js/config/cargos.js';
import { MODEL_BY_ID, ALL_VEHICLE_MODELS } from '../js/config/vehicles.js';
import { modelAvailable, purchasable } from '../js/simulation/vehicles.js';
import { industryTypesFor } from '../js/simulation/industries.js';
import { tileAcceptance } from '../js/simulation/stations.js';

const TOY_CARGOS = ['SWEETS', 'SUGAR', 'TOYS', 'BATTERIES', 'CANDYFLOSS', 'TOFFEE', 'COLA', 'BUBBLES', 'PLASTIC', 'FIZZY_DRINKS'];
const TOY_TYPE_IDS = TOYLAND_INDUSTRY_TYPES.map((t) => t.id);
const TEMPERATE_IDS = INDUSTRY_TYPES.map((t) => t.id);

describe('toyland industries and cargos', () => {
  test('cargo table and industry chain wiring', () => {
    for (const c of TOY_CARGOS) expect(CARGO_BY_ID[c].basePay).toBeGreaterThan(0);
    expect(INDUSTRY_BY_ID.cotton_candy_forest.produces).toEqual(['CANDYFLOSS']);
    expect(INDUSTRY_BY_ID.sweet_factory.accepts).toEqual(['SUGAR', 'TOFFEE', 'CANDYFLOSS']);
    expect(INDUSTRY_BY_ID.sweet_factory.produces).toEqual(['SWEETS']);
    expect(INDUSTRY_BY_ID.plastic_fountains.produces).toEqual(['PLASTIC']);
    expect(INDUSTRY_BY_ID.toffee_quarry.produces).toEqual(['TOFFEE']);
    expect(INDUSTRY_BY_ID.cola_wells.produces).toEqual(['COLA']);
    expect(INDUSTRY_BY_ID.fizzy_drink_factory.accepts).toEqual(['COLA', 'BUBBLES']);
    expect(INDUSTRY_BY_ID.fizzy_drink_factory.produces).toEqual(['FIZZY_DRINKS']);
    expect(INDUSTRY_BY_ID.bubble_generator.produces).toEqual(['BUBBLES']);
    expect(INDUSTRY_BY_ID.battery_farm.produces).toEqual(['BATTERIES']);
    expect(INDUSTRY_BY_ID.toy_factory.accepts).toEqual(['PLASTIC', 'BATTERIES']);
    expect(INDUSTRY_BY_ID.toy_factory.produces).toEqual(['TOYS']);
    expect(INDUSTRY_BY_ID.toy_shop.accepts).toEqual(['TOYS']);
    expect(INDUSTRY_BY_ID.sugar_mine.produces).toEqual(['SUGAR']);
  });

  test('temperate, arctic and tropic games keep the temperate industry set', () => {
    const plain = { mapgen: {}, industries: [], settings: {} };
    expect(industryTypesFor(plain)).toBe(INDUSTRY_TYPES);
    expect(industryTypesFor({ mapgen: { climate: 'tropic' }, industries: [], settings: {} })).toBe(INDUSTRY_TYPES);
    expect(industryTypesFor({ mapgen: { climate: 'arctic' }, industries: [], settings: {} })).toBe(INDUSTRY_TYPES);
    expect(industryTypesFor({ mapgen: { climate: 'toyland' }, industries: [], settings: {} })).toBe(TOYLAND_INDUSTRY_TYPES);
  });

  test('a toyland map generates toyland industries only, and the chain is complete', () => {
    const g = Game.create({ seed: 4, width: 96, height: 96, townCount: 8, mapgen: { climate: 'toyland' } });
    const s = g.state;
    expect(s.industries.length).toBeGreaterThan(0);
    for (const i of s.industries) {
      expect(TOY_TYPE_IDS).toContain(i.typeId);
      expect(TEMPERATE_IDS).not.toContain(i.typeId);
    }
    // the generator makes sure each type appears at least once when the count allows
    const placed = new Set(s.industries.map((i) => i.typeId));
    for (const t of TOYLAND_INDUSTRY_TYPES) expect(placed.has(t.id)).toBe(true);
  });

  test('a temperate map places no toyland industries', () => {
    const g = Game.create({ seed: 4, width: 96, height: 96, townCount: 8 });
    for (const i of g.state.industries) expect(TOY_TYPE_IDS).not.toContain(i.typeId);
  });

  test('toyland towns accept sweets, toys and fizzy drinks; other climates do not', () => {
    const tl = Game.create({ seed: 4, width: 96, height: 96, townCount: 8, mapgen: { climate: 'toyland' } }).state;
    const tt = Game.create({ seed: 4, width: 96, height: 96, townCount: 8 }).state;
    const houseAcc = (st) => {
      const i = st.map.tiles.findIndex((tile) => tile.building && tile.building.type === 'house' && tile.building.level >= 2);
      expect(i).toBeGreaterThanOrEqual(0);
      return tileAcceptance(st, i % st.map.width, Math.floor(i / st.map.width));
    };
    const a = houseAcc(tl);
    expect(a.SWEETS).toBeGreaterThan(0);
    expect(a.TOYS).toBeGreaterThan(0);
    expect(a.FIZZY_DRINKS).toBeGreaterThan(0);
    const b = houseAcc(tt);
    expect(b.SWEETS).toBeUndefined();
    expect(b.TOYS).toBeUndefined();
    expect(b.FIZZY_DRINKS).toBeUndefined();
  });

  test('toy shop accepts toys; fizzy drink factory accepts cola and bubbles', () => {
    const s = Game.create({ seed: 4, width: 96, height: 96, townCount: 8, mapgen: { climate: 'toyland' } }).state;
    const shop = s.industries.find((i) => i.typeId === 'toy_shop');
    const fz = s.industries.find((i) => i.typeId === 'fizzy_drink_factory');
    expect(shop).toBeTruthy();
    expect(fz).toBeTruthy();
    expect(tileAcceptance(s, shop.x, shop.y).TOYS).toBeGreaterThan(0);
    const acc = tileAcceptance(s, fz.x, fz.y);
    expect(acc.COLA).toBeGreaterThan(0);
    expect(acc.BUBBLES).toBeGreaterThan(0);
  });

  test('every toyland cargo has a road truck, toyland opt-in only', () => {
    const plain = { mapgen: {}, industries: [], settings: {} };
    const toy = { mapgen: { climate: 'toyland' }, industries: [], settings: {} };
    for (const c of TOY_CARGOS) {
      const truck = ALL_VEHICLE_MODELS.find((m) => m.kind === 'truck' && m.cargos.includes(c));
      expect(truck).toBeTruthy();
      expect(truck.optIn).toBe('toyland');
      expect(modelAvailable(toy, truck)).toBe(true);
      expect(modelAvailable(plain, truck)).toBe(false);
      expect(purchasable(truck, 1990)).toBe(true);
    }
    expect(MODEL_BY_ID.trk_sweets.cargos).toEqual(['SWEETS']);
  });
});
