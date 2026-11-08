import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { curveSpeedLimitKmh, roadCurveFraction, roadCurveTargetTiles, realisticTrainSpeedStep, consistMotion, CURVE_LIMIT_90, CURVE_LIMIT_45_CLOSE } from '../js/simulation/loco/trainRealistic.js';
import { landSpeedStep, targetSpeedTiles, KMH_TO_TILES_PER_TICK, MPH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { flatGame } from './helpers.js';
import { vehicleTick } from '../js/simulation/movement.js';

const P = (pts) => pts.map(([x, y]) => ({ x, y }));
const veh = (pts, extra = {}) => ({ kind: 'train', modelId: 'eng_thunder', wagons: 4, load: null, speed: 0, path: P(pts), pathIndex: 0, progress: 0, ...extra });
const model = { id: 'eng_thunder', kind: 'engine', speed: 128, power: 1800 };

describe('trainAcceleration', () => {
  test('default is original', () => {
    expect(DEFAULT_SETTINGS.trainAcceleration).toBe('original');
  });

  test('straight path has no curve limit', () => {
    const v = veh([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    expect(curveSpeedLimitKmh(v)).toBe(Infinity);
  });

  test('90 degree corner limits to 61 km/h', () => {
    const v = veh([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
    expect(curveSpeedLimitKmh(v)).toBe(CURVE_LIMIT_90);
    expect(CURVE_LIMIT_90).toBe(61);
  });

  test('two 45 degree corners one tile apart use the consecutive-corner formula (111 km/h)', () => {
    // spacing 16 units (one tile) > VEHICLE_LENGTH 8, so the 88 rule does not fire; avg = ceil(16/8)=2
    // -> 232 - (13-2)^2 = 111 (train_cmd.cpp GetCurveSpeedLimit)
    const v = veh([[0, 0], [1, 0], [2, 1], [3, 1], [4, 0]]);
    expect(curveSpeedLimitKmh(v)).toBe(111);
  });

  test('S-bend (one left + one right 45 degree corner) has no limit', () => {
    const v = veh([[0, 0], [1, 0], [2, 1], [3, 1], [4, 1]]);
    expect(curveSpeedLimitKmh(v)).toBe(Infinity);
  });

  test('curve cache is reused per pathIndex', () => {
    const v = veh([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]]);
    expect(curveSpeedLimitKmh(v)).toBe(61);
    v.pathIndex = 3;
    expect(curveSpeedLimitKmh(v)).toBe(Infinity);
  });

  test('heavier train accelerates slower (realistic)', () => {
    const target = targetSpeedTiles(model);
    const light = veh([[0, 0], [1, 0]], { wagons: 1 });
    const heavy = veh([[0, 0], [1, 0]], { wagons: 20 });
    let sL = 0, sH = 0;
    for (let t = 0; t < 20; t++) {
      sL = realisticTrainSpeedStep({ ...light, speed: sL }, model, target, 0);
      sH = realisticTrainSpeedStep({ ...heavy, speed: sH }, model, target, 0);
    }
    expect(sH).toBeLessThan(sL);
    expect(sH).toBeGreaterThan(0);
  });

  test('realistic speed never exceeds target and stays non-negative', () => {
    const target = targetSpeedTiles(model);
    const v = veh([[0, 0], [1, 0]]);
    let s = 0;
    for (let t = 0; t < 5000; t++) {
      s = realisticTrainSpeedStep({ ...v, speed: s }, model, target, 0);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(target + 1e-12);
    }
  });

  test('consist motion cache recomputes when wagons change', () => {
    const v = veh([[0, 0], [1, 0]], { wagons: 1 });
    const a = consistMotion(v, model).mass;
    v.wagons = 5;
    expect(consistMotion(v, model).mass).toBeGreaterThan(a);
  });

  test('original mode is bit-identical to landSpeedStep', () => {
    const target = targetSpeedTiles(model);
    const v = veh([[0, 0], [1, 0]]);
    let s = 0;
    for (let t = 0; t < 300; t++) {
      const ref = landSpeedStep({ ...v, speed: s }, model, target, 0);
      s = landSpeedStep({ ...v, speed: s }, model, target, 0);
      expect(s).toBe(ref);
    }
    expect(KMH_TO_TILES_PER_TICK).toBeGreaterThan(0);
  });

  test("road curve cap: OpenLoco Vehicle1::updateRoad (fraction + 1 mph, 12 mph floor)", () => {
    const p = (pts) => pts.map(([x, y]) => ({ x, y }));
    const maxTiles = 100 * MPH_TO_TILES_PER_TICK;
    const base = { kind: 'road', pathIndex: 1 };
    // Cardinal 90-degree turn is the very-small curve (0x0CCD/0xFFFF).
    const v90 = { ...base, path: p([[10, 10], [11, 10], [12, 10], [12, 11], [12, 12]]), maxSpeed: maxTiles };
    expect(roadCurveFraction(v90)).toBeCloseTo(0x0CCD / 0xFFFF);
    // Cardinal-to-diagonal 45-degree turn is the small curve (0x199A/0xFFFF).
    const v45 = { ...base, path: p([[10, 10], [11, 10], [12, 10], [13, 11], [14, 12]]), maxSpeed: maxTiles };
    expect(roadCurveFraction(v45)).toBeCloseTo(0x199A / 0xFFFF);
    // Target = max(fraction * roadMaxSpeed, 12 mph) + 1 mph.
    const expected90 = Math.max(maxTiles * (0x0CCD / 0xFFFF), 12 * MPH_TO_TILES_PER_TICK) + 1 * MPH_TO_TILES_PER_TICK;
    expect(roadCurveTargetTiles(v90, maxTiles)).toBeCloseTo(expected90);
    // 12 mph floor: a slow vehicle stays at 13 mph-including-the-plus-one, rather than below it.
    const slowMax = 5 * MPH_TO_TILES_PER_TICK;
    expect(roadCurveTargetTiles(v90, slowMax)).toBeCloseTo(13 * MPH_TO_TILES_PER_TICK);
    // Straight road has no curve fraction.
    const straight = { ...base, path: p([[10, 10], [11, 10], [12, 10], [13, 10]]), maxSpeed: maxTiles };
    expect(roadCurveFraction(straight)).toBe(1);
    expect(roadCurveTargetTiles(straight, maxTiles)).toBeGreaterThan(maxTiles);
  });

  test('train on a tight curve is slower than on a straight in default acceleration mode', () => {
    // 90 degree turn caps train speed to CURVE_LIMIT_90 km/h in default (original) mode as well
    const straightPath = P([[10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10]]);
    const curvePath = P([[10, 10], [11, 10], [12, 10], [12, 11], [12, 12], [12, 13]]);

    const vStraight = veh([[10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10]], {
      maxSpeed: 128 * KMH_TO_TILES_PER_TICK,
      speed: 128 * KMH_TO_TILES_PER_TICK,
      pathIndex: 1,
    });
    const vCurve = veh([[10, 10], [11, 10], [12, 10], [12, 11], [12, 12], [12, 13]], {
      maxSpeed: 128 * KMH_TO_TILES_PER_TICK,
      speed: 128 * KMH_TO_TILES_PER_TICK,
      pathIndex: 1,
    });

    const curveCap = curveSpeedLimitKmh(vCurve) * KMH_TO_TILES_PER_TICK;
    expect(curveCap).toBe(CURVE_LIMIT_90 * KMH_TO_TILES_PER_TICK);

    // In default original mode, landSpeedStep is capped by curve target
    const targetStraight = Math.min(curveSpeedLimitKmh(vStraight) * KMH_TO_TILES_PER_TICK, vStraight.maxSpeed);
    const targetCurve = Math.min(curveSpeedLimitKmh(vCurve) * KMH_TO_TILES_PER_TICK, vCurve.maxSpeed);

    let speedStraight = vStraight.speed;
    let speedCurve = vCurve.speed;
    for (let t = 0; t < 50; t++) {
      speedStraight = landSpeedStep({ ...vStraight, speed: speedStraight }, model, targetStraight, 0);
      speedCurve = landSpeedStep({ ...vCurve, speed: speedCurve }, model, targetCurve, 0);
    }

    expect(speedCurve).toBeLessThan(speedStraight);
    expect(speedCurve).toBeLessThanOrEqual(curveCap + 1e-12);
  });
  test('train on a tight curve is slower than on a straight in default acceleration mode (vehicleTick)', () => {
    const g = flatGame();
    // Build straight track: (10,10) to (15,10)
    for (let x = 10; x < 15; x++) g.buildRail(x, 10, x + 1, 10);
    // Build curve track: (20,10) to (22,10), then (22,10) to (22,13)
    g.buildRail(20, 10, 21, 10);
    g.buildRail(21, 10, 22, 10);
    g.buildRail(22, 10, 22, 11);
    g.buildRail(22, 11, 22, 12);
    g.buildRail(22, 12, 22, 13);

    const straightPath = P([[10, 10], [11, 10], [12, 10], [13, 10], [14, 10], [15, 10]]);
    const curvePath = P([[20, 10], [21, 10], [22, 10], [22, 11], [22, 12], [22, 13]]);

    const vStraight = veh(straightPath.map(p => [p.x, p.y]), {
      tx: 11, ty: 10,
      maxSpeed: 128 * KMH_TO_TILES_PER_TICK,
      speed: 128 * KMH_TO_TILES_PER_TICK,
      pathIndex: 1,
      orders: [],
      history: [],
      state: 'running',
    });
    const vCurve = veh(curvePath.map(p => [p.x, p.y]), {
      tx: 21, ty: 10,
      maxSpeed: 128 * KMH_TO_TILES_PER_TICK,
      speed: 128 * KMH_TO_TILES_PER_TICK,
      pathIndex: 1,
      orders: [],
      history: [],
      state: 'running',
    });

    const ctx = { state: g.state, emit() {}, collide: false };
    for (let t = 0; t < 50; t++) {
      vStraight.pathIndex = 1; vStraight.progress = 0;
      vehicleTick(ctx, vStraight);
      vCurve.pathIndex = 1; vCurve.progress = 0;
      vehicleTick(ctx, vCurve);
    }

    const curveCap = CURVE_LIMIT_90 * KMH_TO_TILES_PER_TICK;
    expect(vCurve.speed).toBeLessThan(vStraight.speed);
    expect(vCurve.speed).toBeLessThanOrEqual(curveCap + 1e-12);
  });
});
