// F3: opt-in heightmap rotation/mirror (U5). Default 'none' must leave the import and mapgen hashes untouched.
import { test, expect, describe } from 'bun:test';
import {
  rotateGrid, heightsForMap, greyToHeights, HEIGHTMAP_ROTATIONS,
} from '../js/simulation/heightmap.js';
import { createMap, generateTerrain, generateTerrainFromHeights } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game, mapgenOptions } from '../js/simulation/game.js';

const values = (r) => Array.from(r.values);
const sig = (m) => m.tiles.reduce((a, t) => a + t.height + t.terrain[0] + ',', '');
const digest = (s) => new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);

describe('rotateGrid mappings (exact pixel permutations)', () => {
  // 2x3 source (rows): 1 2 / 3 4 / 5 6
  const src = [1, 2, 3, 4, 5, 6];
  const cases = {
    none: { w: 2, h: 3, v: [1, 2, 3, 4, 5, 6] },
    rot90: { w: 3, h: 2, v: [5, 3, 1, 6, 4, 2] },
    rot180: { w: 2, h: 3, v: [6, 5, 4, 3, 2, 1] },
    rot270: { w: 3, h: 2, v: [2, 4, 6, 1, 3, 5] },
    flipX: { w: 2, h: 3, v: [2, 1, 4, 3, 6, 5] },
    flipY: { w: 2, h: 3, v: [5, 6, 3, 4, 1, 2] },
    transpose: { w: 3, h: 2, v: [1, 3, 5, 2, 4, 6] },
    antiTranspose: { w: 3, h: 2, v: [6, 4, 2, 5, 3, 1] },
  };
  for (const [name, want] of Object.entries(cases)) {
    test(name, () => {
      const r = rotateGrid(src, 2, 3, name);
      expect(r.width).toBe(want.w);
      expect(r.height).toBe(want.h);
      expect(values(r)).toEqual(want.v);
    });
  }

  test('none is an unchanged copy (not the same array)', () => {
    const r = rotateGrid(src, 2, 3, 'none');
    expect(values(r)).toEqual(src);
    expect(r.values).not.toBe(src);
  });

  test('rotations are reversible and compose correctly', () => {
    const r90 = rotateGrid(src, 2, 3, 'rot90');
    expect(values(rotateGrid(r90.values, r90.width, r90.height, 'rot270'))).toEqual(src);
    // mirror across X = mirror across Y then a half turn
    const flipYThen180 = rotateGrid(rotateGrid(src, 2, 3, 'flipY').values, 2, 3, 'rot180');
    expect(values(rotateGrid(src, 2, 3, 'flipX'))).toEqual(values(flipYThen180));
  });

  test('unknown rotation and size mismatch throw', () => {
    expect(() => rotateGrid(src, 2, 3, 'rot45')).toThrow();
    expect(() => rotateGrid(src, 3, 3, 'rot90')).toThrow();
  });
});

describe('heightsForMap rotation', () => {
  test('matches rotateGrid(greyToHeights(...)) for every option', () => {
    const w = 3, h = 2;
    const grey = new Uint8Array([0, 64, 128, 192, 230, 255]); // 3x2, distinct heights
    const base = greyToHeights(grey);
    for (const rot of HEIGHTMAP_ROTATIONS) {
      const want = rotateGrid(base, w, h, rot);
      const got = heightsForMap(grey, w, h, w, h, rot);
      expect(Array.from(got)).toEqual(values(want));
    }
  });

  test("default (no rotation argument) equals 'none'", () => {
    const grey = new Uint8Array([10, 20, 30, 40]);
    expect(Array.from(heightsForMap(grey, 2, 2, 4, 4))).toEqual(Array.from(heightsForMap(grey, 2, 2, 4, 4, 'none')));
  });
});

