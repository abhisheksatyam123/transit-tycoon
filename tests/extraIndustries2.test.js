// T-IN: OpenLoco-style chain industries (quarry, paper mill, printing works, building materials, food plant).
// Opt-in via the extraIndustries setting; default games must not change.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { INDUSTRY_BY_ID, INDUSTRY_TYPES, EXTRA_INDUSTRY_TYPES } from '../js/config/industries.js';
import { CARGO_BY_ID } from '../js/config/cargos.js';
import { placeIndustry, canPlaceIndustry } from '../js/simulation/industries.js';
import { tileAcceptance } from '../js/simulation/stations.js';
import * as Industry from '../js/simulation/loco/industry.js';
import { MODEL_BY_ID, ALL_VEHICLE_MODELS } from '../js/config/vehicles.js';
import { modelAvailable } from '../js/simulation/vehicles.js';
import { listModels } from '../js/simulation/queries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { getSetting } from '../js/simulation/settings.js';
import { industryStyle } from '../js/renderer/sprites/industries.js';
import { INDUSTRY_OTTD } from '../js/renderer/pack/industries.js';
import { INDUSTRY_FUND_COSTS } from '../js/config/costs.js';

const CHAIN = ['quarry', 'paper_mill', 'printing_works', 'building_materials', 'food_plant'];
const NEW_CARGOS = ['STON', 'BMAT', 'PAPR', 'FOOD'];

const on = (seed) => Game.create({ seed, width: 128, height: 128, townCount: 10, startYear: 1950, settings: { extraIndustries: true } });

