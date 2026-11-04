import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { diagPath, arcPath, circlePath, pathOk } from '../js/simulation/shapes.js';

const N = 1, E = 2, S = 4, W = 8;
const key = (p) => p.x + ',' + p.y;
const has2x2 = (p) => {
  const s = new Set(p.map(key));
  return p.some((q) => s.has(key({ x: q.x + 1, y: q.y })) && s.has(key({ x: q.x, y: q.y + 1 })) && s.has(key({ x: q.x + 1, y: q.y + 1 })));
};
const noDup = (p) => new Set(p.map(key)).size === p.length;

describe('shapes geometry', () => {
  const cases = [[0, 0, 5, 3], [0, 0, -4, 6], [0, 0, 6, 2], [3, 3, 3, 7], [0, 0, 4, 4], [0, 0, 7, 5], [0, 0, -6, -6]];
  for (const [x0, y0, x1, y1] of cases) {
    test(`diagPath/arcPath ${x0},${y0}->${x1},${y1}: 4-connected, no dups, no 2x2, ends correct`, () => {
      for (const p of [diagPath(x0, y0, x1, y1), arcPath(x0, y0, x1, y1)]) {
        expect(pathOk(p)).toBe(true);
        expect(noDup(p)).toBe(true);
        expect(has2x2(p)).toBe(false);
        expect(p[0]).toEqual({ x: x0, y: y0 });
        expect(p[p.length - 1]).toEqual({ x: x1, y: y1 });
      }
    });
  }

  test('diagPath is a pure 45-degree staircase then straight', () => {
    const p = diagPath(0, 0, 9, 5); // 5 diagonal steps then 4 straight
    expect(p.length - 1).toBe(9 + 5);
    // first 10 moves alternate x and y
    for (let i = 1; i <= 10; i++) {
      const dx = Math.abs(p[i].x - p[i - 1].x), dy = Math.abs(p[i].y - p[i - 1].y);
      expect(dx + dy).toBe(1);
      if (i > 1) expect(dx === 1).toBe(!(Math.abs(p[i - 1].x - p[i - 2].x) === 1));
    }
    expect(p[p.length - 1]).toEqual({ x: 9, y: 5 });
  });

  test('arcPath is curved (not an L): middle tile is off both straight legs', () => {
    const p = arcPath(0, 0, 9, 5);
    const mid = p[Math.floor(p.length / 2)];
    expect(mid.x > 0 && mid.y > 0 && mid.x < 9 && mid.y < 5).toBe(true);
  });

  for (const r of [2, 3, 4, 6, 10]) {
    test(`circlePath r=${r}: closed ring, degree 2, no 2x2, no dups`, () => {
      const p = circlePath(20, 20, r);
      expect(pathOk(p, true)).toBe(true);
      expect(noDup(p)).toBe(true);
      expect(has2x2(p)).toBe(false);
      const idx = new Map(p.map((q, i) => [key(q), i]));
      for (const q of p) {
        const deg = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => idx.has(key({ x: q.x + dx, y: q.y + dy }))).length;
        expect(deg).toBe(2);
      }
    });
  }

  test('pathOk rejects gaps and loops that do not close', () => {
    expect(pathOk([{ x: 0, y: 0 }, { x: 2, y: 0 }])).toBe(false);
    expect(pathOk([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], true)).toBe(true);
    expect(pathOk([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }], true)).toBe(false);
  });
});

describe('buildRoadPath / buildRailPath', () => {
  test('diagonal road path builds mutual bits, costs > 0 on dryRun without mutation', () => {
    const g = flatGame();
    const path = diagPath(10, 16, 14, 20);
    const before = JSON.stringify(g.state.map.tiles.map((t) => t.road));
    const dry = g.buildRoadPath(path, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBeGreaterThan(0);
    expect(JSON.stringify(g.state.map.tiles.map((t) => t.road))).toBe(before);
    expect(g.buildRoadPath(path).ok).toBe(true);
    for (let i = 0; i < path.length; i++) {
      const bits = g.tile(path[i].x, path[i].y).road;
      let want = 0;
      if (i > 0) want |= bitTo(path[i], path[i - 1]);
      if (i < path.length - 1) want |= bitTo(path[i], path[i + 1]);
      expect(bits).toBe(want);
    }
  });

  test('circle road ring: every tile has exactly its two ring-neighbour bits', () => {
    const g = flatGame();
    const ring = circlePath(30, 24, 4);
    const r = g.buildRoadPath(ring, { loop: true });
    expect(r.ok).toBe(true);
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const prev = ring[(i + n - 1) % n], next = ring[(i + 1) % n];
      const want = bitTo(ring[i], prev) | bitTo(ring[i], next);
      expect(g.tile(ring[i].x, ring[i].y).road).toBe(want);
    }
  });

  test('circle rail ring builds and dryRun does not mutate', () => {
    const g = flatGame();
    const ring = circlePath(30, 24, 3);
    const dry = g.buildRailPath(ring, { loop: true, dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBeGreaterThan(0);
    expect(g.tile(30, 24 - 3).rail).toBe(0);
    expect(g.buildRailPath(ring, { loop: true }).ok).toBe(true);
    expect(g.tile(30, 21).rail).toBe(E | W);
  });

  test('bad path is rejected', () => {
    const g = flatGame();
    const r = g.buildRoadPath([{ x: 10, y: 20 }, { x: 13, y: 20 }]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Bad path');
  });
});

function bitTo(a, b) {
  if (b.x === a.x + 1) return E;
  if (b.x === a.x - 1) return W;
  if (b.y === a.y + 1) return S;
  if (b.y === a.y - 1) return N;
  throw new Error('not adjacent');
}
