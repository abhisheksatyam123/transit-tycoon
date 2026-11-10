/** order.gradual_loading (OpenTTD economy.cpp): per-part load amounts, wait between cycles, stop rules. Opt-in. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { loadingTick, loadCargo, loadCargoCycle, LOAD_TICKS } from '../js/simulation/orders.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';
import { loadAmountFor, gradualWaitTicks, plainParts } from '../js/simulation/gradualLoad.js';
import { MAX_WAITING } from '../js/simulation/constants.js';

/** Coal train of `wagons` hoppers at station A (no orders: it simply loads and then departs). */
function setup(wagons, on, waiting = 1000) {
  const g = flatGame(41);
  const L = coalLine(g);
  if (on) setSetting(g.state, 'gradualLoading', true);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const tile = L.a.tiles.find((p) => p.kind === 'rail');
  v.tx = tile.x; v.ty = tile.y;
  v.state = 'loading'; v.atStationId = L.a.id; v.speed = 0; v.loadingTicks = 1;
  if (waiting > 0) addWaiting(L.a, 'COAL', waiting, 10, 20, g.state.tick, MAX_WAITING);
  return { g, L, v, st: L.a, ctx: { state: g.state, emit() {} } };
}

/** Run loadingTick until it reports ready; returns the load after each cycle and the wait used. */
function runToDeparture(ctx, v, maxTicks = 5000) {
  const steps = [];
  let last = v.load.amount;
  for (let t = 0; t < maxTicks; t++) {
    const ready = loadingTick(ctx, v);
    if (v.load.amount !== last) { steps.push({ amount: v.load.amount - last, wait: v.loadingTicks }); last = v.load.amount; }
    if (ready) return { steps, ready: true };
  }
  return { steps, ready: false };
}

describe('gradual loading: defaults, UI and helpers', () => {
  test('default off; OpenTTD default on is not adopted', () => {
    expect(DEFAULT_SETTINGS.gradualLoading).toBe(false);
  });

  test('UI entry exists once', () => {
    expect(SETTING_META.filter((m) => m.key === 'gradualLoading').length).toBe(1);
  });

  test('per-class load amounts (OpenTTD base table: 5 train/road, 10 ship, 20 aircraft, mail /4)', () => {
    expect(loadAmountFor({ kind: 'train' }, 'COAL')).toBe(5);
    expect(loadAmountFor({ kind: 'road' }, 'PASS')).toBe(5);
    expect(loadAmountFor({ kind: 'ship' }, 'GOODS')).toBe(10);
    expect(loadAmountFor({ kind: 'aircraft' }, 'PASS')).toBe(20);
    expect(loadAmountFor({ kind: 'aircraft' }, 'MAIL')).toBe(5);
  });

  test('wait per class converted from OpenTTD ticks (74/day) to TT ticks (96/day)', () => {
    expect(gradualWaitTicks({ kind: 'train' })).toBe(52); // 40 x 96/74 = 51.9
    expect(gradualWaitTicks({ kind: 'road' })).toBe(26);  // 20 -> 25.9
    expect(gradualWaitTicks({ kind: 'ship' })).toBe(13);  // 10 -> 13.0
    expect(gradualWaitTicks({ kind: 'aircraft' })).toBe(26);
  });
});

describe('gradual loading: cycles', () => {
  test('one cycle loads 5 per wagon (4 wagons -> 20), not the whole waiting cargo', () => {
    const { v, st, ctx } = setup(4, true);
    expect(plainParts(v)).toBe(4);
    const cyc = loadCargoCycle(ctx, v, st);
    expect(cyc.got).toBe(20);
    expect(cyc.filled).toBe(true);
    expect(v.load.amount).toBe(20);
  });

  test('default off: one step loads the whole room (unchanged)', () => {
    const { v, st, ctx } = setup(4, false);
    expect(loadCargo(ctx, v, st)).toBeGreaterThan(20);
  });

  test('a full train loads in slices of 20 with the cycle wait between them', () => {
    const { v, ctx } = setup(4, true);
    const { steps, ready } = runToDeparture(ctx, v);
    expect(ready).toBe(true);
    expect(v.load.amount).toBe(v.capacity);
    // every cycle but the last loads 20 and waits 52 ticks
    for (const s of steps.slice(0, -1)) {
      expect(s.amount).toBe(20);
      expect(s.wait).toBe(52);
    }
    expect(steps.length).toBeGreaterThan(2);
  });

  test('a short cycle (cargo runs out) departs after the cycle that moved it', () => {
    const { v, st, ctx } = setup(4, true, 12);
    expect(waitingAmount(st, 'COAL')).toBe(12);
    const { steps, ready } = runToDeparture(ctx, v);
    expect(ready).toBe(true);
    expect(steps.length).toBe(1);
    expect(v.load.amount).toBe(12);
    expect(waitingAmount(st, 'COAL')).toBe(0);
  });

  test('full-load order keeps cycling after a short cycle until full', () => {
    const { g, v, st, ctx, L } = setup(4, true, 12);
    expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id, full: false }]).ok).toBe(true);
    const first = loadingTick(ctx, v); // first cycle loads the 12 that were waiting
    expect(first).toBe(false);
    expect(v.load.amount).toBe(12);
    // no cargo left: a full-load order waits, it does not depart
    for (let t = 0; t < 200; t++) expect(loadingTick(ctx, v)).toBe(false);
    addWaiting(st, 'COAL', 1000, 10, 20, g.state.tick, MAX_WAITING);
    const { ready } = runToDeparture(ctx, v);
    expect(ready).toBe(true);
    expect(v.load.amount).toBe(v.capacity);
  });

  test('improved load on: a later arrival is held (keeps cycling) while an earlier one loads', () => {
    const { g, v, st, ctx, L } = setup(4, true, 1000);
    setSetting(g.state, 'improvedLoad', true);
    const other = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 4, cargoId: 'COAL' });
    expect(other.ok).toBe(true);
    const early = other.vehicle;
    early.state = 'loading'; early.atStationId = st.id; early.atStationSince = 1; early.loadingTicks = 1;
    v.atStationSince = 2;
    const cyc = loadCargoCycle(ctx, v, st);
    expect(cyc.got).toBe(0);
    expect(cyc.held).toBe(true);
    early.loadingTicks = 1; loadingTick(ctx, early);
    expect(early.load.amount).toBeGreaterThan(0);
    v.loadingTicks = 1;
    expect(loadingTick(ctx, v)).toBe(false);          // held: keeps cycling, does not depart
    expect(v.loadingTicks).toBe(52);
  });

  test('the first wait after arrival is the normal stop time (LOAD_TICKS), cycles follow', () => {
    const { v, st, ctx } = setup(4, true);
    v.loadingTicks = LOAD_TICKS;
    // LOAD_TICKS countdown: nothing loads until it runs out
    for (let t = 0; t < LOAD_TICKS - 1; t++) loadingTick(ctx, v);
    expect(v.load.amount).toBe(0);
    loadingTick(ctx, v);
    expect(v.load.amount).toBe(20);
  });
});
