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

// TY4: toyland infrastructure overrides (roads, rail, water, stations, depots, bridges, tunnels, foundations).
import { TOYLAND_OVERRIDE_MAP, buildToylandView } from '../js/renderer/pack/toyland.js';
import { TOYLAND_OVERRIDE_BLOCKS } from '../js/renderer/pack/toyland_overrides.js';

describe('toyland infrastructure overrides (TY4)', () => {
  test('override map covers the road, rail, water, station, depot, bridge and tunnel ids', () => {
    const m = TOYLAND_OVERRIDE_MAP;
    // roads (city 1313, grass 1332), rail (1005), crossings (1370, 1382), depots (1063, 1408), stations (1069, 1073 brick building, 1074)
    for (const id of [1313, 1331, 1332, 1350, 1005, 1036, 1370, 1382, 1063, 1068, 1069, 1073, 1074, 1408, 1413]) expect(m.has(id)).toBe(true);
    // water (4061 flat, 4062.. shore), foundations (990..1003), bus/truck stops (2692.., 2708..), docks (2727..)
    for (const id of [4061, 4062, 4069, 990, 1003, 2692, 2707, 2708, 2723, 2727, 2732]) expect(m.has(id)).toBe(true);
    // bridges (2437..) and tunnels (2365.., 2389..)
    for (const id of [2437, 2592, 2365, 2388, 2389, 2396]) expect(m.has(id)).toBe(true);
  });

  test('TY6: station ids that differ in size from base 1079-1086 are not mapped; base 1073/1074 map to toyland 581/582', () => {
    expect(TOYLAND_OVERRIDE_MAP.get(1073)).toBe(581);
    expect(TOYLAND_OVERRIDE_MAP.get(1074)).toBe(582);
    for (const id of [1079, 1080, 1081, 1082, 1083, 1084, 1085, 1086]) expect(TOYLAND_OVERRIDE_MAP.has(id)).toBe(false);
    expect(has(561) && has(574)).toBe(true); // packed (kept) but not mapped
  });

  test('toffee quarry ground 3981 maps to toyland grass 57 (not the temperate grass)', () => {
    expect(TOYLAND_OVERRIDE_MAP.get(3981)).toBe(57);
    expect(TOYLAND_OVERRIDE_MAP.get(3924)).toBe(0);
  });

  test('every override target exists in the toyland pack manifest', () => {
    for (const t of TOYLAND_OVERRIDE_MAP.values()) expect(has(t)).toBe(true);
  });

  test('override map is one-to-one (no base id is claimed twice)', () => {
    const n = [...TOYLAND_OVERRIDE_MAP.keys()].length;
    let total = 0;
    for (const [a, b] of TOYLAND_OVERRIDE_BLOCKS.map(([a, b]) => [a, b])) total += b - a + 1;
    expect(n).toBe(total);
  });

  test('temperate lookups are unchanged: the view is only built for toyland, base sprites keep their ids', () => {
    const base = { sprites: { 1313: [0, 0, 0, 64, 31, -31, 0, 0], 3981: [0, 1, 1, 64, 31, -31, 0, 0] }, groups: {}, atlases: [{}], masks: [null], tint: new Map() };
    const toy = { sprites: { 57: [0, 9, 9, 64, 31, -31, 0, 0], 134: [0, 5, 5, 64, 31, -31, 0, 0] }, groups: {}, atlases: [{}], masks: [null] };
    const view = buildToylandView(base, toy);
    expect(view.sprites[1313]).toEqual([1, 5, 5, 64, 31, -31, 0, 0]);
    expect(view.sprites[3981]).toEqual([1, 9, 9, 64, 31, -31, 0, 0]);
    // the base pack is not mutated
    expect(base.sprites[1313]).toEqual([0, 0, 0, 64, 31, -31, 0, 0]);
    expect(base.sprites[3981]).toEqual([0, 1, 1, 64, 31, -31, 0, 0]);
    // a base id outside every override block keeps its base entry
    expect(view.sprites[4000]).toBeUndefined();
  });
});
