// F4: opt-in water borders mapgen option. Default (none/absent) must be byte-identical to the historic
// generator; 'all' floods every edge tile; 'random' is derived from the game seed.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, waterBorderMask, applyWaterBorders, WATER_BORDER_SIDES } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game, mapgenOptions } from '../js/simulation/game.js';

const SIZE = 96;
function gen(seed, opts) {
  const m = createMap(SIZE, SIZE);
  generateTerrain(m, makeRng(seed), opts);
  return m;
}
const sig = (m) => m.tiles.reduce((a, t) => a + t.height + t.terrain[0] + ',', '');
const digest = (s) => new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);
const edgeTiles = (m) => {
  const out = [];
  const { width: W, height: H, tiles } = m;
  for (let x = 0; x < W; x++) out.push({ x, y: 0 }, { x, y: H - 1 });
  for (let y = 0; y < H; y++) out.push({ x: 0, y }, { x: W - 1, y });
  return out;
};

describe('default is unchanged', () => {
  // Same pinned golden digests as tests/mapgen.test.js (captured before mapgen options existed).
  const GOLDEN = { 1: '23ddba52c54170b7', 7: '44f4f6d9adf7a61e', 42: '215d371071af6b4f' };
  for (const [seed, hash] of Object.entries(GOLDEN)) {
    test(`seed ${seed}: absent and 'none' match the golden map`, () => {
      const s = Number(seed);
      expect(digest(sig(gen(s, {})))).toBe(hash);
      expect(digest(sig(gen(s, { waterBorders: 'none' })))).toBe(hash);
      expect(sig(gen(s, { waterBorders: 'none' }))).toBe(sig(gen(s, {})));
    });
  }
  test('mapgenOptions strips the default and keeps an explicit border', () => {
    expect(mapgenOptions({ waterBorders: 'none' })).toEqual({});
    expect(mapgenOptions({})).toEqual({});
    expect(mapgenOptions({ waterBorders: 'all' })).toEqual({ waterBorders: 'all' });
  });
});

