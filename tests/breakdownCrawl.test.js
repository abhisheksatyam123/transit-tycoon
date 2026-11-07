/** Breakdown crawl (OL Vehicle1.cpp:190-197, VehicleHead.cpp:2858-2866): broken trains, road vehicles and ships keep moving at reduced speed; aircraft and UFO-frozen vehicles stop. */
import { describe, expect, test } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { vehicleBreakdownTick } from '../js/simulation/loco/vehicle.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { MPH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';

/** A train on the coal line, set up with breakdowns on. */
function coalTrain() {
  const g = flatGame();
  const { depotId } = coalLine(g);
  const eng = g.listModels('engine')[0], wag = g.listModels('wagon').find((w) => w.cargos.includes('COAL'));
  const v = g.buyVehicle(depotId, { modelId: eng.id, wagonModelId: wag.id, wagons: 1, cargoId: 'COAL' }).vehicle;
  const [a, b] = [g.state.stations[g.state.stations.length - 2], g.state.stations[g.state.stations.length - 1]];
  g.setOrders(v.id, [{ stationId: a.id, full: true }, { stationId: b.id }]);
  setSetting(g.state, 'breakdowns', 'normal');
  return { g, v };
}

/** Step until the train is moving at speed (it leaves the depot and accelerates). */
function runUntilMoving(g, v) {
  expect(g.startVehicle(v.id).ok).toBe(true);
  for (let i = 0; i < 4000 && !(v.state === 'running' && v.speed > 0); i++) g.step();
  expect(v.speed).toBeGreaterThan(0);
}

/** Force a breakdown the way the tick does: pending flag, then vehicleBreakdownTick. */
function breakDown(v) {
  v.breakdownPending = true;
  vehicleBreakdownTick(v);
  expect(v.state).toBe('broken');
}

const posOf = (v) => v.pathIndex * 1000 + v.progress;

describe('breakdown crawl', () => {
  test('a broken train keeps moving at <= maxSpeed/4 and > 0', () => {
    const { g, v } = coalTrain();
    runUntilMoving(g, v);
    breakDown(v);
    const cap = v.maxSpeed / 4;
    let moves = 0, maxSeen = 0;
    for (let i = 0; i < 2000 && v.state === 'broken'; i++) {
      const before = posOf(v);
      g.stepDays(1 / TICKS_PER_DAY);
      if (v.state !== 'broken') break;
      maxSeen = Math.max(maxSeen, v.speed);
      if (posOf(v) !== before) moves++;
    }
    expect(moves).toBeGreaterThan(0);
    expect(maxSeen).toBeGreaterThan(0);
    expect(maxSeen).toBeLessThanOrEqual(cap + 1e-9);
  });

  test('the breakdown timer is 5 days and clears, back to running', () => {
    const g = flatGame();
    const path = [];
    for (let x = 10; x < 60; x++) path.push({ x, y: 20 });
    const tr = {
      id: 9300, kind: 'train', state: 'broken', breakdownTicks: 10, maxSpeed: 1, speed: 0.2, wagons: 1,
      path, pathIndex: 0, progress: 0.5, history: [{ x: 10, y: 20 }], tx: 10, ty: 20,
      blockedTicks: 0, orders: [], orderIndex: 0, load: {}, cargo: [], breakdownPending: true,
    };
    const ctx = { state: g.state, emit: () => {} };
    for (let i = 0; i < 9; i++) vehicleTick(ctx, tr);
    expect(tr.state).toBe('broken');
    expect(tr.breakdownTicks).toBe(1);
    vehicleTick(ctx, tr);
    expect(tr.state).toBe('running');
    expect(tr.breakdownTicks).toBe(0);
  });

  test('a real 5-day breakdown clears back to running', () => {
    const { g, v } = coalTrain();
    runUntilMoving(g, v);
    breakDown(v);
    expect(v.breakdownTicks).toBe(5 * TICKS_PER_DAY);
    g.stepDays(4.9);
    if (v.state === 'broken') expect(v.breakdownTicks).toBeLessThan(0.2 * TICKS_PER_DAY);
    g.stepDays(0.2);
    expect(v.state).not.toBe('broken');
    expect(v.breakdownTicks).toBe(0);
  });

  test('a broken ship is capped at 5 mph', () => {
    const g = flatGame();
    const path = [];
    for (let x = 10; x < 40; x++) path.push({ x, y: 20 });
    const ship = {
      id: 9100, kind: 'ship', state: 'broken', breakdownTicks: 1000, maxSpeed: 1, speed: 0,
      path, pathIndex: 0, progress: 0.5, history: [{ x: 10, y: 20 }], tx: 10, ty: 20,
      blockedTicks: 0, orders: [], orderIndex: 0, load: {}, cargo: [],
    };
    const ctx = { state: g.state, emit: () => {} };
    let maxSeen = 0, ticks = 0;
    for (let i = 0; i < 200 && ship.state === 'broken'; i++) { vehicleTick(ctx, ship); ticks++; if (ship.state === 'broken') maxSeen = Math.max(maxSeen, ship.speed); }
    expect(ticks).toBeGreaterThan(50); // it crawled for a while before the synthetic path left the water
    expect(maxSeen).toBeGreaterThan(0);
    expect(maxSeen).toBeLessThanOrEqual(5 * MPH_TO_TILES_PER_TICK + 1e-12);
    expect(maxSeen).toBeLessThan(1); // well below its 1 tile/tick top speed
  });

  test('a UFO-frozen vehicle stays put while broken', () => {
    const { g, v } = coalTrain();
    runUntilMoving(g, v);
    breakDown(v);
    v.breakdownFrozen = true;
    v.speed = 0;
    const p0 = posOf(v);
    g.stepDays(0.5);
    expect(v.state).toBe('broken');
    expect(v.speed).toBe(0);
    expect(posOf(v)).toBe(p0);
  });

  test('an aircraft that breaks down still stops', () => {
    const g = flatGame();
    const ac = {
      id: 9200, kind: 'aircraft', state: 'broken', breakdownTicks: 1000, maxSpeed: 1, speed: 0.3,
      path: [{ x: 10, y: 20 }, { x: 20, y: 20 }], pathIndex: 0, progress: 0.2, history: [{ x: 10, y: 20 }],
      tx: 10, ty: 20, blockedTicks: 0, orders: [], orderIndex: 0, load: {}, alt: 1,
    };
    vehicleTick({ state: g.state, emit: () => {} }, ac);
    expect(ac.speed).toBe(0);
    expect(ac.progress).toBe(0.2);
  });

  test('save/load mid-breakdown keeps the broken state and remaining timer', () => {
    const { g, v } = coalTrain();
    runUntilMoving(g, v);
    breakDown(v);
    g.stepDays(1);
    const left = v.breakdownTicks;
    const loaded = parseState(serializeState(g.state));
    const lv = loaded.vehicles.find((x) => x.id === v.id);
    expect(lv.state).toBe('broken');
    expect(lv.breakdownTicks).toBe(left);
  });
});
