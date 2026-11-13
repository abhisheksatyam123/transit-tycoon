// D12: opt-in train crash victim options. trainCrashRandomVictims: each crashed consist loses RandomRange(pass+1)
// passengers (OpenTTD Vehicle::Crash) instead of its full load. trainCrashRoadNewsCount: the level-crossing road
// vehicle news counts the victims (driver +1 and passengers). Both need vehicleCollisions; both default off.
import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { tick } from '../js/simulation/loco/vehicleManager.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';

const KMH = (k) => k * KMH_TO_TILES_PER_TICK;
const W = 12;

/** Rail along row 5 (train crossing), road on row 5 for the level-crossing case handled separately. */
function fakeState(settings, rngState = 12345) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].rail = 5;
  return { map: { width: W, height: W, tiles }, settings, vehicles: [], tick: 0, news: [], rngState, date: { day: 1, month: 0, year: 1950 } };
}
function train(id, x, dx, pass) {
  const path = [];
  for (let i = -2; i <= 3; i++) path.push({ x: x + i * dx, y: 5 });
  return { id, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(40), wagons: 1, progress: 0.99,
    tx: x, ty: 5, path, pathIndex: 2, history: [{ x, y: 5 }, { x: x - dx, y: 5 }, { x: x - 2 * dx, y: 5 }], orders: [], orderIndex: 0,
    cargoId: 'PASS', load: { amount: pass } };
}
function headOn(settings, pa, pb, rngState) {
  const st = fakeState(settings, rngState);
  st.vehicles = [train(1, 4, 1, pa), train(2, 6, -1, pb)];
  const events = [];
  const game = { state: st, ctx: { state: st, emit: (n, e) => events.push([n, e]), rng: null }, rng: { next: () => 0.5 } };
  tick(game);
  const crash = events.find(([n]) => n === 'crash');
  return { crash: crash && crash[1], news: events.filter(([n]) => n === 'news').map(([, e]) => e.text) };
}
const on = (extra = {}) => ({ vehicleCollisions: true, ...extra });

describe('D12 settings', () => {
  test('both new settings default off and have exactly one SETTING_META entry', () => {
    for (const k of ['trainCrashRandomVictims', 'trainCrashRoadNewsCount']) {
      expect(DEFAULT_SETTINGS[k]).toBe(false);
      expect(SETTING_META.filter((m) => m.key === k).length).toBe(1);
    }
  });
});

describe('D12 trainCrashRandomVictims', () => {
  test('off (default): full load dies, no change: 30 + 12 + 4', () => {
    const { crash } = headOn(on(), 30, 12);
    expect(crash.victims).toBe(46);
  });

  test('on: each consist loses a random 0..pass, victims in [4, 4 + pa + pb]', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const { crash, news } = headOn(on({ trainCrashRandomVictims: true }), 30, 12, seed * 7919);
      expect(crash.victims).toBeGreaterThanOrEqual(4);
      expect(crash.victims).toBeLessThanOrEqual(46);
      expect(news.filter((t) => /Train crash!/.test(t)).length).toBe(1);
      expect(news.find((t) => /Train crash!/.test(t))).toContain(`${crash.victims} die`);
      seen.add(crash.victims);
    }
    expect(seen.size).toBeGreaterThan(5); // it is a draw, not a fixed value
  });

  test('on: the same rngState gives the same victims', () => {
    const a = headOn(on({ trainCrashRandomVictims: true }), 30, 12, 999).crash.victims;
    const b = headOn(on({ trainCrashRandomVictims: true }), 30, 12, 999).crash.victims;
    expect(a).toBe(b);
  });

  test('on: empty trains draw nothing extra (4 victims)', () => {
    const { crash } = headOn(on({ trainCrashRandomVictims: true }), 0, 0, 5);
    expect(crash.victims).toBe(4);
  });
});

describe('D12 trainCrashRoadNewsCount (level crossing)', () => {
  // road vehicle on the crossing at (5,5): reuse the vehicleCollisions crossing layout
  function crossingState(settings) {
    const st = fakeState(settings);
    const tiles = st.map.tiles;
    for (let x = 0; x < W; x++) tiles[5 * W + x].road = 10;
    tiles[5 * W + 5].road = 10; tiles[5 * W + 5].rail = 5;
    for (let y = 0; y < W; y++) tiles[y * W + 5].rail = 5;
    return st;
  }
  const bus = { id: 1, kind: 'road', roadType: 'bus', modelId: 'bus_city', state: 'running', speed: KMH(40), maxSpeed: KMH(40),
    progress: 0, tx: 5, ty: 5, path: [{ x: 5, y: 5 }, { x: 6, y: 5 }], pathIndex: 0, history: [{ x: 5, y: 5 }, { x: 4, y: 5 }],
    orders: [], orderIndex: 0, cargoId: 'PASS', load: { amount: 20 } };
  const tr = { id: 9, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(40), wagons: 1, progress: 0.99,
    tx: 5, ty: 4, path: [{ x: 5, y: 4 }, { x: 5, y: 5 }, { x: 5, y: 6 }], pathIndex: 0, history: [{ x: 5, y: 4 }], orders: [], orderIndex: 0 };
  function run(settings) {
    const st = crossingState(settings);
    const b = { ...bus, load: { amount: 20 } };
    st.vehicles = [{ ...tr }, b];
    const events = [];
    const game = { state: st, ctx: { state: st, emit: (n, e) => events.push([n, e]), rng: null }, rng: { next: () => 0.5 } };
    tick(game);
    const crash = events.find(([n]) => n === 'crash');
    const news = events.filter(([n]) => n === 'news').map(([, e]) => e.text);
    return { crash: crash && crash[1], news };
  }

  test('off (default): fixed text and victims = passengers (20)', () => {
    const { crash, news } = run({ levelCrossings: true, vehicleCollisions: true });
    expect(crash.victims).toBe(20);
    expect(news.some((t) => t === 'Road vehicle destroyed in collision with train')).toBe(true);
  });

  test('on: victims = driver 1 + 20 passengers, news shows the count', () => {
    const { crash, news } = run({ levelCrossings: true, vehicleCollisions: true, trainCrashRoadNewsCount: true });
    expect(crash.victims).toBe(21);
    expect(news.some((t) => t === 'Road vehicle destroyed in collision with train, 21 die')).toBe(true);
  });
});
