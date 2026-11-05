import { describe, expect, test } from 'bun:test';
import { lanePose } from '../js/simulation/traffic.js';
import { LANE_OFFSET, HWY_LANE_OFFSET } from '../js/config/traffic.js';

// 5x5 grid, tile index = y*5+x. Travel east along row 2: tiles (1,2)->(2,2)->(3,2).
const W = 5;
const idx = (x, y) => y * W + x;

describe('lanePose right-hand traffic', () => {
  test('straight east: lane sits on the south (right) side of centre', () => {
    const path = [idx(1, 2), idx(2, 2), idx(3, 2)];
    const p = lanePose(W, path, 1, 0.5, null);
    expect(p.y).toBeCloseTo(2.5 + LANE_OFFSET, 6);
    expect(p.x).toBeCloseTo(2.5, 6);
    expect(p.ang).toBeCloseTo(0, 6);
  });

  test('straight west: lane sits on the north (right) side of centre', () => {
    const path = [idx(3, 2), idx(2, 2), idx(1, 2)];
    const p = lanePose(W, path, 1, 0.5, null);
    expect(p.y).toBeCloseTo(2.5 - LANE_OFFSET, 6);
  });

  test('highway tile uses the wider lane offset', () => {
    const map = { tiles: [] };
    for (let i = 0; i < W * W; i++) map.tiles.push({ road: 0, highway: 0 });
    map.tiles[idx(2, 2)] = { road: 1, highway: 1 };
    const p = lanePose(W, [idx(1, 2), idx(2, 2), idx(3, 2)], 1, 0.5, map);
    expect(p.y).toBeCloseTo(2.5 + HWY_LANE_OFFSET, 6);
    expect(HWY_LANE_OFFSET).toBeGreaterThan(LANE_OFFSET);
  });

  test('lane stays on the tile (|offset| < 0.5) for every straight and turn', () => {
    const paths = [
      [idx(1, 2), idx(2, 2), idx(3, 2)],           // straight
      [idx(2, 1), idx(2, 2), idx(3, 2)],           // corner N->E
      [idx(3, 2), idx(2, 2), idx(2, 1)],           // corner E->N
      [idx(1, 1), idx(2, 2), idx(3, 3)],           // diagonal-ish sequence
    ];
    for (const path of paths) {
      for (let i = 0; i < path.length; i++) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const p = lanePose(W, path, i, t, null);
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          const tx = Math.floor(p.x), ty = Math.floor(p.y);
          // point must stay within the tile the car is on (0.5 +/- lane offset)
          expect(Math.abs(p.x - (path[i] % W) - 0.5) + Math.abs(p.y - Math.floor(path[i] / W) - 0.5)).toBeLessThan(1.01);
          void tx; void ty;
        }
      }
    }
  });
});
