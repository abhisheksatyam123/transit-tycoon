// TP: sub-tropical industry chain (rubber/fruit/maize/copper/diamonds/lumber -> factory, food plant, bank).
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { INDUSTRY_BY_ID } from '../js/config/industries.js';
import { CARGO_BY_ID } from '../js/config/cargos.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { modelAvailable } from '../js/simulation/vehicles.js';
import { tropicZoneAt } from '../js/simulation/climate.js';
import { industryLayout } from '../js/renderer/pack/industries.js';

const NEW_TYPES = ['rubber_plantation', 'fruit_plantation', 'maize_farm', 'copper_mine', 'diamond_mine', 'lumber_mill', 'factory_tropic', 'food_plant_tropic', 'bank_tropic'];
const NEW_CARGOS = ['RUBBER', 'FRUIT', 'MAIZE', 'COPPER_ORE', 'DIAMONDS'];

describe('tropic industry chain', () => {
  test('new cargos and chain definitions exist with the spec wiring', () => {
    for (const c of NEW_CARGOS) expect(CARGO_BY_ID[c].basePay).toBeGreaterThan(0);
    expect(INDUSTRY_BY_ID.rubber_plantation.produces).toEqual(['RUBBER']);
    expect(INDUSTRY_BY_ID.fruit_plantation.produces).toEqual(['FRUIT']);
    expect(INDUSTRY_BY_ID.maize_farm.produces).toEqual(['MAIZE']);
    expect(INDUSTRY_BY_ID.copper_mine.produces).toEqual(['COPPER_ORE']);
    expect(INDUSTRY_BY_ID.diamond_mine.produces).toEqual(['DIAMONDS']);
    expect(INDUSTRY_BY_ID.lumber_mill.produces).toEqual(['WOOD']);
    expect(INDUSTRY_BY_ID.factory_tropic.accepts).toEqual(['RUBBER', 'COPPER_ORE', 'WOOD']);
    expect(INDUSTRY_BY_ID.factory_tropic.produces).toEqual(['GOOD']);
    expect(INDUSTRY_BY_ID.food_plant_tropic.accepts).toEqual(['FRUIT', 'MAIZE']);
    expect(INDUSTRY_BY_ID.food_plant_tropic.produces).toEqual(['FOOD']);
    expect(INDUSTRY_BY_ID.bank_tropic.accepts).toEqual(['DIAMONDS']);
  });

  test('every new cargo has a truck and a wagon, tropic opt-in only', () => {
    for (const c of NEW_CARGOS) {
      const truck = Object.values(MODEL_BY_ID).find((m) => m.kind === 'truck' && m.cargos.includes(c));
      const wagon = Object.values(MODEL_BY_ID).find((m) => m.kind === 'wagon' && m.cargos.includes(c));
      expect(truck && truck.optIn).toBe('tropic');
      expect(wagon && wagon.optIn).toBe('tropic');
      expect(modelAvailable({ mapgen: { climate: 'tropic' }, industries: [], settings: {} }, truck)).toBe(true);
      expect(modelAvailable({ mapgen: {}, industries: [], settings: {} }, wagon)).toBe(false);
    }
  });

  test('tropic map places each new type; plantations avoid the desert, lumber mills stand in the rainforest', () => {
    const g = Game.create({ seed: 3, width: 96, height: 96, townCount: 8, mapgen: { climate: 'tropic' } });
    const s = g.state;
    for (const t of NEW_TYPES) expect(s.industries.some((i) => i.typeId === t)).toBe(true);
    for (const i of s.industries) {
      if (i.typeId === 'rubber_plantation' || i.typeId === 'fruit_plantation') {
        expect(tropicZoneAt(s.map, i.x, i.y)).not.toBe(1);
      }
      if (i.typeId === 'lumber_mill') expect(tropicZoneAt(s.map, i.x, i.y)).toBe(2);
      if (i.typeId === 'factory_tropic' || i.typeId === 'food_plant_tropic' || i.typeId === 'bank_tropic') {
        expect(s.towns.some((t) => Math.abs(t.x - i.x) + Math.abs(t.y - i.y) <= 16)).toBe(true);
      }
    }
  });

  test('tropic placement is deterministic for a seed', () => {
    const a = Game.create({ seed: 5, width: 96, height: 96, townCount: 8, mapgen: { climate: 'tropic' } }).state;
    const b = Game.create({ seed: 5, width: 96, height: 96, townCount: 8, mapgen: { climate: 'tropic' } }).state;
    const key = (s) => s.industries.map((i) => `${i.typeId}@${i.x},${i.y}`).join('|');
    expect(key(a)).toBe(key(b));
  });

  test('temperate and arctic maps never get tropic chain industries', () => {
    const t = Game.create({ seed: 3, width: 96, height: 96, townCount: 8 }).state;
    const a = Game.create({ seed: 3, width: 96, height: 96, townCount: 8, mapgen: { climate: 'arctic' } }).state;
    for (const s of [t, a]) for (const ty of NEW_TYPES) expect(s.industries.some((i) => i.typeId === ty)).toBe(false);
  });

  test('new footprints have OTTD layouts for the renderer (no procedural fallback)', () => {
    for (const t of ['rubber_plantation', 'fruit_plantation', 'copper_mine', 'diamond_mine', 'lumber_mill', 'factory_tropic', 'food_plant_tropic', 'bank_tropic', 'maize_farm']) {
      const ty = INDUSTRY_BY_ID[t];
      expect(industryLayout(t, ty.w, ty.h, 1)).not.toBeNull();
    }
  });
});
