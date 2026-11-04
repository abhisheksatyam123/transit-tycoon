import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { reflectMask, CORNER } from '../js/renderer/sprites/roadDiag.js';

/** Corner road tiles whose neighbour across an edge is the point-reflected corner (1-tile staircase). */
function staircaseTiles(map) {
  const { width: W, height: H, tiles } = map;
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tiles[y * W + x].road;
    if (!m || CORNER[m] === undefined) continue;
    const r = reflectMask(m);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (tiles[ny * W + nx].road === r) { n++; break; }
    }
  }
  return n;
}

describe('generated roads have no staircases', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    test(`seed ${seed}: 0 staircase tiles`, () => {
      const game = Game.create({ seed });
      expect(staircaseTiles(game.state.map)).toBe(0);
    });
  }
});
