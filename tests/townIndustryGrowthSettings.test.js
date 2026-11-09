import { describe, test, expect } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { Game } from '../js/simulation/game.js';
import { growForTick } from '../js/simulation/loco/townGrow.js';
import { tickTown } from '../js/simulation/loco/town.js';
import { distributeTownCargo } from '../js/simulation/cargo.js';
import { ensureIndustryState, updateDaily } from '../js/simulation/loco/industry.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const game = () => Game.create({ seed: 3, width: 96, height: 96, startYear: 1960, emptyFlat: true });
const townOf = (g) => g.state.towns.find((t) => t.houses && t.houses.length) || g.state.towns[0];
const roadCount = (g) => g.state.map.tiles.filter((t) => t.road && t.owner === 'town').length;
const houseCount = (town) => town.houses.length;

describe('OpenTTD economy.allow_town_roads / place_houses', () => {
  test('defaults are true and match the pre-setting behaviour', () => {
    expect(DEFAULT_SETTINGS.allowTownRoads).toBe(true);
    expect(DEFAULT_SETTINGS.placeHouses).toBe(true);
    const g = game();
    expect(getSetting(g.state, 'allowTownRoads')).toBe(true);
    expect(getSetting(g.state, 'placeHouses')).toBe(true);
  });

  test('placeHouses=false grows no houses (growForTick flag)', () => {
    const g = game();
    const town = townOf(g);
    town.buildSpeed = 5; // 9 growTown calls per growForTick
    const before = houseCount(town);
    for (let i = 0; i < 120; i++) growForTick(g, town, { placeHouses: false, allowTownRoads: true });
    expect(houseCount(town)).toBe(before);
  });

  test('allowTownRoads=false builds no town roads (growForTick flag)', () => {
    const g = game();
    const town = townOf(g);
    town.buildSpeed = 5;
    const before = roadCount(g);
    for (let i = 0; i < 120; i++) growForTick(g, town, { placeHouses: true, allowTownRoads: false });
    expect(roadCount(g)).toBe(before);
  });

  test('tickTown reads the settings from the game state', () => {
    const g = game();
    const town = townOf(g);
    town.buildSpeed = 5;
    setSetting(g.state, 'placeHouses', false);
    setSetting(g.state, 'allowTownRoads', false);
    const houses = houseCount(town), roads = roadCount(g);
    for (let i = 0; i < 120; i++) tickTown(g, town);
    expect(houseCount(town)).toBe(houses);
    expect(roadCount(g)).toBe(roads);
  });

  test('default flags still grow the town (sanity)', () => {
    const g = game();
    const town = townOf(g);
    town.buildSpeed = 5;
    const houses = houseCount(town), roads = roadCount(g);
    for (let i = 0; i < 120; i++) growForTick(g, town, { placeHouses: true, allowTownRoads: true });
    expect(houseCount(town) > houses || roadCount(g) > roads).toBe(true);
  });
});

describe('OpenTTD economy.town_cargo_scale / industry_cargo_scale', () => {
  test('defaults are 100%', () => {
    expect(DEFAULT_SETTINGS.townCargoScale).toBe(100);
    expect(DEFAULT_SETTINGS.industryCargoScale).toBe(100);
  });

  test('town cargo scale halves house passengers and mail', () => {
    const a = game();
    const b = game();
    for (const g of [a, b]) for (const t of g.state.towns) { t.passengersThisMonth = 0; t.mailThisMonth = 0; }
    setSetting(a.state, 'townCargoScale', 100);
    setSetting(b.state, 'townCargoScale', 50);
    distributeTownCargo(a.state, a.rng, new Set());
    distributeTownCargo(b.state, b.rng, new Set());
    const sum = (g) => g.state.towns.reduce((n, t) => n + (t.passengersThisMonth || 0) + (t.mailThisMonth || 0), 0);
    const base = sum(a), scaled = sum(b);
    expect(base).toBeGreaterThan(0);
    expect(scaled).toBeGreaterThan(0);
    expect(scaled).toBeLessThan(base);
    // each house's small count is rounded after scaling, so the total is near (not exactly) half
    expect(scaled).toBeLessThanOrEqual(Math.round(base * 0.7));
  });

  test('industry cargo scale 0 produces nothing; 100 produces', () => {
    const pick = (g) => g.state.industries.find((i) => {
      ensureIndustryState(i, g.state);
      return i.dailyProduction && i.dailyProduction[0] > 0;
    });
    const run = (scale) => {
      const g = game();
      const ind = pick(g);
      expect(ind).toBeTruthy();
      ind.dailyProduction = [ind.dailyProductionTarget[0], ind.dailyProductionTarget[1]];
      ind.outputBuffer = [0, 0];
      ind.producedMonthly = [0, 0];
      setSetting(g.state, 'industryCargoScale', scale);
      for (let i = 0; i < 40; i++) updateDaily(g, ind);
      return ind.producedMonthly[0];
    };
    expect(run(0)).toBe(0);
    expect(run(100)).toBeGreaterThan(0);
  });

  test('settings round-trip through save/load', () => {
    const g = game();
    setSetting(g.state, 'allowTownRoads', false);
    setSetting(g.state, 'placeHouses', false);
    setSetting(g.state, 'townCargoScale', 75);
    setSetting(g.state, 'industryCargoScale', 125);
    const loaded = parseState(serializeState(g.state));
    expect(getSetting(loaded, 'allowTownRoads')).toBe(false);
    expect(getSetting(loaded, 'placeHouses')).toBe(false);
    expect(getSetting(loaded, 'townCargoScale')).toBe(75);
    expect(getSetting(loaded, 'industryCargoScale')).toBe(125);
  });
});
