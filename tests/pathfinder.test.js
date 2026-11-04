import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { findPath } from '../js/simulation/pathfinder.js';
import { createMap } from '../js/simulation/map.js';

describe('pathfinder', () => {
  test('finds a path along built rail between two stations', () => {
    const g = flatGame();
    coalLine(g);
    const p = findPath(g.state.map, { x: 10, y: 24 }, [{ x: 40, y: 24 }], 'rail');
    expect(p).not.toBeNull();
    expect(p[0]).toEqual({ x: 10, y: 24 });
    expect(p[p.length - 1]).toEqual({ x: 40, y: 24 });
    for (let i = 1; i < p.length; i++) {
      const d = Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y);
      expect(d).toBe(1);
    }
  });

  test('returns null when destination is disconnected', () => {
    const g = flatGame();
    coalLine(g);
    expect(findPath(g.state.map, { x: 10, y: 24 }, [{ x: 40, y: 30 }], 'rail')).toBeNull();
  });

  test('returns null for empty goal list', () => {
    const g = flatGame();
    expect(findPath(g.state.map, { x: 10, y: 24 }, [], 'rail')).toBeNull();
  });

  test('start equal to goal returns single-tile path', () => {
    const g = flatGame();
    expect(findPath(g.state.map, { x: 5, y: 5 }, [{ x: 5, y: 5 }], 'rail')).toEqual([{ x: 5, y: 5 }]);
  });

  test('128x128 map, long straight line: resolves in under 50 ms', () => {
    const g = flatGame();
    const map = createMap(128, 128);
    for (let x = 0; x < 128; x++) {
      const t = map.tiles[64 * 128 + x];
      t.rail = (x > 0 ? 8 : 0) | (x < 127 ? 2 : 0);
    }
    const t0 = performance.now();
    const p = findPath(map, { x: 0, y: 64 }, [{ x: 127, y: 64 }], 'rail');
    const dt = performance.now() - t0;
    expect(p).not.toBeNull();
    expect(p.length).toBe(128);
    expect(dt).toBeLessThan(50);
  });
});
