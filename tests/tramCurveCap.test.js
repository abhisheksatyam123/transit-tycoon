import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { roadCurveFraction, roadCurveTargetTiles, tramCurveLimitKmh, tramCurveTargetTiles, CURVE_LIMIT_90 } from '../js/simulation/loco/trainRealistic.js';
import { KMH_TO_TILES_PER_TICK, MPH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { flatGame } from './helpers.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { setSetting } from '../js/simulation/settings.js';

const P = (pts) => pts.map(([x, y]) => ({ x, y }));
const tram = (pts, extra = {}) => ({ kind: 'road', roadType: 'tram', modelId: 'tram_electric', speed: 0, path: P(pts), pathIndex: 0, progress: 0, ...extra });

describe('tramCurveCap', () => {
  test('default is off (hash preserved)', () => {
    expect(DEFAULT_SETTINGS.tramCurveCap).toBe(false);
  });

  test('tram corner limit matches OpenTTD GetCurveSpeedLimit: 90deg=61, straight=Inf', () => {
    const vCurve = tram([[10, 10], [11, 10], [12, 10], [12, 11], [12, 12]]);
    expect(tramCurveLimitKmh(vCurve)).toBe(CURVE_LIMIT_90);
    expect(CURVE_LIMIT_90).toBe(61);
    const vStraight = tram([[10, 10], [11, 10], [12, 10], [13, 10]]);
    expect(tramCurveLimitKmh(vStraight)).toBe(Infinity);
  });

  test('tram corner target is bounded by the corner limit and by model speed', () => {
    const maxTiles = 60 * KMH_TO_TILES_PER_TICK;
    const v = tram([[10, 10], [11, 10], [12, 10], [12, 11], [12, 12]], { pathIndex: 1 });
    const t = tramCurveTargetTiles(v, maxTiles);
    expect(t).toBeLessThanOrEqual(CURVE_LIMIT_90 * KMH_TO_TILES_PER_TICK + 1e-12);
    expect(t).toBeLessThanOrEqual(maxTiles + 1e-12);
    // S-bend / straight: road fraction keeps it at model speed
    const vS = tram([[10, 10], [11, 10], [12, 10], [13, 10]], { pathIndex: 1 });
    // straight: road target is maxTiles + 1 mph (OpenLoco +1 mph term), corner limit is Inf so tram target = road target
    expect(tramCurveTargetTiles(vS, maxTiles)).toBeCloseTo(Math.max(maxTiles * roadCurveFraction(vS), 12 * MPH_TO_TILES_PER_TICK) + MPH_TO_TILES_PER_TICK, 12);
  });

  test('default path unchanged: tram uses road fraction (no corner cap)', () => {
    const v = tram([[10, 10], [11, 10], [12, 10], [12, 11], [12, 12]], { pathIndex: 1 });
    const maxTiles = 60 * KMH_TO_TILES_PER_TICK;
    expect(roadCurveTargetTiles(v, maxTiles)).toBeCloseTo(
      Math.max(maxTiles * roadCurveFraction(v), 12 * MPH_TO_TILES_PER_TICK) + MPH_TO_TILES_PER_TICK, 12);
    // 90-degree turn fraction is very-small: default target far below the 61 km/h tram cap
    expect(roadCurveTargetTiles(v, maxTiles)).toBeLessThan(CURVE_LIMIT_90 * KMH_TO_TILES_PER_TICK);
  });

  test('vehicleTick: with tramCurveCap on, a tram on a square corner is capped at 61 km/h; default is not the tram cap', () => {
    const g = flatGame();
    const state = g.state;
    state.settings = state.settings || {};
    // tram track curve: (10,20)->(12,20)->(12,22)
    g.buildTram(10, 20, 12, 20);
    g.buildTram(12, 20, 12, 22);
    const path = P([[10, 20], [11, 20], [12, 20], [12, 21], [12, 22]]);
    for (const on of [false, true]) {
      setSetting(state, 'tramCurveCap', on);
      const v = tram(path.map(p => [p.x, p.y]), {
        tx: 11, ty: 20, maxSpeed: 60 * KMH_TO_TILES_PER_TICK,
        speed: 60 * KMH_TO_TILES_PER_TICK, pathIndex: 1, orders: [], history: [], state: 'running',
      });
      const ctx = { state, emit() {}, collide: false };
      for (let t = 0; t < 60; t++) { v.pathIndex = 1; v.progress = 0; v.speed = 60 * KMH_TO_TILES_PER_TICK; vehicleTick(ctx, v); }
      if (on) expect(v.speed).toBeLessThanOrEqual(CURVE_LIMIT_90 * KMH_TO_TILES_PER_TICK + 1e-9);
      else expect(v.speed).toBeGreaterThan(0);
    }
  });
});
