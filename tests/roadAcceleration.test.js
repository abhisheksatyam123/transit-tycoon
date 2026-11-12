/**
 * roadAcceleration (opt-in): default 'original' is the untouched landSpeedStep path; 'realistic' ports the
 * OpenTTD road-vehicle power / tractive-effort / drag model with the full loaded weight (roadRealistic.js).
 */
import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { landSpeedStep, targetSpeedTiles, KMH_TO_TILES_PER_TICK, ROAD_WEIGHT } from '../js/simulation/loco/vehicleMotion.js';
import { realisticRoadSpeedStep, roadMotion, roadAccelerationCapTiles, roadCardinalStep, roadReversing, ROLLING_ROAD, ROLLING_TRAM } from '../js/simulation/loco/roadRealistic.js';
import { vehicleModel } from '../js/simulation/vehicles.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { linkTiles } from '../js/simulation/network.js';

const BUS = { id: 'bus_modern', kind: 'bus', speed: 112, capacity: 45 };
const kmh = (tiles) => tiles / KMH_TO_TILES_PER_TICK;

/** Fake flat world: an east-west two-way road of `n` tiles on row y=1, one running road vehicle. */
function straightWorld(n, { setting = 'original', load = { amount: 45 }, modelId = 'bus_modern', maxSpeedKmh = 112, state = 'running', orders = [], speedKmh = 0 } = {}) {
  const W = n + 2, H = 4, tiles = [];
  for (let i = 0; i < W * H; i++) tiles.push({ height: 0 });
  const map = { width: W, height: H, tiles };
  for (let x = 0; x < n - 1; x++) linkTiles(map, 'road', x, 1, x + 1, 1);
  const path = [];
  for (let x = 0; x < n; x++) path.push({ x, y: 1 });
  const v = {
    id: 1, kind: 'road', roadType: 'bus', modelId, state, speed: speedKmh * KMH_TO_TILES_PER_TICK,
    maxSpeed: maxSpeedKmh * KMH_TO_TILES_PER_TICK, tx: 0, ty: 1, path, pathIndex: 0, progress: 0,
    history: [{ x: 0, y: 1 }], load, orders, orderIndex: 0, breakdownTicks: 100000, breakdownFrozen: false,
  };
  const st = { map, settings: { roadAcceleration: setting }, vehicles: [v] };
  return { st, v, ctx: { state: st, occupancy: null } };
}

const run = (ctx, v, ticks) => { for (let i = 0; i < ticks; i++) vehicleTick(ctx, v); };

describe('roadAcceleration setting', () => {
  test('default is original, exactly one SETTING_META entry in the vehicles group', () => {
    expect(DEFAULT_SETTINGS.roadAcceleration).toBe('original');
    const hits = SETTING_META.filter((m) => m.key === 'roadAcceleration');
    expect(hits.length).toBe(1);
    expect(hits[0].group).toBe('vehicles');
    expect(hits[0].type).toBe('select');
    expect(hits[0].options.map((o) => o[0])).toEqual(['original', 'realistic']);
  });

  test('original mode is bit-identical to the old landSpeedStep path', () => {
    const { st, v, ctx } = straightWorld(400, { setting: 'original' });
    const model = vehicleModel(v);
    // straight road: the curve cap never lowers maxSpeed, so the old path is landSpeedStep at v.maxSpeed
    let ref = 0;
    v.speed = 0;
    for (let i = 0; i < 120; i++) {
      ref = landSpeedStep({ ...v, speed: ref }, model, v.maxSpeed, 0);
      run(ctx, v, 1);
      expect(v.speed).toBe(ref);
    }
    expect(st.settings.roadAcceleration).toBe('original');
  });

  test('original loaded bus still stalls far below rated speed', () => {
    const { v, ctx } = straightWorld(400, { setting: 'original' });
    run(ctx, v, 400);
    expect(kmh(v.speed)).toBeLessThan(20);
  });
});

