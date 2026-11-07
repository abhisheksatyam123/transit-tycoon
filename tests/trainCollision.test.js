import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { tick } from '../js/simulation/loco/vehicleManager.js';
import { beginOccupancy } from '../js/simulation/blocking.js';
import { trainEnters } from '../js/simulation/trainCollision.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
const KMH = (k) => k * KMH_TO_TILES_PER_TICK;

const W = 12;
/** 12x12 map, rail along row y=5 only (no signals): a single unsignalled line. */
function fakeState(on) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].rail = 5;
  return { map: { width: W, height: W, tiles }, settings: on === undefined ? {} : { vehicleCollisions: on }, vehicles: [], tick: 0, news: [], date: { day: 1, month: 0, year: 1950 } };
}
/** Train on row 5 heading east (dx=1) or west (dx=-1), head on tile x, with `pass` passengers. */
function train(id, x, dx, pass = 0, progress = 0) {
  const path = [];
  for (let i = -2; i <= 3; i++) path.push({ x: x + i * dx, y: 5 });
  const head = { x, y: 5 };
  return { id, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(40), wagons: 1, progress,
    tx: x, ty: 5, path, pathIndex: 2, history: [head, { x: x - dx, y: 5 }, { x: x - 2 * dx, y: 5 }], orders: [], orderIndex: 0,
    cargoId: 'PASS', load: { amount: pass } };
}
function runTick(st) {
  const events = [];
  const game = { state: st, ctx: { state: st, emit: (n, e) => events.push([n, e]), rng: null }, rng: { next: () => 0.5 } };
  tick(game);
  return events;
}

describe('trainCollision (vehicleCollisions on: head-on crash)', () => {
  test('default still off', () => {
    expect(DEFAULT_SETTINGS.vehicleCollisions).toBe(false);
  });

  test('on: two trains meeting head-on on one tile are both destroyed with one news item', () => {
    const st = fakeState(true);
    // A heads east from x=4 to 5; B heads west from x=6 to 5: both enter tile (5,5) in the same tick.
    const a = train(1, 4, 1, 30, 0.99), b = train(2, 6, -1, 12, 0.99);
    // Each train's head starts on tile x: move A's head to 4 and B's to 6 (history already has them).
    st.vehicles = [a, b];
    st.news = [];
    const events = runTick(st);
    expect(st.vehicles.length).toBe(0);
    expect(a.wrecked).toBe(true);
    expect(b.wrecked).toBe(true);
    const crash = events.find(([n]) => n === 'crash');
    expect(crash[1]).toEqual({ x: 5, y: 5, victims: 42 });
    const news = events.filter(([n, e]) => n === 'news' && /Train crash! 42 die in collision/.test(e.text));
    expect(news.length).toBe(1);
  });

  test('off: head-on trains pass through each other (today\'s behaviour)', () => {
    const st = fakeState(false);
    const a = train(1, 4, 1, 30, 0.99), b = train(2, 6, -1, 12, 0.99);
    st.vehicles = [a, b];
    const events = runTick(st);
    expect(st.vehicles.length).toBe(2);
    expect(events.some(([n]) => n === 'crash')).toBe(false);
    expect(st.news.length).toBe(0);
  });

  test('on: same-direction following at blocking distance never crashes', () => {
    const st = fakeState(true);
    // Leader at x=7 moving east, follower behind at x=5 moving east, follower approaching the leader's old tile.
    const lead = train(1, 7, 1, 0, 0), follow = train(2, 4, 1, 10, 0.99);
    st.vehicles = [lead, follow];
    const events = runTick(st);
    expect(st.vehicles.length).toBe(2);
    expect(events.some(([n]) => n === 'crash')).toBe(false);
  });

  test('on: a train loading in a station is not crashed by an oncoming train', () => {
    const st = fakeState(true);
    const a = train(1, 4, 1, 30, 0), b = train(2, 5, -1, 0, 0);
    b.state = 'loading'; // parked in a station: never part of the head-on check
    st.vehicles = [a, b];
    const ctx = { state: st, emit: () => {}, occupancy: beginOccupancy(st), news: [] };
    trainEnters(ctx, a, 5, 5);
    expect(b.wrecked).toBeUndefined();
    expect(a.wrecked).toBeUndefined();
  });

  test('on: both wrecks are removed from state.vehicles after the loop', () => {
    const st = fakeState(true);
    st.vehicles = [train(1, 4, 1, 0, 0.99), train(2, 6, -1, 0, 0.99)];
    runTick(st);
    expect(st.vehicles.length).toBe(0);
  });

  test('setSetting toggles collisions live', () => {
    const st = fakeState(false);
    setSetting(st, 'vehicleCollisions', true);
    expect(st.settings.vehicleCollisions).toBe(true);
  });
});
