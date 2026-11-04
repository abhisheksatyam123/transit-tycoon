import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';

const N = 1, E = 2, S = 4, W = 8;

describe('track building', () => {
  test('straight rail line sets mutual bits on consecutive tiles', () => {
    const g = flatGame();
    const r = g.buildRail(10, 30, 14, 30);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    for (let x = 10; x <= 14; x++) {
      const bits = g.tile(x, 30).rail;
      if (x > 10) expect(bits & W).toBeTruthy();
      if (x < 14) expect(bits & E).toBeTruthy();
    }
    expect(g.tile(14, 30).rail & E).toBe(0);
    expect(g.tile(10, 30).rail & W).toBe(0);
    expect(g.tile(10, 30).road).toBe(0);
  });

  test('L-shaped line (x then y) connects corner and both legs', () => {
    const g = flatGame();
    expect(g.buildRoad(20, 30, 24, 34).ok).toBe(true);
    // corner at (24,30): connects W (back) and S (down)
    expect(g.tile(24, 30).road & W).toBeTruthy();
    expect(g.tile(24, 30).road & S).toBeTruthy();
    expect(g.tile(24, 31).road & N).toBeTruthy();
    expect(g.tile(24, 34).road & N).toBeTruthy();
    expect(g.tile(23, 30).road & E).toBeTruthy();
    expect(g.tile(20, 30).road & E).toBeTruthy();
  });

  test('water is rejected with an error', () => {
    const g = flatGame();
    g.tile(30, 30).terrain = 'water';
    const r = g.buildRail(28, 30, 32, 30);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/water/i);
  });

  test('out-of-bounds coordinates are rejected', () => {
    const g = flatGame();
    expect(g.buildRail(-1, 0, 3, 0).error).toBe('Out of map bounds');
    expect(g.buildRail(0, 0, 500, 0).error).toBe('Out of map bounds');
  });

  test('insufficient money returns Not enough money', () => {
    const g = flatGame();
    g.state.company.money = 10;
    const r = g.buildRail(4, 30, 20, 30);
    expect(r).toEqual({ ok: false, error: 'Not enough money' });
  });

  test('dryRun returns cost and leaves serialize() unchanged', () => {
    const g = flatGame();
    const before = g.serialize();
    const r = g.buildRail(4, 30, 20, 30, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.serialize()).toBe(before);
  });

  test('level crossing: straight rail over straight road is allowed', () => {
    const g = flatGame();
    expect(g.buildRail(30, 20, 36, 20).ok).toBe(true);
    const r = g.buildRoad(33, 18, 33, 22);
    expect(r.ok).toBe(true);
    expect(g.tile(33, 20).rail).toBeTruthy();
    expect(g.tile(33, 20).road).toBeTruthy();
  });

  test('level crossing: road running parallel to rail on same tile is rejected', () => {
    const g = flatGame();
    expect(g.buildRail(30, 20, 36, 20).ok).toBe(true);
    const r = g.buildRoad(31, 20, 35, 20);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/crossing|straight/i);
  });

  test('demolish removes track bits', () => {
    const g = flatGame();
    g.buildRail(10, 30, 14, 30);
    const r = g.demolish(12, 30, 12, 30);
    expect(r.ok).toBe(true);
    expect(g.tile(12, 30).rail).toBe(0);
  });
});
