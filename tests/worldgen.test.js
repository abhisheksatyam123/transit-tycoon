import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';

describe('Game.create invariants', () => {
  const game = Game.create({ seed: 99, width: 128, height: 128, townCount: 5, industryCount: 6 });
  const s = game.state;

  test('town and industry counts are reported', () => {
    expect(s.towns.length).toBeGreaterThan(0);
    expect(s.towns.length).toBeLessThanOrEqual(5);
    expect(s.industries.length).toBeGreaterThan(0);
    expect(s.industries.length).toBeLessThanOrEqual(6);
  });

  test('tiles array length = width * height', () => {
    expect(s.map.width).toBe(128);
    expect(s.map.height).toBe(128);
    expect(s.map.tiles.length).toBe(128 * 128);
  });

  test('every tile has the required shape', () => {
    for (const t of s.map.tiles) {
      expect(Object.keys(t).sort()).toEqual(['building', 'height', 'owner', 'rail', 'road', 'terrain'].sort());
    }
  });

  test('houses are on land (not water)', () => {
    let houses = 0;
    for (const town of s.towns) for (const h of town.houses) {
      houses++;
      expect(game.tile(h.x, h.y).terrain).not.toBe('water');
    }
    expect(houses).toBeGreaterThan(0);
  });

  test('no building sits on water', () => {
    for (const t of s.map.tiles) {
      if (t.building) expect(t.terrain).not.toBe('water');
    }
  });

  test('inBounds / tileInfo respect the map edges', () => {
    expect(game.inBounds(0, 0)).toBe(true);
    expect(game.inBounds(127, 127)).toBe(true);
    expect(game.inBounds(128, 0)).toBe(false);
    expect(game.inBounds(-1, 5)).toBe(false);
    expect(game.tileInfo(-1, 0)).toBeNull();
  });
});
