import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { gridElement, roadAllowedHere } from '../js/simulation/townLayout.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

const town = { x: 20, y: 20 };

describe('grid layouts (OpenTTD GetTownRoadGridElement)', () => {
  // A vertical street is N|S (bits 1|4) on columns with dx % n == 0.
  test('2x2 has street columns every 3 tiles', () => {
    const cols = [];
    for (let d = -9; d <= 9; d++) if (gridElement(town, 20 + d, 20, '2x2') & 5) cols.push(d);
    expect(cols).toEqual([-9, -6, -3, 0, 3, 6, 9]);
  });
  test('3x3 has street columns every 4 tiles', () => {
    const cols = [];
    for (let d = -8; d <= 8; d++) if (gridElement(town, 20 + d, 20, '3x3') & 5) cols.push(d);
    expect(cols).toEqual([-8, -4, 0, 4, 8]);
  });
});

describe('better roads', () => {
  test('never allows a tile beside a parallel straight road to grow the same way', () => {
    const W = 30, H = 30;
    const tiles = Array.from({ length: W * H }, () => ({ road: 0, building: null, rail: null, terrain: 'grass' }));
    const map = { width: W, height: H, tiles };
    // vertical road along x=15 (N|S)
    for (let y = 5; y < 25; y++) tiles[y * W + 15].road = 1 | 4;
    // growing south next to it at x=16 must be refused; far away it is allowed
    expect(roadAllowedHere(map, 16, 10, 4, 'better')).toBe(false);
    expect(roadAllowedHere(map, 18, 10, 4, 'better')).toBe(true);
  });
});

describe('generated towns', () => {
  test('after 365 days each town road network is one connected component', () => {
    const game = Game.create({ seed: 1 });
    game.stepDays(365);
    const { map, towns } = game.state;
    const W = map.width, H = map.height;
    const D = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
    for (const t of towns) {
      const near = (x, y) => Math.abs(x - t.x) + Math.abs(y - t.y) < 8;
      const roadTiles = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const tile = map.tiles[y * W + x];
        if (tile.road && tile.owner === 'town' && near(x, y)) roadTiles.push([x, y]);
      }
      if (!roadTiles.length) continue;
      // flood through any road from the first town tile; every town tile must be reached
      const seen = new Set([roadTiles[0].join()]);
      const stack = [roadTiles[0]];
      while (stack.length) {
        const [x, y] = stack.pop();
        const m = map.tiles[y * W + x].road;
        for (const [dx, dy, b] of D) {
          if (!(m & b)) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !map.tiles[ny * W + nx].road) continue;
          const k = nx + ',' + ny;
          if (seen.has(k)) continue;
          seen.add(k);
          stack.push([nx, ny]);
        }
      }
      const unreached = roadTiles.filter(([x, y]) => !seen.has(x + ',' + y));
      expect(unreached).toEqual([]);
    }
  }, 60000);
});
