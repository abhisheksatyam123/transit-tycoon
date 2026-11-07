import { test, expect, describe } from 'bun:test';
import { computeBarred, refreshBarred, isLevelCrossing, levelCrossingsOn } from '../js/simulation/levelCrossing.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { flatGame } from './helpers.js';

const W = 12;
/** 12x12 flat map: east-west road on y=5 with a rail crossing at (5,5) (road E|W = 10, rail N|S = 5). */
function fakeState(on) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].road = 10;
  for (let y = 0; y < W; y++) tiles[y * W + 5].rail = 5;
  tiles[5 * W + 5].road = 10; tiles[5 * W + 5].rail = 5;
  const st = { map: { width: W, height: W, tiles }, settings: { levelCrossings: on }, vehicles: [], tick: 0 };
  return st;
}
const busAt = (x, path) => ({ id: 1, kind: 'road', roadType: 'bus', state: 'running', speed: 0.5, maxSpeed: 0.5,
  progress: 0, tx: x, ty: 5, path: path.map((px) => ({ x: px, y: 5 })), pathIndex: 0,
  history: [{ x, y: 5 }, { x: x - 1, y: 5 }, { x: x - 2, y: 5 }], orders: [], orderIndex: 0 });
const trainAt = (x, y, path) => ({ id: 9, kind: 'train', state: 'running', speed: 0.5, maxSpeed: 0.5, wagons: 1,
  progress: 0, tx: x, ty: y, path, pathIndex: 0, history: [{ x, y }], orders: [], orderIndex: 0 });

describe('level crossings', () => {
  test('default off and tile predicate', () => {
    expect(DEFAULT_SETTINGS.levelCrossings).toBe(false);
    expect(levelCrossingsOn({ settings: {} })).toBe(false);
    expect(isLevelCrossing({ road: 10, rail: 5 })).toBe(true);
    expect(isLevelCrossing({ road: 10 })).toBe(false);
    expect(isLevelCrossing({ road: 10, rail: 5, gradeSep: 1 })).toBe(false);
    expect(isLevelCrossing({ road: 10, rail: 5, tunnel: 1 })).toBe(false);
  });

  test('off: nothing is barred and ctx.barred stays null', () => {
    const st = fakeState(false);
    st.vehicles = [trainAt(5, 5, [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }])];
    expect(computeBarred(st)).toBe(null);
    const ctx = { state: st, emit: () => {} };
    refreshBarred(ctx, st);
    expect(ctx.barred).toBe(null);
  });

  test('barred while a train is on the crossing or 1-2 tiles ahead, not otherwise', () => {
    const st = fakeState(true);
    const path = [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }];
    const t = trainAt(5, 2, path);
    st.vehicles = [t];
    const key = 5 * W + 5;
    expect(computeBarred(st).has(key)).toBe(false); // 3 tiles away
    t.pathIndex = 1; t.tx = 5; t.ty = 3; t.history = [{ x: 5, y: 3 }]; // next tile (5,4)->(5,5): crossing is 2 ahead
    expect(computeBarred(st).has(key)).toBe(true);
    t.pathIndex = 2; t.tx = 5; t.ty = 4; t.history = [{ x: 5, y: 4 }]; // next tile is the crossing
    expect(computeBarred(st).has(key)).toBe(true);
    t.pathIndex = 3; t.tx = 5; t.ty = 5; t.history = [{ x: 5, y: 5 }]; // on the crossing
    expect(computeBarred(st).has(key)).toBe(true);
    t.pathIndex = 4; t.tx = 5; t.ty = 6; t.history = [{ x: 5, y: 6 }]; // past it
    expect(computeBarred(st).has(key)).toBe(false);
  });

  test('refreshBarred reports a crossing that closed this tick', () => {
    const st = fakeState(true);
    const t = trainAt(5, 4, [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }]);
    st.vehicles = [t];
    const ctx = { state: st, emit: () => {} };
    refreshBarred(ctx, st);
    expect(ctx.barred.size).toBe(1);
    expect(ctx.barredNew).toBe(null); // first tick: nothing "closed" yet
    st.vehicles = [];
    refreshBarred(ctx, st);
    expect(ctx.barred.size).toBe(0);
    st.vehicles = [t];
    refreshBarred(ctx, st);
    expect(ctx.barredNew).toEqual([5 * W + 5]);
  });

  test('road vehicle waits before a barred crossing, then proceeds once the train has passed', () => {
    const st = fakeState(true);
    const bus = busAt(3, [3, 4, 5, 6, 7]);
    const train = trainAt(5, 2, [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }]);
    st.vehicles = [bus, train];
    const ctx = { state: st, emit: () => {}, occupancy: null };
    // the train is on the crossing: bus must stop short of x=5
    st.tick = 1;
    train.pathIndex = 3; train.tx = 5; train.ty = 5; train.history = [{ x: 5, y: 5 }];
    ctx.barred = computeBarred(st);
    for (let i = 0; i < 100; i++) vehicleTick(ctx, bus);
    expect(bus.tx).toBeLessThan(5);
    // train gone: the crossing opens and the bus crosses
    st.vehicles = [bus];
    ctx.barred = computeBarred(st);
    for (let i = 0; i < 100 && bus.tx < 7; i++) vehicleTick(ctx, bus);
    expect(bus.tx).toBeGreaterThanOrEqual(6);
  });

  test('off: road vehicle is not held by a crossing', () => {
    const st = fakeState(false);
    const bus = busAt(3, [3, 4, 5, 6, 7]);
    const train = trainAt(5, 5, [{ x: 5, y: 5 }]);
    st.vehicles = [bus, train];
    const ctx = { state: st, emit: () => {}, occupancy: null };
    ctx.barred = computeBarred(st);
    for (let i = 0; i < 100 && bus.tx < 7; i++) vehicleTick(ctx, bus);
    expect(bus.tx).toBeGreaterThanOrEqual(6);
  });

  test('setSetting toggles the gate on a real game', () => {
    const g = flatGame(3);
    setSetting(g.state, 'levelCrossings', true);
    expect(levelCrossingsOn(g.state)).toBe(true);
    expect(computeBarred(g.state).size).toBe(0);
  });
});
