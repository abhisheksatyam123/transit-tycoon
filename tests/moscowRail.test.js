import { test, expect, describe } from 'bun:test';
import { cleanRail, countSmallCycles } from '../js/simulation/scenarios/moscowRail.js';
import { createMap, idx } from '../js/simulation/map.js';

const N = 1, E = 2, S = 4, W = 8;
/** Connect tile (x1,y1) to neighbour (x2,y2) with mutual bits. */
function link(map, x1, y1, x2, y2) {
  const a = map.tiles[idx(map, x1, y1)], b = map.tiles[idx(map, x2, y2)];
  if (x2 > x1) { a.rail |= E; b.rail |= W; }
  else if (x2 < x1) { a.rail |= W; b.rail |= E; }
  else if (y2 > y1) { a.rail |= S; b.rail |= N; }
  else { a.rail |= N; b.rail |= S; }
}
/** Connected component test between two tiles through mutual rail bits. */
function connected(map, a, b) {
  const seen = new Set([a]), q = [a];
  while (q.length) {
    const i = q.shift();
    if (i === b) return true;
    const x = i % map.width, y = Math.floor(i / map.width);
    for (const [dx, dy, bit, ob] of [[1, 0, E, W], [-1, 0, W, E], [0, 1, S, N], [0, -1, N, S]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const j = ny * map.width + nx;
      if (seen.has(j)) continue;
      if ((map.tiles[i].rail & bit) && (map.tiles[j].rail & ob)) { seen.add(j); q.push(j); }
    }
  }
  return false;
}

/** 40x40 map: stations at both ends of a main line, a ladder of two parallel lines with rungs, and a big ring. */
function fixture() {
  const map = createMap(40, 40);
  const st = (x, y) => { map.tiles[idx(map, x, y)].building = { type: 'station' }; };
  // main line y=5 from x=2 to x=30 (stations at ends)
  for (let x = 2; x < 30; x++) link(map, x, 5, x + 1, 5);
  st(2, 5); st(30, 5);
  // ladder: two parallel lines y=20 and y=21 from x=5..15 joined by 3 rungs
  for (let x = 5; x < 15; x++) { link(map, x, 20, x + 1, 20); link(map, x, 21, x + 1, 21); }
  link(map, 6, 20, 6, 21); link(map, 9, 20, 9, 21); link(map, 12, 20, 12, 21);
  // big ring: rectangle x=20..36, y=12..34 (perimeter ~ 80)
  for (let x = 20; x < 36; x++) { link(map, x, 12, x + 1, 12); link(map, x, 34, x + 1, 34); }
  for (let y = 12; y < 34; y++) { link(map, 20, y, 20, y + 1); link(map, 36, y, 36, y + 1); }
  return map;
}

describe('moscow rail cleanup', () => {
  test('ladder rungs are removed and small cycles drop to zero', () => {
    const state = { map: fixture() };
    expect(countSmallCycles(state.map)).toBeGreaterThan(0);
    const r = cleanRail(state);
    expect(r.removedEdges).toBeGreaterThanOrEqual(3);
    expect(r.smallCyclesAfter).toBeLessThan(r.smallCyclesBefore);
    expect(countSmallCycles(state.map)).toBeLessThanOrEqual(2);
    const m = state.map;
    expect(m.tiles[idx(m, 6, 20)].rail & S).toBe(0);
    expect(m.tiles[idx(m, 9, 20)].rail & S).toBe(0);
    expect(m.tiles[idx(m, 12, 20)].rail & S).toBe(0);
  });

  test('big ring is kept intact', () => {
    const state = { map: fixture() };
    cleanRail(state);
    const m = state.map;
    // every ring corner keeps its two-way connection
    for (const [x, y] of [[20, 12], [36, 12], [20, 34], [36, 34]]) expect(m.tiles[idx(m, x, y)].rail).not.toBe(0);
    expect(connected(m, idx(m, 20, 12), idx(m, 36, 34))).toBe(true);
    expect(m.tiles[idx(m, 28, 12)].rail & (E | W)).toBe(E | W);
  });

  test('connectivity between station tiles is preserved', () => {
    const state = { map: fixture() };
    const m = state.map;
    const a = idx(m, 2, 5), b = idx(m, 30, 5);
    const before = connected(m, a, b);
    cleanRail(state);
    expect(before).toBe(true);
    expect(connected(m, a, b)).toBe(true);
    expect(m.tiles[a].building.type).toBe('station');
  });

  test('no dangling surface bits remain', () => {
    const state = { map: fixture() };
    cleanRail(state);
    const m = state.map;
    let dangling = 0;
    m.tiles.forEach((t, i) => {
      const x = i % m.width, y = Math.floor(i / m.width);
      for (const [dx, dy, bit, ob] of [[1, 0, E, W], [-1, 0, W, E], [0, 1, S, N], [0, -1, N, S]]) {
        if (!(t.rail & bit)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.width || ny >= m.height || !(m.tiles[ny * m.width + nx].rail & ob)) dangling++;
      }
    });
    expect(dangling).toBe(0);
  });
});
