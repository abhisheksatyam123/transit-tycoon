// Building eras (gap #31b, buildingEras setting): period-appropriate houses by year; off = unchanged.
import { test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { ERA_HOUSES, eraHouse, eraCandidates } from '../js/simulation/buildingEras.js';

const MODERN = ERA_HOUSES.filter((h) => h.min > 1960).map((h) => h.id);
const houseIds = (g) => g.state.map.tiles.filter((t) => t.building && t.building.type === 'house').map((t) => t.building);

function make(year, on, seed = 7) {
  return Game.create({ seed, startYear: year, settings: on ? { buildingEras: true } : undefined });
}

test('1950 town with buildingEras on: no post-1960 house types', () => {
  const g = make(1950, true);
  const ids = houseIds(g).map((b) => b.houseId).filter((x) => x !== undefined);
  expect(ids.length).toBeGreaterThan(20);
  for (const id of ids) expect(MODERN.includes(id)).toBe(false);
  for (const id of ids) expect(eraHouse(id).min <= 1950 && 1950 <= eraHouse(id).max).toBe(true);
});

test('every era candidate is valid for its year', () => {
  for (const y of [1930, 1950, 1960, 1975, 2000]) {
    for (let lv = 1; lv <= 4; lv++) {
      for (const h of eraCandidates(lv, y)) expect(y >= h.min && y <= h.max).toBe(true);
    }
  }
});

test('with startYear 2000 modern house types appear', () => {
  const g = make(2000, true);
  const ids = houseIds(g).map((b) => b.houseId);
  expect(ids.some((id) => MODERN.includes(id))).toBe(true);
});

test('advancing from 1950 to 2000 adds modern types', () => {
  const g = make(1950, true);
  const before = new Set(houseIds(g).map((b) => b.houseId));
  expect([...before].some((id) => MODERN.includes(id))).toBe(false);
  g.state.date.year = 2000;
  g.stepDays(365);
  const after = houseIds(g).map((b) => b.houseId);
  expect(after.some((id) => MODERN.includes(id))).toBe(true);
}, 60000);

test('setting off: no houseId stored (default games unchanged)', () => {
  const g = make(1950, false);
  expect(houseIds(g).every((b) => b.houseId === undefined)).toBe(true);
});

test('determinism: same seed gives identical serialized state', () => {
  const a = make(1950, true, 11); a.stepDays(40);
  const b = make(1950, true, 11); b.stepDays(40);
  expect(serializeState(a.state)).toBe(serializeState(b.state));
});

test('save round-trip keeps houseId and settings', () => {
  const g = make(1975, true, 3);
  g.stepDays(10);
  const json = serializeState(g.state);
  const back = parseState(json);
  expect(serializeState(back)).toBe(json);
  expect(back.settings.buildingEras).toBe(true);
  const ids = back.map.tiles.filter((t) => t.building && t.building.houseId !== undefined).length;
  expect(ids).toBeGreaterThan(0);
});
