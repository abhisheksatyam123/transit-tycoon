import { test, expect, describe } from 'bun:test';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { refreshBarred } from '../js/simulation/levelCrossing.js';
import { beginOccupancy } from '../js/simulation/blocking.js';
import { tick } from '../js/simulation/loco/vehicleManager.js';
import { trainEntersCrossing } from '../js/simulation/trainCollision.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { parseState, serializeState } from '../js/simulation/save.js';
import { flatGame } from './helpers.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
const KMH = (k) => k * KMH_TO_TILES_PER_TICK; // speeds are tiles per tick (km/h scale)

const W = 12;
/** 12x12 map: road along y=5 (E|W), rail along x=5 (N|S): crossing at (5,5). */
function fakeState(on) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].road = 10;
  for (let y = 0; y < W; y++) tiles[y * W + 5].rail = 5;
  tiles[5 * W + 5].road = 10; tiles[5 * W + 5].rail = 5;
  return { map: { width: W, height: W, tiles }, settings: on === undefined ? {} : { levelCrossings: true, vehicleCollisions: on }, vehicles: [], tick: 0, news: [], date: { day: 1, month: 0, year: 1950 } };
}
const bus = (x, cargo = 'PASS', amount = 20) => ({ id: 1, kind: 'road', roadType: 'bus', modelId: cargo === 'PASS' ? 'bus_city' : 'trk_bulk', state: 'running', speed: KMH(40), maxSpeed: KMH(40),
  progress: 0, tx: x, ty: 5, path: [{ x, y: 5 }, { x: x + 1, y: 5 }], pathIndex: 0,
  history: [{ x, y: 5 }, { x: x - 1, y: 5 }], orders: [], orderIndex: 0, cargoId: cargo, load: { amount } });
/** Train one tile north of (x,y), progress 0.99: this tick it steps onto (x,y), the crossing. */
const train = (x, y) => ({ id: 9, kind: 'train', modelId: 'eng_puffer', state: 'running', speed: KMH(40), maxSpeed: KMH(40), wagons: 1, progress: 0.99, tx: x, ty: y - 1,
  path: [{ x, y: y - 1 }, { x, y }, { x, y: y + 1 }], pathIndex: 0, history: [{ x, y: y - 1 }], orders: [], orderIndex: 0 });
/** Run one VehicleManager tick on a fake game; events collected. */
function runTick(st) {
  const events = [];
  const game = { state: st, ctx: { state: st, emit: (n, e) => events.push([n, e]), rng: null }, rng: { next: () => 0.5 } };
  tick(game);
  return events;
}

describe('vehicleCollisions', () => {
  test('default off and listed in the Vehicles group', () => {
    expect(DEFAULT_SETTINGS.vehicleCollisions).toBe(false);
    const m = SETTING_META.filter((x) => x.key === 'vehicleCollisions');
    expect(m.length).toBe(1);
    expect(m[0].group).toBe('vehicles');
    expect(m[0].help.length).toBeGreaterThan(20);
  });

  test('off: a train on a crossing with a bus on it does not destroy the bus', () => {
    const st = fakeState(false);
    const b = bus(5), t = train(5, 5);
    st.vehicles = [t, b]; // train ticks first: the bus is still on the crossing when it arrives
    const events = runTick(st);
    expect(st.vehicles.includes(b)).toBe(true);
    expect(events.some(([n]) => n === 'crash')).toBe(false);
    expect(st.news.length).toBe(0);
  });

  test('on: a bus on the crossing is destroyed, news and crash emitted', () => {
    const st = fakeState(true);
    const b = bus(5), t = train(5, 5);
    st.vehicles = [t, b]; // train ticks first: the bus is still on the crossing when it arrives
    st.news = [];
    const events = runTick(st);
    expect(st.vehicles.includes(b)).toBe(false);
    expect(st.vehicles.includes(t)).toBe(true);
    const crash = events.find(([n]) => n === 'crash');
    expect(crash[1]).toEqual({ x: 5, y: 5, victims: 20 });
    expect(events.some(([n, e]) => n === 'news' && /Road vehicle destroyed in collision with train/.test(e.text))).toBe(true);
  });

  test('on: a bus away from the crossing is not hit', () => {
    const st = fakeState(true);
    const b = bus(2), t = train(5, 5);
    st.vehicles = [t, b]; // train ticks first: the bus is still on the crossing when it arrives
    runTick(st);
    expect(st.vehicles.includes(b)).toBe(true);
  });

  test('trainEntersCrossing only marks road vehicles on the tile, never trains', () => {
    const st = fakeState(true);
    const b = bus(5), other = train(5, 5);
    st.vehicles = [b, other];
    const ctx = { state: st, emit: () => {}, occupancy: beginOccupancy(st) };
    trainEntersCrossing(ctx, other, 5, 5);
    expect(b.wrecked).toBe(true);
    expect(other.wrecked).toBeUndefined();
  });

  test('a freight truck is destroyed but without passenger victims', () => {
    const st = fakeState(true);
    const truck = bus(5, 'GOOD', 0); truck.roadType = 'truck';
    st.vehicles = [train(5, 5), truck];
    const events = runTick(st);
    expect(st.vehicles.includes(truck)).toBe(false);
    expect(events.find(([n]) => n === 'crash')[1].victims).toBe(0);
  });

  test('old saves load without the setting and serialise without it', () => {
    const g = flatGame(3);
    expect(g.state.settings && g.state.settings.vehicleCollisions).toBeUndefined();
    expect(serializeState(g.state).includes('vehicleCollisions')).toBe(false);
    expect(parseState(serializeState(g.state))).toBeTruthy();
  });

  test('setSetting turns it on live', () => {
    const st = fakeState(false);
    setSetting(st, 'vehicleCollisions', true);
    expect(st.settings.vehicleCollisions).toBe(true);
    void refreshBarred;
  });
});
