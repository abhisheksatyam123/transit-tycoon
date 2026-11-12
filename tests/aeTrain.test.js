// AE train opt-ins and crash fixes: trainCrashStationRating (OpenTTD ModifyStationRatingAround -160, radius 30)
// and the owner check in trainCollision.trainEnters (OpenTTD train_cmd.cpp ~3296-3300: no crash across owners).
import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { tick } from '../js/simulation/loco/vehicleManager.js';
import { beginOccupancy } from '../js/simulation/blocking.js';
import { trainEnters } from '../js/simulation/trainCollision.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
const KMH = (k) => k * KMH_TO_TILES_PER_TICK;

const W = 12;
/** 12x12 map, one unsignalled rail line on row y=5 (same layout as trainCollision.test.js). */
function fakeState(on, extra = {}) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].rail = 5;
  const settings = on === undefined ? {} : { vehicleCollisions: on };
  return { map: { width: W, height: W, tiles }, settings, vehicles: [], stations: [], tick: 0, news: [], date: { day: 1, month: 0, year: 1950 }, ...extra };
}
function train(id, x, dx, owner, pass = 0, progress = 0) {
  const path = [];
  for (let i = -2; i <= 3; i++) path.push({ x: x + i * dx, y: 5 });
  const head = { x, y: 5 };
  const t = { id, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(40), wagons: 1, progress,
    tx: x, ty: 5, path, pathIndex: 2, history: [head, { x: x - dx, y: 5 }, { x: x - 2 * dx, y: 5 }], orders: [], orderIndex: 0,
    cargoId: 'PASS', load: { amount: pass } };
  if (owner !== undefined) t.ownerId = owner;
  return t;
}
function runTick(st) {
  const events = [];
  const game = { state: st, ctx: { state: st, emit: (n, e) => events.push([n, e]), rng: null }, rng: { next: () => 0.5 } };
  tick(game);
  return events;
}
/** Head-on pair on tile (5,5): A heads east from 4, B heads west from 6. */
function headOn(st, ownerA, ownerB) {
  const a = train(1, 4, 1, ownerA, 0, 0.99), b = train(2, 6, -1, ownerB, 0, 0.99);
  st.vehicles = [a, b];
  return { a, b };
}

describe('trainCrashStationRating: settings', () => {
  test('default is false', () => {
    expect(DEFAULT_SETTINGS.trainCrashStationRating).toBe(false);
  });

  test('exactly one SETTING_META entry, group vehicles, with label/type/help', () => {
    const metas = SETTING_META.filter((m) => m.key === 'trainCrashStationRating');
    expect(metas.length).toBe(1);
    expect(metas[0].group).toBe('vehicles');
    expect(metas[0].label).toBeTruthy();
    expect(metas[0].type).toBe('check');
    expect(metas[0].help).toBeTruthy();
  });

  test('setSetting toggles it live', () => {
    const st = fakeState(true);
    setSetting(st, 'trainCrashStationRating', true);
    expect(st.settings.trainCrashStationRating).toBe(true);
  });
});

describe('trainCrashStationRating: station rating after a crash', () => {
  // Stations of the player (no ownerId): A 15 tiles away, B 35 tiles away (outside radius 30).
  function stations(startA = 190) {
    return [
      { id: 1, x: 5, y: 20, rating200: { PASS: startA }, rating: { PASS: startA / 2 } },
      { id: 2, x: 5, y: 40, rating200: { PASS: 190 }, rating: { PASS: 95 } },
    ];
  }

  test('default (off): a crash leaves station ratings unchanged (pin)', () => {
    const st = fakeState(true, { stations: stations() });
    headOn(st);
    runTick(st);
    expect(st.vehicles.length).toBe(0); // the crash still happens
    expect(st.stations[0].rating200.PASS).toBe(190);
    expect(st.stations[0].rating.PASS).toBe(95);
    expect(st.stations[1].rating200.PASS).toBe(190);
  });

  test('on: a station within 30 tiles loses 160 rating points, published % follows', () => {
    const st = fakeState(true, { stations: stations(190) });
    setSetting(st, 'trainCrashStationRating', true);
    headOn(st);
    runTick(st);
    expect(st.vehicles.length).toBe(0);
    expect(st.stations[0].rating200.PASS).toBe(30); // 190 - 160
    expect(st.stations[0].rating.PASS).toBe(15);
  });

  test('on: the rating is clamped at 0', () => {
    const st = fakeState(true, { stations: stations(100) });
    setSetting(st, 'trainCrashStationRating', true);
    headOn(st);
    runTick(st);
    expect(st.stations[0].rating200.PASS).toBe(0);
    expect(st.stations[0].rating.PASS).toBe(0);
  });

  test('on: a station outside 30 tiles is unchanged', () => {
    const st = fakeState(true, { stations: stations() });
    setSetting(st, 'trainCrashStationRating', true);
    headOn(st);
    runTick(st);
    expect(st.stations[1].rating200.PASS).toBe(190);
    expect(st.stations[1].rating.PASS).toBe(95);
  });

  test('on: another company\'s station within 30 tiles is unchanged', () => {
    const rival = { id: 3, x: 5, y: 15, ownerId: 7, rating200: { PASS: 190 }, rating: { PASS: 95 } };
    const st = fakeState(true, { stations: [rival] });
    setSetting(st, 'trainCrashStationRating', true);
    headOn(st);
    runTick(st);
    expect(st.vehicles.length).toBe(0);
    expect(rival.rating200.PASS).toBe(190);
  });
});

describe('vehicle collisions across owners (OpenTTD: no crash between different owners)', () => {
  test('different owners on a head-on course do not crash', () => {
    const st = fakeState(true);
    const { a, b } = headOn(st, 1, 2);
    const events = runTick(st);
    expect(st.vehicles.length).toBe(2);
    expect(a.wrecked).toBeUndefined();
    expect(b.wrecked).toBeUndefined();
    expect(events.some(([n]) => n === 'crash')).toBe(false);
  });

  test('same owner on a head-on course crashes', () => {
    const st = fakeState(true);
    headOn(st, 1, 1);
    const events = runTick(st);
    expect(st.vehicles.length).toBe(0);
    expect(events.some(([n]) => n === 'crash')).toBe(true);
  });

  test('player (no ownerId) vs player still crashes; player vs rival does not', () => {
    const st = fakeState(true);
    const { a, b } = headOn(st, undefined, undefined);
    runTick(st);
    expect(a.wrecked).toBe(true);
    expect(b.wrecked).toBe(true);
    const st2 = fakeState(true);
    const r = headOn(st2, undefined, 4);
    runTick(st2);
    expect(r.a.wrecked).toBeUndefined();
    expect(r.b.wrecked).toBeUndefined();
  });

  test('trainEnters with differing owners marks nothing', () => {
    const st = fakeState(true);
    const a = train(1, 4, 1, 1, 0, 0), b = train(2, 5, -1, 2, 0, 0);
    b.state = 'running';
    st.vehicles = [a, b];
    const ctx = { state: st, emit: () => {}, occupancy: beginOccupancy(st), news: [] };
    trainEnters(ctx, a, 5, 5);
    expect(a.wrecked).toBeUndefined();
    expect(b.wrecked).toBeUndefined();
  });
});
