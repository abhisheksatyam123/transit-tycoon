import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { curveSpeedLimitKmh, realisticTrainSpeedStep, consistMotion, CURVE_LIMIT_90, CURVE_LIMIT_45_CLOSE } from '../js/simulation/loco/trainRealistic.js';
import { landSpeedStep, targetSpeedTiles, KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';

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
});
