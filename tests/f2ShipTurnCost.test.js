/**
 * F2: opt-in ship turn/curve cost (OpenTTD yapf_ship curve90 penalty) on the 4-connected water grid.
 * Default off must keep the historical unit-cost routes exactly; on must prefer straighter routes when the
 * tile count is equal, and must keep canals, locks and aqueduct decks routable. No diagonal moves.
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { findShipPath, shipPassable, SHIP_CURVE90_COST } from '../js/simulation/shipPath.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';

const turns = (path) => {
  let n = 0;
  for (let i = 2; i < path.length; i++) {
    const ax = path[i - 1].x - path[i - 2].x, ay = path[i - 1].y - path[i - 2].y;
    const bx = path[i].x - path[i - 1].x, by = path[i].y - path[i - 1].y;
    if (ax !== bx || ay !== by) n++;
  }
  return n;
};

/** Cost of following `path` when a 90-degree turn costs SHIP_CURVE90_COST. */
const pathCost = (path) => path.length - 1 + turns(path) * SHIP_CURVE90_COST;

/** Every step must be an orthogonal single-tile move (4-connected, even with the option on). */
const isFourConnected = (path) => path.every((p, i) => i === 0
  || (Math.abs(p.x - path[i - 1].x) + Math.abs(p.y - path[i - 1].y) === 1));

/**
 * 12x12 all-water map with a deterministic 28% scatter of land (same LCG as the F2 probe). With start (2,2)
 * and goal (8,8), the historical A* picks a 13-tile staircase with 6 turns; a 13-tile route with 2 turns
 * exists, so turn cost changes the route without changing the tile count.
 */
function mazeMap() {
  const game = Game.create({ seed: 7, width: 12, height: 12 });
  const map = game.state.map, W = map.width;
  let r = 1;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const t = map.tiles[y * W + x];
    t.height = 0; t.rail = 0; t.road = 0; t.building = null; t.owner = null;
    t.terrain = 'water'; delete t.canal; delete t.lock; delete t.aqueduct;
    r = (r * 1103515245 + 12345) & 0x7fffffff;
    if ((r >> 8) % 100 < 28 && !(x === 2 && y === 2) && !(x === 8 && y === 8)) {
      t.terrain = 'grass'; t.height = 1;
    }
  }
  return map;
}

// Historical (default) route on mazeMap, captured before the option existed: proves default routing is unchanged.
const BASELINE = [
  { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 3 },
  { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 7 },
  { x: 7, y: 7 }, { x: 7, y: 8 }, { x: 8, y: 8 },
];

describe('F2 ship turn cost', () => {
  test('default off (and explicit off) returns exactly the old route', () => {
    expect(DEFAULT_SETTINGS.shipTurnCost).toBe(false);
    const map = mazeMap();
    const off = findShipPath(map, { x: 2, y: 2 }, [{ x: 8, y: 8 }]);
    const explicitOff = findShipPath(map, { x: 2, y: 2 }, [{ x: 8, y: 8 }], { turnCost: false });
    expect(off).toEqual(BASELINE);
    expect(explicitOff).toEqual(BASELINE);
    expect(turns(off)).toBe(6); // the old route is a staircase
    expect(isFourConnected(off)).toBe(true);
  });

  test('on prefers fewer turns at equal tile length', () => {
    expect(SHIP_CURVE90_COST).toBe(6); // OpenTTD ship_curve90_penalty 6 x YAPF_TILE_LENGTH
    const map = mazeMap();
    const off = findShipPath(map, { x: 2, y: 2 }, [{ x: 8, y: 8 }]);
    const on = findShipPath(map, { x: 2, y: 2 }, [{ x: 8, y: 8 }], { turnCost: true });
    expect(on).not.toBeNull();
    expect(on.length).toBe(off.length); // same tile count
    expect(turns(on)).toBe(2);
    expect(turns(on)).toBeLessThan(turns(off));
    expect(pathCost(on)).toBeLessThan(pathCost(off)); // 12 + 2*6 vs 12 + 6*6
    expect(pathCost(on)).toBe(24);
    expect(isFourConnected(on)).toBe(true);
    for (const p of on) expect(shipPassable(map, p.y * map.width + p.x)).toBe(true);
  });

  test('on never adds diagonal moves or changes a straight route', () => {
    const game = Game.create({ seed: 7, width: 12, height: 12 });
    const map = game.state.map, W = map.width;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const t = map.tiles[y * W + x];
      t.height = 0; t.rail = 0; t.road = 0; t.building = null; t.owner = null;
      t.terrain = 'water'; delete t.canal; delete t.lock; delete t.aqueduct;
    }
    const straight = findShipPath(map, { x: 2, y: 2 }, [{ x: 8, y: 2 }], { turnCost: true });
    expect(straight).not.toBeNull();
    expect(straight).toHaveLength(7);
    expect(turns(straight)).toBe(0);
    expect(isFourConnected(straight)).toBe(true);
  });

  test('canal and lock route stays reachable with turn cost on', () => {
    const game = Game.create({ seed: 7, width: 40, height: 30 });
    const s = game.state, W = s.map.width;
    for (let y = 0; y < s.map.height; y++) for (let x = 0; x < W; x++) {
      const t = s.map.tiles[y * W + x];
      t.height = x >= 9 ? 1 : 0;
      t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
      delete t.canal; delete t.lock; delete t.aqueduct;
      if (x <= 5) t.terrain = 'water';
    }
    for (const town of s.towns) town.houses = [];
    s.company.money = 5_000_000;
    expect(game.buildCanal(6, 12, 6, 12).ok).toBe(true);
    expect(game.buildCanal(10, 12, 20, 12).ok).toBe(true);
    expect(game.buildLock(8, 12).ok).toBe(true);
    const path = findShipPath(s.map, { x: 3, y: 12 }, [{ x: 20, y: 12 }], { turnCost: true });
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 20, y: 12 });
    expect(path.some((p) => p.x === 8 && p.y === 12)).toBe(true); // through the lock
    expect(isFourConnected(path)).toBe(true);
  });

  test('aqueduct deck route stays reachable with turn cost on', () => {
    const game = Game.create({ seed: 7, width: 40, height: 30 });
    const s = game.state, W = s.map.width;
    const H = { 6: 2, 7: 2, 8: 1, 9: 2, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 2, 16: 1 };
    for (let y = 0; y < s.map.height; y++) for (let x = 0; x < W; x++) {
      const t = s.map.tiles[y * W + x];
      t.height = x in H ? H[x] : (x >= 17 ? 1 : 0);
      t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
      delete t.canal; delete t.lock; delete t.aqueduct;
      if (x <= 5) t.terrain = 'water';
    }
    for (const town of s.towns) town.houses = [];
    s.company.money = 5_000_000;
    for (let x = 6; x <= 7; x++) {
      const t = s.map.tiles[12 * W + x];
      t.terrain = 'water'; t.height = 2; t.canal = 1;
    }
    for (let x = 16; x <= 20; x++) {
      const t = s.map.tiles[12 * W + x];
      t.terrain = 'water'; t.height = 1; t.canal = 1;
    }
    expect(game.buildCanal(8, 12, 15, 12).ok).toBe(true);
    const path = findShipPath(s.map, { x: 7, y: 12 }, [{ x: 20, y: 12 }], { turnCost: true });
    expect(path).not.toBeNull();
    const xs = path.map((p) => p.x);
    for (let x = 9; x <= 14; x++) expect(xs).toContain(x); // over the deck
    expect(isFourConnected(path)).toBe(true);
  });
});
