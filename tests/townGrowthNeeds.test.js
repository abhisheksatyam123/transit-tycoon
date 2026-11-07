import { test, expect, describe } from 'bun:test';
import { growthNeeds } from '../js/ui/windows/town.js';
import { tropicZoneAt, tropicZonesReset } from '../js/simulation/climate.js';

// W x W map; heights and terrain from callbacks
const mk = (climate, heightAt = () => 0, terrainAt = () => 'grass') => {
  const W = 12;
  const tiles = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) tiles.push({ terrain: terrainAt(x, y), height: heightAt(x, y) });
  const state = { mapgen: { climate }, map: { width: W, height: W, tiles } };
  tropicZonesReset(state.map);
  return state;
};
const town = (x, y) => ({ id: 1, name: 'T', x, y, population: 100 });

describe('town growth needs (F13)', () => {
  test('temperate town shows no food/water requirement', () => {
    expect(growthNeeds(mk('temperate'), town(5, 5))).toBeNull();
    expect(growthNeeds({ map: { width: 1, height: 1, tiles: [{ terrain: 'grass', height: 0 }] } }, town(0, 0))).toBeNull();
  });

  test('sub-tropic town centred in the desert needs FOOD and WATER', () => {
    // flat grass: the desert line is 1 and every interior tile is desert (zone 1)
    const state = mk('tropic');
    expect(tropicZoneAt(state.map, 5, 5)).toBe(1);
    expect(growthNeeds(state, town(5, 5))).toEqual({ food: true, water: true });
  });

  test('sub-tropic town outside the desert needs nothing', () => {
    const state = mk('tropic', () => 0, (x, y) => (x === 5 && y === 5 ? 'water' : 'grass'));
    expect(tropicZoneAt(state.map, 6, 6)).not.toBe(1);
    expect(growthNeeds(state, town(6, 6))).toBeNull();
  });

  test('arctic town above the snow line needs FOOD only', () => {
    expect(growthNeeds(mk('arctic', () => 7), town(5, 5))).toEqual({ food: true, water: false });
  });

  test('arctic town below the snow line needs nothing', () => {
    expect(growthNeeds(mk('arctic', () => 0), town(5, 5))).toBeNull();
  });
});