describe('T-IN chain industries: types and cargos', () => {
  test('five chain types exist as extra types, not in the default list', () => {
    const ids = EXTRA_INDUSTRY_TYPES.map((t) => t.id);
    for (const id of CHAIN) {
      expect(ids).toContain(id);
      expect(INDUSTRY_TYPES.some((t) => t.id === id)).toBe(false);
    }
  });

  test('conversion chain links: quarry -> building materials, wood -> paper -> goods, grain/livestock -> food', () => {
    expect(INDUSTRY_BY_ID.quarry.produces).toEqual(['STON']);
    expect(INDUSTRY_BY_ID.building_materials.converts).toEqual({ STON: 'BMAT' });
    expect(INDUSTRY_BY_ID.paper_mill.converts).toEqual({ WOOD: 'PAPR' });
    expect(INDUSTRY_BY_ID.printing_works.converts).toEqual({ PAPR: 'GOOD' });
    expect(INDUSTRY_BY_ID.food_plant.accepts.sort()).toEqual(['GRAI', 'LVST']);
    expect(INDUSTRY_BY_ID.food_plant.produces).toEqual(['FOOD']);
  });

  test('every new cargo has a payment rate and colour', () => {
    for (const c of NEW_CARGOS) {
      expect(CARGO_BY_ID[c].basePay).toBeGreaterThan(0);
      expect(CARGO_BY_ID[c].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('every chain type has a fund price and an industry style sprite', () => {
    for (const id of CHAIN) {
      expect(INDUSTRY_FUND_COSTS[id]).toBeGreaterThan(0);
      expect(industryStyle(id)).not.toBe('factory'); // own procedural style (not the generic fallback)
    }
    expect(industryStyle('quarry')).toBe('quarry');
    expect(industryStyle('food_plant')).toBe('food');
    // OpenGFX: quarry, paper mill and food plant reuse an existing footprint-matched family
    expect(INDUSTRY_OTTD.quarry).toBe('coal_mine');
  });
});

describe('T-IN chain industries: placement', () => {
  test('extraIndustries on: each chain type is placed on a new map, with its extraCount', () => {
    const g = on(11);
    for (const id of CHAIN) {
      const n = g.state.industries.filter((i) => i.typeId === id).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(INDUSTRY_BY_ID[id].extraCount);
    }
  });

  test('extraTown types lie within EXTRA_TOWN_RADIUS of some town', () => {
    const g = on(12);
    const towns = g.state.towns;
    for (const id of ['paper_mill', 'printing_works', 'building_materials', 'food_plant']) {
      for (const i of g.state.industries.filter((x) => x.typeId === id)) {
        expect(towns.some((t) => Math.abs(t.x - i.x) + Math.abs(t.y - i.y) <= 16 + 2 * 4)).toBe(true);
      }
    }
  });

  test('default game: no chain industry and no chain cargo or vehicle model', () => {
    const g = Game.create({ seed: 11, width: 128, height: 128, townCount: 10, startYear: 1950 });
    expect(g.state.industries.some((i) => CHAIN.includes(i.typeId))).toBe(false);
    expect(getSetting(g.state, 'extraIndustries')).toBe(false);
    expect(listModels(g.state, 'wagon').some((m) => m.id === 'wag_stone')).toBe(false);
    expect(listModels(g.state, 'truck').some((m) => m.id === 'trk_food')).toBe(false);
    expect(ALL_VEHICLE_MODELS.some((m) => m.id === 'wag_stone')).toBe(true);
  });

  test('chain vehicles are offered only with extraIndustries on', () => {
    const off = Game.create({ seed: 11, width: 128, height: 128, townCount: 10, startYear: 1950 });
    const onG = on(11);
    expect(modelAvailable(off.state, MODEL_BY_ID.trk_stone)).toBe(false);
    expect(modelAvailable(onG.state, MODEL_BY_ID.trk_stone)).toBe(true);
    expect(listModels(onG.state, 'wagon').some((m) => m.id === 'wag_crate')).toBe(true);
  });
});

describe('T-IN chain industries: conversion and output', () => {
  test('building materials turns delivered stone into building materials', () => {
    const g = on(13);
    const ind = placeIndustry(g.state, 'building_materials', 60, 60);
    Industry.ensureIndustryState(ind, g.state, { immediate: false });
    Industry.receiveCargo(ind, 'STON', 200);
    Industry.updateDaily(g, ind);
    expect(ind.outputBuffer[0] + ind.producedMonthly[0]).toBeGreaterThan(0);
  });

  test('food plant accepts grain and livestock and produces food', () => {
    const g = on(14);
    const ind = placeIndustry(g.state, 'food_plant', 60, 60);
    Industry.ensureIndustryState(ind, g.state, { immediate: false });
    expect(Industry.receiveCargo(ind, 'GRAI', 100)).toBe(true);
    expect(Industry.receiveCargo(ind, 'LVST', 100)).toBe(true);
    expect(Industry.receiveCargo(ind, 'GOOD', 50)).toBe(false);
    Industry.updateDaily(g, ind);
    expect(ind.outputBuffer[0] + ind.producedMonthly[0]).toBeGreaterThan(0);
  });
});

describe('T-IN chain industries: town acceptance', () => {
  test('a town of level 2+ accepts FOOD and BMAT only with extraIndustries on', () => {
    const g = on(15);
    // Find or make a house tile at level 2+ in town t
    const tiles = g.state.map.tiles;
    let found = null;
    for (let i = 0; i < tiles.length && !found; i++) {
      const b = tiles[i].building;
      if (b && b.type === 'house' && b.level >= 2) found = { x: i % g.state.map.width, y: Math.floor(i / g.state.map.width) };
    }
    if (found) {
      const a = tileAcceptance(g.state, found.x, found.y);
      expect(a.FOOD).toBeGreaterThan(0);
      expect(a.BMAT).toBeGreaterThan(0);
      expect(a.GOOD).toBeGreaterThan(0);
    }
    const off = Game.create({ seed: 15, width: 128, height: 128, townCount: 10, startYear: 1950 });
    const offTiles = off.state.map.tiles;
    for (let i = 0; i < offTiles.length; i++) {
      const b = offTiles[i].building;
      if (b && b.type === 'house') {
        const a = tileAcceptance(off.state, i % off.state.map.width, Math.floor(i / off.state.map.width));
        expect(a.FOOD).toBeUndefined();
        expect(a.BMAT).toBeUndefined();
        break;
      }
    }
  });

});

describe('T-IN chain industries: save round-trip', () => {
  test('chain industries and extraIndustries setting survive serialize/parse', () => {
    const g = on(17);
    const before = g.state.industries.filter((i) => CHAIN.includes(i.typeId)).map((i) => `${i.typeId}@${i.x},${i.y}`).sort();
    expect(before.length).toBeGreaterThan(0);
    const s = parseState(serializeState(g.state));
    const after = s.industries.filter((i) => CHAIN.includes(i.typeId)).map((i) => `${i.typeId}@${i.x},${i.y}`).sort();
    expect(after).toEqual(before);
    expect(s.settings.extraIndustries).toBe(true);
  });
});
