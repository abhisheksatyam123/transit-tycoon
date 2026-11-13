/**
 * D19: opt-in 8-way ship movement (`shipDiagonal`, default off). Default off keeps 4-connected routes and
 * movement; on, diagonal steps cost sqrt(2), need passable corner tiles, and never touch canal/lock/aqueduct
 * tiles. Goals stay tile goals (docks, buoys).
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { findShipPath, shipLinkOk, shipStepLen, isDiagonalStep } from '../js/simulation/shipPath.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { DIAGONAL_STEP } from '../js/simulation/loco/vehicleMotion.js';

/** 12x12 map (Game.create needs that size), all water, with the listed land tiles. Coordinates used are < 6. */
function waterMap(_unused, land = []) {
  const game = Game.create({ seed: 7, width: 12, height: 12 });
  const map = game.state.map, W = map.width;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const t = map.tiles[y * W + x];
    t.height = 0; t.rail = 0; t.road = 0; t.building = null; t.owner = null;
    t.terrain = 'water'; delete t.canal; delete t.lock; delete t.aqueduct;
  }
  for (const [x, y] of land) { const t = map.tiles[y * W + x]; t.terrain = 'grass'; t.height = 1; }
  return map;
}

const fourWay = (path) => path.every((p, i) => i === 0
  || Math.abs(p.x - path[i - 1].x) + Math.abs(p.y - path[i - 1].y) === 1);

describe('D19 ship diagonal movement (opt-in)', () => {
  test('setting defaults to off', () => {
    expect(DEFAULT_SETTINGS.shipDiagonal).toBe(false);
  });

  test('default (off) search stays 4-connected with Manhattan length', () => {
    const map = waterMap(12);
    const path = findShipPath(map, { x: 1, y: 1 }, [{ x: 4, y: 4 }]);
    expect(fourWay(path)).toBe(true);
    expect(path.length).toBe(7); // 6 steps
    const explicit = findShipPath(map, { x: 1, y: 1 }, [{ x: 4, y: 4 }], { diagonal: false });
    expect(explicit).toEqual(path);
  });

  test('on: open water takes a pure diagonal route', () => {
    const map = waterMap(12);
    const path = findShipPath(map, { x: 1, y: 1 }, [{ x: 4, y: 4 }], { diagonal: true });
    expect(path.length).toBe(4); // 3 diagonal steps
    expect(path.slice(1).every((p, i) => isDiagonalStep(path[i], p))).toBe(true);
  });

  test('on: a diagonal step is refused when a corner tile is land (no corner cutting)', () => {
    // start (1,1), goal (2,2); land at (2,1) and (1,2) block both corners of the diagonal step
    const map = waterMap(12, [[2, 1], [1, 2]]);
    const path = findShipPath(map, { x: 1, y: 1 }, [{ x: 2, y: 2 }], { diagonal: true });
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThan(2);
    expect(path.some((p, i) => i > 0 && isDiagonalStep(path[i - 1], p))).toBe(false);
  });

  test('on: a diagonal step past one land corner is also refused', () => {
    const map = waterMap(12, [[2, 1]]);
    const path = findShipPath(map, { x: 1, y: 1 }, [{ x: 2, y: 2 }], { diagonal: true });
    expect(path.length).toBeGreaterThan(2);
  });

  test('on: diagonal steps never use canal tiles', () => {
    const map = waterMap(12);
    map.tiles[2 * 12 + 2].canal = true;
    const path = findShipPath(map, { x: 1, y: 1 }, [{ x: 3, y: 3 }], { diagonal: true });
    expect(path.some((p, i) => i > 0 && isDiagonalStep(path[i - 1], p) && (
      (p.x === 2 && p.y === 2) || (path[i - 1].x === 2 && path[i - 1].y === 2)))).toBe(false);
  });

  test('step length: diagonal = sqrt(2) progress, orthogonal = 1', () => {
    const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }];
    expect(shipStepLen(path, 0)).toBe(1);
    expect(shipStepLen(path, 1)).toBe(DIAGONAL_STEP);
    expect(DIAGONAL_STEP).toBeCloseTo(Math.SQRT2, 3);
  });

  test('link check: a saved diagonal path is rejected while the setting is off', () => {
    const map = waterMap(12);
    const v = { path: [{ x: 1, y: 1 }, { x: 2, y: 2 }], pathIndex: 0 };
    expect(shipLinkOk(map, v, false)).toBe(false);
    expect(shipLinkOk(map, v, true)).toBe(true);
    expect(shipLinkOk(map, v)).toBe(true);
    const straight = { path: [{ x: 1, y: 1 }, { x: 2, y: 1 }], pathIndex: 0 };
    expect(shipLinkOk(map, straight, false)).toBe(true);
  });
});