describe('heightmap terrain generation', () => {
  const W = 8;
  // Gentle deterministic heights (adjacent differences <= 1, so limitSlopes is a no-op).
  const heights = () => {
    const hs = new Uint8Array(W * W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) hs[y * W + x] = Math.min(5, 1 + ((x + y) >> 2));
    hs[0] = 0; // one water tile, still adjacent to height 1
    return hs;
  };
  const genMap = (opts) => {
    const m = createMap(W, W);
    generateTerrainFromHeights(m, makeRng(11), heights(), opts);
    return m;
  };

  test("'none' and no option produce identical tiles", () => {
    const a = genMap({});
    const b = genMap({ heightmapRotation: 'none' });
    expect(sig(a)).toBe(sig(b));
    expect(a.tiles.map((t) => [t.height, t.terrain])).toEqual(b.tiles.map((t) => [t.height, t.terrain]));
  });

  test('each rotation transforms the generated height layout', () => {
    const base = genMap({});
    for (const rot of HEIGHTMAP_ROTATIONS) {
      const m = genMap({ heightmapRotation: rot });
      const want = rotateGrid(new Uint8Array(base.tiles.map((t) => t.height)), W, W, rot).values;
      expect(m.tiles.map((t) => t.height)).toEqual(Array.from(want));
      // the mapping is a permutation: same terrain height histogram
      expect(m.tiles.map((t) => t.height).sort()).toEqual(base.tiles.map((t) => t.height).sort());
      // water follows the rotated heights
      const waterBase = base.tiles.map((t) => t.height === 0);
      expect(m.tiles.map((t) => t.height === 0)).toEqual(Array.from(rotateGrid(Uint8Array.from(waterBase), W, W, rot).values).map((v) => v === 1));
    }
  });

  test('a quarter turn of a non-square map is rejected', () => {
    const m = createMap(4, 6);
    expect(() => generateTerrainFromHeights(m, makeRng(1), new Uint8Array(24), { heightmapRotation: 'rot90' })).toThrow();
    expect(() => generateTerrainFromHeights(m, makeRng(1), new Uint8Array(24), { heightmapRotation: 'flipX' })).not.toThrow();
  });
});

describe('mapgen option plumbing', () => {
  test("heightmapRotation is stripped at its default and kept when set", () => {
    expect(mapgenOptions({ heightmapRotation: 'none' })).toEqual({});
    expect(mapgenOptions({})).toEqual({});
    expect(mapgenOptions({ heightmapRotation: 'rot180' })).toEqual({ heightmapRotation: 'rot180' });
  });

  test('default generated map hashes are unchanged (pinned)', () => {
    const SIZE = 96;
    const golden = { 1: '23ddba52c54170b7', abc: 'b8ca433982117c64' };
    for (const [seed, want] of Object.entries(golden)) {
      const s = seed === 'abc' ? 'abc' : Number(seed);
      const m = createMap(SIZE, SIZE);
      generateTerrain(m, makeRng(s), {});
      expect(digest(sig(m))).toBe(want);
    }
  });

  test('Game.create with a heightmap: default and rotation maps differ only by the mapping', () => {
    const size = 32;
    const hm = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hm[y * size + x] = Math.min(6, 1 + Math.floor((x + 2 * y) / 12));
    const base = Game.create({ seed: 5, width: size, height: size, townCount: 2, industryCount: 1, heightmap: hm });
    const none = Game.create({ seed: 5, width: size, height: size, townCount: 2, industryCount: 1, heightmap: hm, mapgen: { heightmapRotation: 'none' } });
    expect(sig(none.state.map)).toBe(sig(base.state.map));
    expect(none.state.mapgen).toBeUndefined();
    expect(base.state.mapgen).toBeUndefined();

    const rot = Game.create({ seed: 5, width: size, height: size, townCount: 2, industryCount: 1, heightmap: hm, mapgen: { heightmapRotation: 'rot180' } });
    expect(rot.state.mapgen).toEqual({ heightmapRotation: 'rot180' });
    const want = rotateGrid(new Uint8Array(base.state.map.tiles.map((t) => t.height)), size, size, 'rot180').values;
    expect(rot.state.map.tiles.map((t) => t.height)).toEqual(Array.from(want));
  });
});
