// CL: sub-arctic climate (opt-in). Temperate default must be unchanged; arctic adds snow above the snow line.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { isArctic, snowLineOf, snowDensity, tileSnowDensity, townGrowthAllowed, DEFAULT_SNOW_LINE } from '../js/simulation/climate.js';
import { recordTownDelivery, rollTownStats } from '../js/simulation/townGrowth.js';
import { drawArcticSnow, arcticState, setArcticClimate } from '../js/renderer/pack/arctic.js';
import { mapgenOptions } from '../js/simulation/game.js';

const make = (mapgen) => Game.create({ seed: 11, width: 64, height: 64, townCount: 6, mapgen });

describe('defaults', () => {
  test('temperate game has no climate field and is not arctic', () => {
    const g = make();
    expect(g.state.mapgen).toBeUndefined();
    expect(isArctic(g.state)).toBe(false);
    expect(tileSnowDensity(g.state, 7)).toBe(-1);
  });
  test('explicit temperate is dropped (identical save to the default)', () => {
    const a = make(), b = make({ climate: 'temperate' });
    expect(b.state.mapgen).toBeUndefined();
    expect(serializeState(b.state)).toBe(serializeState(a.state));
  });
  test('mapgenOptions keeps climate only when arctic', () => {
    expect(mapgenOptions({ climate: 'temperate', snowLine: 5 })).toEqual({});
    expect(mapgenOptions({ climate: 'arctic' })).toEqual({ climate: 'arctic' });
  });
  test('temperate towns always may grow', () => {
    const g = make();
    const t = g.state.towns[0];
    expect(townGrowthAllowed(g.state, { x: t.x, y: t.y })).toBe(true);
  });
});

describe('arctic save round trip', () => {
  test('climate and snow line survive save/load', () => {
    const g = make({ climate: 'arctic', snowLine: 3 });
    expect(g.state.mapgen).toEqual({ climate: 'arctic', snowLine: 3 });
    const back = parseState(serializeState(g.state));
    expect(isArctic(back)).toBe(true);
    expect(snowLineOf(back)).toBe(3);
  });
  test('arctic game without snowLine uses the default', () => {
    const g = make({ climate: 'arctic' });
    expect(snowLineOf(g.state)).toBe(DEFAULT_SNOW_LINE);
  });
});

describe('snow line rule', () => {
  test('OpenTTD density (k = z - line + 1, clamped 0..3): 1/4 from line-1, full from line+2', () => {
    expect(snowDensity(3, 5)).toBe(-1);
    expect(snowDensity(4, 5)).toBe(0);
    expect(snowDensity(5, 5)).toBe(1);
    expect(snowDensity(6, 5)).toBe(2);
    expect(snowDensity(7, 5)).toBe(3);
    expect(snowDensity(9, 5)).toBe(3);
  });
  test('tiles at/above the line are snowy only in arctic games', () => {
    const g = make({ climate: 'arctic', snowLine: 5 });
    expect(tileSnowDensity(g.state, 3)).toBe(-1);
    expect(tileSnowDensity(g.state, 5)).toBe(1);
    expect(tileSnowDensity(g.state, 7)).toBe(3);
    const t = make();
    expect(tileSnowDensity(t.state, 7)).toBe(-1);
  });
  test('drawArcticSnow draws nothing without the arctic pack (temperate path kept)', () => {
    setArcticClimate(true, 5);
    arcticState.pack = null;
    const ctx = { save() {}, restore() {}, drawImage() {}, setTransform() {} };
    expect(drawArcticSnow(ctx, 0, 0, [5, 5, 5, 5])).toBe(false);
    setArcticClimate(false, 5);
  });
});

describe('arctic town growth', () => {
  test('town above the snow line grows only with food last month', () => {
    const g = make({ climate: 'arctic', snowLine: 5 });
    const map = g.state.map;
    // pick a town and force its centre tile height
    const town = g.state.towns[0];
    const t = map.tiles[town.y * map.width + town.x];
    const saved = t.height;
    t.height = 6;
    expect(townGrowthAllowed(g.state, { x: town.x, y: town.y, foodLastMonth: 0 })).toBe(false);
    expect(townGrowthAllowed(g.state, { x: town.x, y: town.y, foodLastMonth: 4 })).toBe(true);
    t.height = 4;
    expect(townGrowthAllowed(g.state, { x: town.x, y: town.y, foodLastMonth: 0 })).toBe(true);
    t.height = saved;
  });
  test('food delivered this month becomes foodLastMonth at the month roll (arctic only)', () => {
    const g = make({ climate: 'arctic' });
    const town = g.state.towns[0];
    recordTownDelivery(town, 'FOOD', 6, g.state);
    rollTownStats(g.state, town);
    expect(town.foodLastMonth).toBe(6);
    rollTownStats(g.state, town);
    expect(town.foodLastMonth).toBeUndefined();
  });
  test('temperate games never record food (lazy field absent)', () => {
    const g = make();
    const town = g.state.towns[0];
    recordTownDelivery(town, 'FOOD', 6, g.state);
    expect(town.foodThisMonth).toBeUndefined();
    rollTownStats(g.state, town);
    expect(town.foodLastMonth).toBeUndefined();
  });
});
