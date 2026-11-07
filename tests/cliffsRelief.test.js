/** Cliffs option: 'on' must produce real steep steps (>= CLIFF_STEP) and rock; 'off' stays gentle. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { CLIFF_STEP, CLIFF_SLOPE_CAP } from '../js/simulation/map.js';

function stats(cliffs) {
  let maxd = 0, steep = 0, rock = 0;
  for (const seed of [1, 2, 3]) {
    const m = Game.create({ seed, mapgen: { cliffs } }).state.map;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const t = m.tiles[y * m.width + x];
      if (t.terrain === 'rock') rock++;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= m.width || ny >= m.height) continue;
        const d = Math.abs(m.tiles[ny * m.width + nx].height - t.height);
        maxd = Math.max(maxd, d);
        if (d >= CLIFF_STEP) steep++;
      }
    }
  }
  return { maxd, steep, rock };
}

describe('cliffs option on the 96x96 generator', () => {
  test('cliffs on makes steep steps and rock; off does not', () => {
    const off = stats('off'), on = stats('on');
    expect(off.steep).toBe(0);
    expect(on.steep).toBeGreaterThan(0);
    expect(on.maxd).toBeLessThanOrEqual(CLIFF_SLOPE_CAP);
    expect(on.rock).toBeGreaterThan(off.rock);
  });
});
