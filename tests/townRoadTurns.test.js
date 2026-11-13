import { test, expect, describe } from 'bun:test';
import { findRoadPath } from '../js/simulation/townRoads.js';
import { Game } from '../js/simulation/game.js';

// minimal open-grass map: only the fields findRoadPath / stepCost / passable read
function grassMap(W, H) {
  const tiles = [];
  for (let i = 0; i < W * H; i++) {
    tiles.push({ terrain: 'grass', height: 0, road: false, building: null, rail: false });
  }
  return { width: W, height: H, tiles };
}

const key = (p) => p.y * 1000 + p.x;
const dirOf = (a, b) => [b.x - a.x, b.y - a.y];

describe('findRoadPath turns flag (D22)', () => {
  test('(a) turns=false keeps the straight-line result (source to goal on one row)', () => {
    const map = grassMap(5, 4);
    const path = findRoadPath(map, [{ x: 0, y: 0 }], new Set([0 * 5 + 3]), { x: 3, y: 0 }, () => true, 2, false);
    expect(path).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
  });

  test('(a2) turns=false cannot reach a diagonal goal (old bug: only straight lines)', () => {
    const map = grassMap(4, 4);
    const path = findRoadPath(map, [{ x: 0, y: 0 }], new Set([3 * 4 + 3]), { x: 3, y: 3 });
    expect(path).toBe(null);
    expect(findRoadPath(map, [{ x: 0, y: 0 }], new Set([3 * 4 + 3]), { x: 3, y: 3 }, () => true, 2, false)).toBe(null);
  });

  test('(b) turns=true finds an L-shaped path (0,0) -> (3,3) that contains a turn and ends at the goal', () => {
    const map = grassMap(4, 4);
    const path = findRoadPath(map, [{ x: 0, y: 0 }], new Set([3 * 4 + 3]), { x: 3, y: 3 }, () => true, 2, true);
    expect(path).not.toBe(null);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 3, y: 3 });
    let turns = 0;
    for (let k = 1; k + 1 < path.length; k++) {
      const a = dirOf(path[k - 1], path[k]), b = dirOf(path[k], path[k + 1]);
      if (a[0] !== b[0] || a[1] !== b[1]) turns++;
    }
    expect(turns).toBeGreaterThanOrEqual(1);
  });

  test('(c) consecutive path tiles are 4-adjacent (turns=true, several geometries)', () => {
    const map = grassMap(6, 6);
    const cases = [
      [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      [{ x: 0, y: 5 }, { x: 5, y: 0 }],
      [{ x: 2, y: 1 }, { x: 4, y: 4 }],
    ];
    for (const [s, g] of cases) {
      const path = findRoadPath(map, [s], new Set([g.y * 6 + g.x]), g, () => true, 2, true);
      expect(path).not.toBe(null);
      expect(path[path.length - 1]).toEqual(g);
      for (let k = 1; k < path.length; k++) {
        expect(Math.abs(path[k].x - path[k - 1].x) + Math.abs(path[k].y - path[k - 1].y)).toBe(1);
      }
    }
  });

  test('(d) the path never reverses and every bend follows at least minRun=2 straight steps', () => {
    const map = grassMap(7, 7);
    const path = findRoadPath(map, [{ x: 0, y: 0 }], new Set([6 * 7 + 6]), { x: 6, y: 6 }, () => true, 2, true);
    expect(path).not.toBe(null);
    const dirs = [];
    for (let k = 1; k < path.length; k++) dirs.push(dirOf(path[k - 1], path[k]));
    let run = 0;
    for (let k = 0; k < dirs.length; k++) {
      if (k > 0) {
        const [px, py] = dirs[k - 1], [cx, cy] = dirs[k];
        expect(px === -cx && py === -cy).toBe(false);        // no reversal
        if (px !== cx || py !== cy) {                          // a bend: previous leg must be >= 2 steps
          expect(run).toBeGreaterThanOrEqual(2);
          run = 1;
          continue;
        }
      }
      run++;
    }
    expect(key(path[path.length - 1])).toBe(key({ x: 6, y: 6 }));
  });
});

describe('townRoadTurns at generation', () => {
  test('the opt-in is applied before world generation (more road tiles, same towns)', () => {
    const off = Game.create({ seed: 3, width: 96, height: 96, townCount: 8, settings: { townRoadTurns: false } });
    const on = Game.create({ seed: 3, width: 96, height: 96, townCount: 8, settings: { townRoadTurns: true } });
    expect(on.state.settings.townRoadTurns).toBe(true);
    const roads = (g) => g.state.map.tiles.filter((t) => t.road).length;
    expect(on.state.towns.length).toBe(off.state.towns.length);
    expect(roads(on)).toBeGreaterThan(roads(off));
  }, 60000);
});