describe('roadAcceleration realistic', () => {
  test('loaded bus reaches its rated speed (module; no cap)', () => {
    const v = { kind: 'road', roadType: 'bus', modelId: 'bus_modern', load: { amount: BUS.capacity }, speed: 0 };
    const target = targetSpeedTiles(BUS);
    let s = 0;
    for (let i = 0; i < 500; i++) s = realisticRoadSpeedStep({ ...v, speed: s }, BUS, target, 0);
    expect(kmh(s)).toBeGreaterThan(112 * 0.98);
    expect(kmh(s)).toBeLessThanOrEqual(112 + 1e-9);
  });

  test('loaded and empty both reach the rated cap; loaded is finally not slower than the original stall', () => {
    const target = targetSpeedTiles(BUS);
    const runStep = (load) => {
      const v = { kind: 'road', roadType: 'bus', modelId: 'bus_modern', load, speed: 0 };
      let s = 0;
      for (let i = 0; i < 500; i++) s = realisticRoadSpeedStep({ ...v, speed: s }, BUS, target, 0);
      return s;
    };
    const empty = runStep(null), full = runStep({ amount: BUS.capacity });
    expect(kmh(empty)).toBeCloseTo(112, 6);
    expect(kmh(full)).toBeCloseTo(112, 6);
  });

  test('realistic entry ramp is power dependent (loaded accelerates slower than empty)', () => {
    const target = targetSpeedTiles(BUS);
    const step = (load) => {
      const v = { kind: 'road', roadType: 'bus', modelId: 'bus_modern', load, speed: 0 };
      let s = 0;
      for (let i = 0; i < 60; i++) s = realisticRoadSpeedStep({ ...v, speed: s }, BUS, target, 0);
      return s;
    };
    expect(step({ amount: BUS.capacity })).toBeLessThan(step(null));
  });

  test('tram uses the tram rolling constant, buses the road one', () => {
    const bus = { kind: 'road', roadType: 'bus', modelId: 'bus_modern', load: null, speed: 0 };
    const tram = { kind: 'road', roadType: 'tram', modelId: 'tram_electric', load: null, speed: 0 };
    expect(roadMotion(bus, BUS).rolling).toBe(ROLLING_ROAD);
    expect(roadMotion(tram, { id: 'tram_electric', kind: 'tram', speed: 60, capacity: 40 }).rolling).toBe(ROLLING_TRAM);
  });

  test('OpenTTD caps: 75 % cardinal, 100 % diagonal, 50 % reverse', () => {
    const v = { maxSpeed: 112 * KMH_TO_TILES_PER_TICK };
    expect(roadAccelerationCapTiles(v, false, true)).toBeCloseTo(v.maxSpeed * 0.75, 12);
    expect(roadAccelerationCapTiles(v, false, false)).toBeCloseTo(v.maxSpeed, 12);
    expect(roadAccelerationCapTiles(v, true, true)).toBeCloseTo(v.maxSpeed * 0.5, 12);
  });

  test('cardinal / reverse step detection', () => {
    const cardinal = { path: [{ x: 1, y: 1 }, { x: 2, y: 1 }], pathIndex: 0, history: [{ x: 1, y: 1 }] };
    const diagonal = { path: [{ x: 1, y: 1 }, { x: 2, y: 2 }], pathIndex: 0, history: [{ x: 1, y: 1 }] };
    expect(roadCardinalStep(cardinal)).toBe(true);
    expect(roadCardinalStep(diagonal)).toBe(false);
    const back = { path: [{ x: 1, y: 1 }, { x: 0, y: 1 }], pathIndex: 0, history: [{ x: 1, y: 1 }, { x: 0, y: 1 }] };
    expect(roadReversing(back)).toBe(true);
    expect(roadReversing(cardinal)).toBe(false);
  });

  test('integration: realistic loaded bus reaches 75 % of rated speed on a cardinal road', () => {
    const { v, ctx } = straightWorld(400, { setting: 'realistic' });
    run(ctx, v, 500);
    expect(kmh(v.speed)).toBeCloseTo(84, 2); // 112 * 3/4 (OpenTTD cardinal cap)
  });

  test('integration: broken cap still applies in realistic mode', () => {
    const { v, ctx } = straightWorld(400, { setting: 'realistic', state: 'broken' });
    run(ctx, v, 300);
    expect(kmh(v.speed)).toBeLessThanOrEqual(112 / 4 + 1e-9);
  });

  test('integration: order max speed still caps realistic mode', () => {
    const { v, ctx } = straightWorld(400, { setting: 'realistic', orders: [{ maxSpeed: 40 }] });
    run(ctx, v, 300);
    expect(kmh(v.speed)).toBeLessThanOrEqual(40 + 1e-9);
    expect(kmh(v.speed)).toBeGreaterThan(30);
  });

  test('power derivation targets 1.25x rated speed at full load', () => {
    const v = { kind: 'road', roadType: 'bus', modelId: 'bus_modern', load: { amount: BUS.capacity }, speed: 0 };
    const c = roadMotion(v, BUS);
    // at the design terminal speed force == resistance, i.e. the derived power supports 1.25 * 112 km/h
    const vTerm = 112 * 1.25;
    const air = c.airCoef * vTerm * vTerm;
    const rolling = c.mass * c.rolling * (128 + vTerm) / 128;
    const force = c.power * 18 / (vTerm * 5);
    expect(force).toBeCloseTo(c.axle + rolling + air, 4);
    expect(ROAD_WEIGHT).toBe(12);
  });

  test('realistic acceleration only engages when the setting is on', () => {
    const on = straightWorld(80, { setting: 'realistic' });
    const off = straightWorld(80, { setting: 'original' });
    run(on.ctx, on.v, 40);
    run(off.ctx, off.v, 40);
    expect(on.v.roadMotionCache).toBeDefined();
    expect(off.v.roadMotionCache).toBeUndefined(); // original path never touches the realistic cache
  });
});
