/** Canals and locks (CN): canal build/demolish, lock validity, ship path through a lock, save/load. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { findShipPath, shipStepOk } from '../js/simulation/shipPath.js';
import { lockParts } from '../js/simulation/cmdCanal.js';

/**
 * 40x30 map. Sea (water, height 0) at x 0..5. Land at x 6..8 is height 0 (canal and lock on it), x 9.. is height 1.
 * Row y=12 is the test channel: canal at x=6, lock at x=7..9 (slope x=8 climbing east), canal x=10..20, dock at x=21.
 */
function canalGame() {
  const game = Game.create({ seed: 7, width: 40, height: 30 });
  const s = game.state;
  const W = s.map.width;
  for (let y = 0; y < s.map.height; y++) for (let x = 0; x < W; x++) {
    const t = s.map.tiles[y * W + x];
    t.height = x >= 9 ? 1 : (x >= 6 ? 0 : 0);
    t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
    delete t.canal; delete t.lock;
    if (x <= 5) t.terrain = 'water';
  }
  for (const town of s.towns) town.houses = [];
  s.company.money = 5_000_000;
  return game;
}

const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('canals', () => {
  test('build canal along a flat dry line, cost charged, demolish returns land', () => {
    const g = canalGame();
    const before = g.state.company.money;
    const r = g.buildCanal(10, 12, 20, 12);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBeLessThan(before);
    for (let x = 10; x <= 20; x++) {
      expect(tileAt(g, x, 12).terrain).toBe('water');
      expect(tileAt(g, x, 12).canal).toBe(1);
    }
    const d = g.demolish(15, 12, 15, 12);
    expect(d.ok).toBe(true);
    expect(tileAt(g, 15, 12).terrain).toBe('grass');
    expect(tileAt(g, 15, 12).canal).toBeUndefined();
    expect(tileAt(g, 14, 12).canal).toBe(1);
  });

  test('canal rejects a sloped tile and occupied tiles; dry run charges nothing', () => {
    const g = canalGame();
    tileAt(g, 12, 12).height = 2; // steep spot on the line
    const money = g.state.company.money;
    expect(g.buildCanal(10, 12, 14, 12).ok).toBe(false);
    expect(g.state.company.money).toBe(money);
    expect(g.buildCanal(17, 12, 18, 12, { dryRun: true }).ok).toBe(true);
    expect(g.state.company.money).toBe(money);
    tileAt(g, 12, 12).height = 1;
    tileAt(g, 16, 12).rail = 1;
    expect(g.buildCanal(16, 12, 16, 12).ok).toBe(false);
  });

  test('lock: rejects flat ground and a wrong slope, accepts a straight single-step slope', () => {
    const g = canalGame();
    // flat land at x=12 (height 1): not a slope
    expect(g.buildLock(12, 12).ok).toBe(false);
    // two-level step: tile 8 corners [0,2,2,0] cannot be a lock
    tileAt(g, 9, 12).height = 2; tileAt(g, 9, 13).height = 2;
    expect(g.buildLock(8, 12).ok).toBe(false);
    tileAt(g, 9, 12).height = 1; tileAt(g, 9, 13).height = 1;
    // corner (diagonal) slope rejected
    tileAt(g, 9, 13).height = 0;
    expect(g.buildLock(8, 12).ok).toBe(false);
    tileAt(g, 9, 13).height = 1;
    // the real slope: accepted, three tiles, lock dir east (bit 2)
    const r = g.buildLock(8, 12);
    expect(r.ok).toBe(true);
    expect(r.dir).toBe(2);
    expect(tileAt(g, 7, 12).lock).toEqual({ dir: 2, part: 'lower' });
    expect(tileAt(g, 8, 12).lock).toEqual({ dir: 2, part: 'middle' });
    expect(tileAt(g, 9, 12).lock).toEqual({ dir: 2, part: 'upper' });
    expect(lockParts(g.state.map, 9, 12)).toEqual([{ x: 7, y: 12 }, { x: 8, y: 12 }, { x: 9, y: 12 }]);
  });

  test('ships path from sea through a canal and lock to an inland dock; not without the lock', () => {
    const g = canalGame();
    expect(g.buildCanal(6, 12, 6, 12).ok).toBe(true);
    expect(g.buildCanal(10, 12, 20, 12).ok).toBe(true);
    expect(g.buildDock(21, 12).ok).toBe(true);
    const map = g.state.map;
    // no lock yet: x=7..9 is land, so no water route
    expect(findShipPath(map, { x: 3, y: 12 }, [{ x: 20, y: 12 }])).toBeNull();
    expect(g.buildLock(8, 12).ok).toBe(true);
    const path = findShipPath(map, { x: 3, y: 12 }, [{ x: 20, y: 12 }]);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 20, y: 12 });
    expect(path.some((p) => p.x === 8 && p.y === 12)).toBe(true);
    // the step from the canal at height 0 into the upper canal (height 1) only passes through the lock
    const W = map.width;
    expect(shipStepOk(map, 6 + 12 * W, 7 + 12 * W)).toBe(true);
    expect(shipStepOk(map, 9 + 12 * W, 10 + 12 * W)).toBe(true);
    expect(shipStepOk(map, 6 + 12 * W, 9 + 12 * W)).toBe(false);
    // demolish the lock: route gone again
    expect(g.demolish(8, 12, 8, 12).ok).toBe(true);
    for (const x of [7, 8, 9]) expect(tileAt(g, x, 12).lock).toBeUndefined();
    expect(findShipPath(map, { x: 3, y: 12 }, [{ x: 20, y: 12 }])).toBeNull();
  });

  test('save/load round-trip keeps canal and lock tiles and the route', () => {
    const g = canalGame();
    g.buildCanal(6, 12, 6, 12); g.buildCanal(10, 12, 20, 12); g.buildDock(21, 12); g.buildLock(8, 12);
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(g2.serialize()).toBe(json);
    expect(tileAt(g2, 8, 12).lock).toEqual({ dir: 2, part: 'middle' });
    expect(tileAt(g2, 14, 12).canal).toBe(1);
    expect(findShipPath(g2.state.map, { x: 3, y: 12 }, [{ x: 20, y: 12 }])).not.toBeNull();
  });

  test('old saves without canal fields load and are unaffected', () => {
    const g = canalGame();
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(tileAt(g2, 14, 12).canal).toBeUndefined();
    expect(tileAt(g2, 14, 12).lock).toBeUndefined();
    expect(shipStepOk(g2.state.map, 6 + 12 * 40, 9 + 12 * 40)).toBe(true); // both plain water, no canal: old rule
  });
});
