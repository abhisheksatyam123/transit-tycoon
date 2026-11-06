/** Whole-map screenshot plan (pure): zoom and size choice so the map fits the image cap. */
import { test, expect, describe } from 'bun:test';
import { giantShotPlan, GIANT_MAX_SIDE } from '../js/renderer/giantShot.js';

describe('giant screenshot plan', () => {
  test('small map renders at zoom 1', () => {
    const p = giantShotPlan({ mapW: 64, mapH: 64, maxHeight: 4 });
    expect(p.zoom).toBe(1);
    expect(p.width).toBeGreaterThan(0);
    expect(p.width).toBeLessThanOrEqual(GIANT_MAX_SIDE);
  });

  test('Moscow-sized map is scaled down to fit the cap', () => {
    const p = giantShotPlan({ mapW: 457, mapH: 663, maxHeight: 8 });
    expect(p.zoom).toBeLessThan(1);
    expect(p.zoom).toBeGreaterThan(0.1);
    expect(p.width).toBeLessThanOrEqual(GIANT_MAX_SIDE);
    expect(p.height).toBeLessThanOrEqual(GIANT_MAX_SIDE);
    // the widest side should use most of the cap (not wasteful)
    expect(Math.max(p.width, p.height)).toBeGreaterThan(GIANT_MAX_SIDE * 0.9);
  });

  test('bigger maps never get a larger zoom', () => {
    const a = giantShotPlan({ mapW: 200, mapH: 200 });
    const b = giantShotPlan({ mapW: 400, mapH: 400 });
    expect(b.zoom).toBeLessThanOrEqual(a.zoom);
  });

  test('custom cap is honoured and the origin is above/left of the map', () => {
    const p = giantShotPlan({ mapW: 300, mapH: 300, maxSide: 1000 });
    expect(p.width).toBeLessThanOrEqual(1000);
    expect(p.height).toBeLessThanOrEqual(1000);
    expect(p.originX).toBeLessThan(0);
    expect(p.originY).toBeLessThan(0);
  });

  test('zoom is a multiple of 0.01 and positive', () => {
    const p = giantShotPlan({ mapW: 457, mapH: 663, maxHeight: 8 });
    expect(Math.abs(p.zoom * 100 - Math.round(p.zoom * 100))).toBeLessThan(1e-9);
  });
});