describe("waterBorders 'all'", () => {
  test('every edge tile is water at height 0, interior slopes stay valid', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const m = gen(seed, { waterBorders: 'all' });
      for (const { x, y } of edgeTiles(m)) {
        const t = m.tiles[y * m.width + x];
        expect(t.terrain).toBe('water');
        expect(t.height).toBe(0);
      }
      // no land tile exceeds the water by more than the normal 1-level step (limitSlopes), and every
      // water tile is at sea level
      for (let y = 0; y < m.height; y++) {
        for (let x = 0; x < m.width; x++) {
          const t = m.tiles[y * m.width + x];
          if (t.terrain === 'water') expect(t.height).toBe(0);
          if (x + 1 < m.width) expect(Math.abs(t.height - m.tiles[y * m.width + x + 1].height)).toBeLessThanOrEqual(1);
          if (y + 1 < m.height) expect(Math.abs(t.height - m.tiles[(y + 1) * m.width + x].height)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  test('inland land remains (the option does not flood the world)', () => {
    const m = gen(1, { waterBorders: 'all' });
    const land = m.tiles.filter((t) => t.terrain !== 'water').length;
    expect(land).toBeGreaterThan(m.tiles.length * 0.5);
  });
  test('a full game with water borders places no town/industry tile on water', () => {
    const game = Game.create({ seed: 7, width: 96, height: 96, townCount: 8, industryCount: 8, mapgen: { waterBorders: 'all' } });
    const map = game.state.map;
    for (const { x, y } of edgeTiles(map)) expect(map.tiles[y * map.width + x].terrain).toBe('water');
    for (const town of game.state.towns) {
      for (const h of town.houses) expect(map.tiles[h.y * map.width + h.x].terrain).not.toBe('water');
    }
    for (const ind of game.state.industries) {
      for (let y = ind.y; y < ind.y + ind.h; y++) {
        for (let x = ind.x; x < ind.x + ind.w; x++) expect(map.tiles[y * map.width + x].terrain).not.toBe('water');
      }
    }
  });
});

describe('waterBorderMask', () => {
  test('none/absent -> 0, all -> every side', () => {
    expect(waterBorderMask(undefined, 1)).toBe(0);
    expect(waterBorderMask('none', 1)).toBe(0);
    expect(waterBorderMask('all', 1)).toBe(15);
  });
  test('per-side values and comma lists', () => {
    expect(waterBorderMask('north', 1)).toBe(1);
    expect(waterBorderMask('east', 1)).toBe(2);
    expect(waterBorderMask('south', 1)).toBe(4);
    expect(waterBorderMask('west', 1)).toBe(8);
    expect(waterBorderMask('north,south', 1)).toBe(5);
    expect(WATER_BORDER_SIDES).toEqual(['north', 'east', 'south', 'west']);
  });
  test("'random' is seed-derived, non-empty and stable", () => {
    expect(waterBorderMask('random', 1)).toBe(waterBorderMask('random', 1));
    for (const seed of [1, 2, 3, 42, 1234, 'abc']) {
      const mask = waterBorderMask('random', seed);
      expect(mask).toBeGreaterThan(0);
      expect(mask).toBeLessThanOrEqual(15);
    }
  });
});

describe("waterBorders 'random'", () => {
  test('same seed -> same mask and same map', () => {
    const a = gen(42, { waterBorders: 'random', seed: 42 });
    const b = gen(42, { waterBorders: 'random', seed: 42 });
    expect(sig(a)).toBe(sig(b));
    expect(waterBorderMask('random', 42)).toBe(waterBorderMask('random', 42));
  });
  test('different seeds give a reasonable spread of side sets', () => {
    const masks = new Set();
    for (let seed = 1; seed <= 40; seed++) masks.add(waterBorderMask('random', seed));
    expect(masks.size).toBeGreaterThanOrEqual(3);
    expect(masks.has(15)).toBe(true); // the full ring must be reachable
  });
  test('only the chosen sides are flooded; other changes stay by the new coast', () => {
    // pick a seed with a single-side mask and compare it with the unbordered map
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].find((s) => {
      const m = waterBorderMask('random', s);
      return m === 1 || m === 2 || m === 4 || m === 8;
    });
    expect(seed).toBeDefined();
    const mask = waterBorderMask('random', seed);
    const plain = gen(seed, {});
    const bordered = gen(seed, { waterBorders: 'random', seed });
    const { width: W, height: H } = bordered;
    for (const { x, y } of edgeTiles(bordered)) {
      const side = y === 0 ? 1 : x === W - 1 ? 2 : y === H - 1 ? 4 : 8;
      if (mask & side) expect(bordered.tiles[y * W + x].terrain).toBe('water');
    }
    // The flooded edge lowers the coast inland by at most the 1-level slope chain (<= 7 tiles); no change
    // may appear far from the chosen sides (that would mean the rest of the map was disturbed).
    const nearFlood = (x, y) => ((mask & 1) && y <= 7) || ((mask & 2) && x >= W - 8)
      || ((mask & 4) && y >= H - 8) || ((mask & 8) && x <= 7);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (plain.tiles[i].terrain !== bordered.tiles[i].terrain) expect(nearFlood(x, y)).toBe(true);
      }
    }
  });
});

describe('applyWaterBorders helper', () => {
  test('only the requested side is changed', () => {
    const m = createMap(8, 8);
    for (const t of m.tiles) { t.terrain = 'grass'; t.height = 3; }
    applyWaterBorders(m, 1); // north
    for (let x = 0; x < 8; x++) {
      expect(m.tiles[x].terrain).toBe('water');
      expect(m.tiles[x].height).toBe(0);
    }
    expect(m.tiles[7 * 8 + 7].terrain).toBe('grass');
    expect(m.tiles[7 * 8 + 7].height).toBe(3);
  });
});
