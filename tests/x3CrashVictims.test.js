import { test, expect, describe } from 'bun:test';
import { tick } from '../js/simulation/loco/vehicleManager.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
// X3: train crash victims = 2 driver victims per crashed consist + passengers on board (OpenTTD train_cmd.cpp:3209-3239).
const KMH = (k) => k * KMH_TO_TILES_PER_TICK;

const W = 12;
function fakeState() {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].rail = 5;
  return { map: { width: W, height: W, tiles }, settings: { vehicleCollisions: true }, vehicles: [], tick: 0, news: [], date: { day: 1, month: 0, year: 1950 } };
}
/** Train on row 5 heading east (dx=1) or west (dx=-1), head on tile x, with `pass` passengers on board. */
function train(id, x, dx, pass = 0, progress = 0.99) {
  const path = [];
  for (let i = -2; i <= 3; i++) path.push({ x: x + i * dx, y: 5 });
  return { id, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(40), wagons: 1, progress,
    tx: x, ty: 5, path, pathIndex: 2, history: [{ x, y: 5 }, { x: x - dx, y: 5 }, { x: x - 2 * dx, y: 5 }], orders: [], orderIndex: 0,
    cargoId: 'PASS', load: { amount: pass } };
}
function runTick(st) {
  const events = [];
  const game = { state: st, ctx: { state: st, emit: (n, e) => events.push([n, e]), rng: null }, rng: { next: () => 0.5 } };
  tick(game);
  return events;
}
/** Head-on crash on (5,5) between a (eastbound, pa passengers) and b (westbound, pb). Returns crash event + news. */
function headOn(pa, pb) {
  const st = fakeState();
  st.vehicles = [train(1, 4, 1, pa), train(2, 6, -1, pb)];
  const events = runTick(st);
  const crash = events.find(([n]) => n === 'crash');
  const news = events.filter(([n]) => n === 'news').map(([, e]) => e.text);
  return { st, crash: crash && crash[1], news };
}
const newsCount = (texts) => {
  const m = texts.map((t) => /Train crash! (\d+) die/.exec(t)).filter(Boolean);
  return m.length === 1 ? Number(m[0][1]) : NaN;
};

describe('X3 train crash victims (driver term)', () => {
  test('two empty trains crash -> 4 victims (2 per train), news says 4', () => {
    const { st, crash, news } = headOn(0, 0);
    expect(st.vehicles.length).toBe(0);
    expect(crash.victims).toBe(4);
    expect(newsCount(news)).toBe(4);
  });

  test('one loaded train with N passengers (vs empty train) -> N + 2 + 2', () => {
    const N = 17;
    const { crash, news } = headOn(N, 0);
    expect(crash.victims).toBe(N + 4);
    expect(newsCount(news)).toBe(N + 4);
  });

  test('head-on sums both consists: (pa + 2) + (pb + 2)', () => {
    const { crash, news } = headOn(7, 9);
    expect(crash.victims).toBe(7 + 9 + 4);
    expect(newsCount(news)).toBe(20);
  });

  test('event payload victims equals the news count', () => {
    for (const [pa, pb] of [[0, 0], [30, 12], [1, 0], [0, 25]]) {
      const { crash, news } = headOn(pa, pb);
      expect(crash.victims).toBe(newsCount(news));
      expect(crash.victims).toBe(pa + pb + 4);
    }
  });

  test('a single crash posts exactly one news item', () => {
    const { news } = headOn(3, 3);
    expect(news.filter((t) => /Train crash!/.test(t)).length).toBe(1);
  });
});
