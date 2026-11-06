// T34: map generator options (terrain / sea level / rivers / smoothness). Defaults must reproduce the classic map.
import { test, expect, describe } from 'bun:test';
import { createMap, generateTerrain } from '../js/simulation/map.js';
import { makeRng } from '../js/simulation/rng.js';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const SIZE = 96;
function gen(seed, opts) {
  const m = createMap(SIZE, SIZE);
  generateTerrain(m, makeRng(seed), opts);
  return m;
}
const count = (m, pred) => m.tiles.reduce((a, t) => a + (pred(t) ? 1 : 0), 0);
const sig = (m) => m.tiles.reduce((a, t) => a + t.height + t.terrain[0] + ',', '');
const digest = (s) => new Bun.CryptoHasher('sha256').update(s).digest('hex').slice(0, 16);

describe('defaults', () => {
  // Hashes captured before T34 (historic generator): default options must still reproduce them.
  const GOLDEN = { 1: '23ddba52c54170b7', 7: '44f4f6d9adf7a61e', 42: '215d371071af6b4f', 1234: '5a466ca3a00ac66f', abc: 'b8ca433982117c64' };
  for (const [seed, hash] of Object.entries(GOLDEN)) {
    test(`seed ${seed} default output is unchanged`, () => {
      const s = seed === 'abc' ? 'abc' : Number(seed);
      expect(digest(sig(gen(s, {})))).toBe(hash);
      expect(digest(sig(gen(s, { seaLevel: 'medium', terrain: 'normal', smoothness: 'normal', rivers: 'none' })))).toBe(hash);
    });
  }
});

describe('options', () => {
  test('flat: most tiles at height 0..2', () => {
    const m = gen(7, { terrain: 'flat' });
    const low = count(m, (t) => t.height <= 2) / m.tiles.length;
    expect(low).toBeGreaterThan(0.9);
    expect(Math.max(...m.tiles.map((t) => t.height))).toBeLessThanOrEqual(7);
  });
  test('mountainous has more high tiles than normal', () => {
    const hi = (m) => count(m, (t) => t.height >= 5);
    expect(hi(gen(7, { terrain: 'mountainous' }))).toBeGreaterThan(hi(gen(7, {})));
  });
  test('sea none: no water tiles', () => {
    expect(count(gen(7, { seaLevel: 'none' }), (t) => t.terrain === 'water')).toBe(0);
  });
  test('sea high has more water than low', () => {
    const w = (sl) => count(gen(7, { seaLevel: sl }), (t) => t.terrain === 'water');
    expect(w('high')).toBeGreaterThan(w('medium'));
    expect(w('medium')).toBeGreaterThan(w('low'));
  });
  test('smooth and rough both produce valid heights', () => {
    for (const sm of ['smooth', 'rough']) {
      const m = gen(7, { smoothness: sm });
      for (const t of m.tiles) expect(t.height >= 0 && t.height <= 7).toBe(true);
    }
  });
  test('rivers: water tiles at height 0 and every river reaches water or the edge, never uphill', () => {
    const m = gen(7, { seaLevel: 'none', rivers: 'many' });
    const W = m.width, H = m.height;
    const water = count(m, (t) => t.terrain === 'water');
    expect(water).toBeGreaterThan(0);
    for (const t of m.tiles) if (t.terrain === 'water') expect(t.height).toBe(0);
    // Rivers end at the map edge or in a basin lake (OpenTTD). Water not connected to the edge must be
    // a few small basin lakes, one per river at most, never a long orphan network.
    const seen = new Uint8Array(W * H);
    const stack = [];
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = (i - x) / W;
      if (m.tiles[i].terrain === 'water' && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { seen[i] = 1; stack.push(i); }
    }
    const flood = (start) => {
      const comp = [start]; seen[start] = 1; const st = [start];
      while (st.length) {
        const i = st.pop(); const x = i % W, y = (i - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!seen[j] && m.tiles[j].terrain === 'water') { seen[j] = 1; st.push(j); comp.push(j); }
        }
      }
      return comp;
    };
    while (stack.length) flood(stack.pop());
    const orphans = [];
    for (let i = 0; i < W * H; i++) if (m.tiles[i].terrain === 'water' && !seen[i]) orphans.push(flood(i));
    expect(orphans.length).toBeLessThanOrEqual(6);
    for (const c of orphans) expect(c.length).toBeLessThan(80);
  });
  test('rivers none gives the same map as default', () => {
    expect(sig(gen(3, { rivers: 'none' }))).toBe(sig(gen(3, {})));
  });
});

describe('save/load and Game.create', () => {
  test('default game stores no mapgen state', () => {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4 });
    expect(g.state.mapgen).toBeUndefined();
  });
  test('non-default options are stored, generated and survive save/load', () => {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4, mapgen: { terrain: 'flat', seaLevel: 'none', rivers: 'few', smoothness: 'smooth' } });
    expect(g.state.mapgen).toEqual({ terrain: 'flat', seaLevel: 'none', rivers: 'few', smoothness: 'smooth' });
    const back = parseState(serializeState(g.state));
    expect(back.mapgen).toEqual(g.state.mapgen);
  });
  test('explicit default values are not stored', () => {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4, mapgen: { terrain: 'normal', seaLevel: 'medium', rivers: 'none', smoothness: 'normal' } });
    expect(g.state.mapgen).toBeUndefined();
  });
});
