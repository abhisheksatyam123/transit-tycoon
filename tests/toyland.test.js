// TY: toyland climate (opt-in 'toyland', stage 1): climate flag, toyland houses, toyland ground and tree lookups.
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isToyland, isTropic, isArctic } from '../js/simulation/climate.js';
import { mapgenOptions } from '../js/simulation/game.js';
import { TOYLAND_HOUSES, TOYLAND_TREE_ROWS } from '../js/renderer/pack/toyland_table.js';
import { TOYLAND_GROUND, toylandGroundBase, toylandGroundId, pickToylandHouse, toylandTreeRow, setToylandClimate, toylandState, toylandActive } from '../js/renderer/pack/toyland.js';

const manifest = JSON.parse(readFileSync(new URL('../assets/opengfx/toyland/manifest.json', import.meta.url), 'utf8'));
const has = (id) => !!manifest.sprites[String(id)];

describe('toyland climate', () => {
  test('climate flag is explicit only and distinct from the other climates', () => {
    expect(isToyland({ mapgen: { climate: 'toyland' } })).toBe(true);
    expect(isToyland({ mapgen: { climate: 'tropic' } })).toBe(false);
    expect(isToyland({ mapgen: { climate: 'arctic' } })).toBe(false);
    expect(isToyland({})).toBe(false);
    expect(isTropic({ mapgen: { climate: 'toyland' } })).toBe(false);
    expect(isArctic({ mapgen: { climate: 'toyland' } })).toBe(false);
  });

  test('mapgen options keep the toyland climate and drop the temperate default', () => {
    expect(mapgenOptions({ climate: 'toyland' })).toEqual({ climate: 'toyland' });
    expect(mapgenOptions({ climate: 'temperate' })).toEqual({});
  });

  test('toyland pack is off unless a toyland game is attached and the pack is loaded', () => {
    setToylandClimate(false, null);
    expect(toylandActive(true)).toBe(false);
    setToylandClimate(true, null);
    expect(toylandActive(true)).toBe(false); // no pack loaded in this test
    toylandState.on = false;
  });
});

describe('toyland houses', () => {
  test('the house table holds 1x1 ClimateToyland houses with four hash variants each', () => {
    expect(TOYLAND_HOUSES.length).toBeGreaterThan(0);
    for (const h of TOYLAND_HOUSES) expect(h.pairs.length).toBe(4);
  });

  test('houses are chosen from the toyland set for every level and year', () => {
    const ids = new Set(TOYLAND_HOUSES.map((h) => h.id));
    for (const level of [1, 2, 3, 4]) for (const year of [1950, 2000, 2100]) {
      for (let hash = 0; hash < 256; hash += 7) {
        const p = pickToylandHouse(year, level, hash);
        expect(p).not.toBeNull();
        const house = TOYLAND_HOUSES.find((h) => h.pairs.some((q) => q[0] === p.ground && q[1] === p.building));
        expect(house).toBeDefined();
        expect(ids.has(house.id)).toBe(true);
      }
    }
  });

  test('house sprites exist in the toyland pack (ground and building)', () => {
    for (const h of TOYLAND_HOUSES) for (const p of h.pairs) {
      expect(has(p[0])).toBe(true);
      expect(has(p[1])).toBe(true);
    }
  });

  test('houses respect the min year', () => {
    const early = pickToylandHouse(1900, 1, 3);
    const house = TOYLAND_HOUSES.find((h) => h.pairs.some((q) => q[0] === early.ground && q[1] === early.building));
    expect(house.minYear).toBeLessThanOrEqual(1900);
  });
});

describe('toyland ground and trees', () => {
  test('ground sprite lookup returns toyland ids (grass, rock, desert) in the pack', () => {
    const flat = [0, 0, 0, 0];
    const grass = toylandGroundId('grass', 5, flat);
    expect(Object.values(TOYLAND_GROUND)).toContain(toylandGroundBase('grass', 5));
    expect(grass).toBeGreaterThanOrEqual(TOYLAND_GROUND.bare0);
    expect(has(grass)).toBe(true);
    const rock = toylandGroundId('rock', 3, [1, 1, 1, 0]);
    expect(rock).toBeGreaterThanOrEqual(TOYLAND_GROUND.rocks);
    expect(has(rock)).toBe(true);
    expect(has(toylandGroundId('desert', 1, flat))).toBe(true);
  });

  test('water and unknown kinds have no toyland ground', () => {
    expect(toylandGroundId('water', 1, [0, 0, 0, 0])).toBe(-1);
    expect(toylandGroundBase('snow', 1)).toBe(-1);
  });

  test('tree rows come from TREE_TOYLAND (9 types x 4 layouts) and are base-atlas sprites', () => {
    expect(TOYLAND_TREE_ROWS.length).toBe(36);
    for (let h = 0; h < 40; h++) {
      const row = toylandTreeRow(h & 3, h);
      expect(row.length).toBe(4);
      expect(row.every((id) => id > 1000 && id < 5000)).toBe(true);
    }
  });
});

describe('toyland house coverage', () => {
  test('every house level in a toyland game resolves to a toyland sprite id', () => {
    for (const level of [1, 2, 3, 4]) for (const year of [1900, 1980, 2050]) for (let hash = 0; hash < 1024; hash++) {
      const p = pickToylandHouse(year, level, hash);
      expect(p).not.toBeNull();
      expect(has(p.ground)).toBe(true);
      expect(has(p.building)).toBe(true);
    }
  });
});
