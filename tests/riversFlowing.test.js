// Flowing rivers (rivers: 'flowing'): rivers sit on slopes at their height, flow downhill and end at water.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain, riverSlopeOk } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const SIZE = 96;
const gen = (seed, opts = { rivers: 'flowing', seaLevel: 'none' }) => {
  const m = createMap(SIZE, SIZE);
  generateTerrain(m, makeRng(seed), opts);
  return m;
};
const rivers = (m) => m.tiles.map((t, i) => (t.river ? i : -1)).filter((i) => i >= 0);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const nbrs = (m, i) => {
  const x = i % m.width, y = (i - x) / m.width;
  return DIRS.map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < m.width && ny < m.height)
    .map(([nx, ny]) => ny * m.width + nx);
};

describe('flowing rivers', () => {
  test('river tiles are water at their own height, not at sea level', () => {
    let found = 0;
    for (const seed of [1, 7, 42]) {
      const m = gen(seed);
      for (const i of rivers(m)) {
        expect(m.tiles[i].terrain).toBe('water');
        if (m.tiles[i].height > 0) found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  test('each river tile flows to a non-higher neighbour that is a river or water', () => {
    for (const seed of [1, 7, 42]) {
      const m = gen(seed);
      for (const i of rivers(m)) {
        const h = m.tiles[i].height;
        const next = nbrs(m, i).some((j) => m.tiles[j].terrain === 'water' && m.tiles[j].height <= h);
        // a river tile may also be the last tile of a basin, where no lower neighbour exists
        const basin = !nbrs(m, i).some((j) => m.tiles[j].height < h && m.tiles[j].terrain !== 'water');
        expect(next || basin).toBe(true);
      }
    }
  });

  test('rivers only sit on flat or straight inclined tiles', () => {
    for (const seed of [1, 7, 42]) {
      const m = gen(seed);
      for (const i of rivers(m)) {
        const x = i % m.width, y = (i - x) / m.width;
        expect(riverSlopeOk(m, x, y)).toBe(true);
      }
    }
  });

  test('a river never reaches the map edge', () => {
    const m = gen(7);
    for (const i of rivers(m)) {
      const x = i % m.width, y = (i - x) / m.width;
      expect(x > 0 && y > 0 && x < m.width - 1 && y < m.height - 1).toBe(true);
    }
  });

  test('deterministic per seed, and different seeds differ', () => {
    const sig = (m) => m.tiles.reduce((a, t) => a + t.height + t.terrain[0] + (t.river ? 'r' : '') + ',', '');
    expect(sig(gen(7))).toBe(sig(gen(7)));
    expect(sig(gen(7))).not.toBe(sig(gen(8)));
  });

  test('default rivers option is unchanged (no river flags)', () => {
    expect(rivers(gen(7, {})).length).toBe(0);
  });

  test('survives a save round-trip with river tiles intact', () => {
    const g = Game.create({ seed: 7, width: 64, height: 64, townCount: 4, mapgen: { rivers: 'flowing', seaLevel: 'none' } });
    const before = rivers(g.state.map);
    expect(before.length).toBeGreaterThan(0);
    const back = parseState(serializeState(g.state));
    expect(rivers(back.map)).toEqual(before);
    for (const i of before) expect(back.map.tiles[i].height).toBe(g.state.map.tiles[i].height);
  });
});

describe('density options', () => {
  test('default density is not stored; high industry density places more industries', () => {
    const base = Game.create({ seed: 5, width: 64, height: 64, townCount: 4, industryCount: 10 });
    expect(base.state.mapgen).toBeUndefined();
    const hi = Game.create({ seed: 5, width: 64, height: 64, townCount: 4, industryCount: 10, mapgen: { industryDensity: 'high' } });
    expect(hi.state.mapgen).toEqual({ industryDensity: 'high' });
    expect(hi.state.industries.length).toBeGreaterThan(base.state.industries.length);
  });
});
