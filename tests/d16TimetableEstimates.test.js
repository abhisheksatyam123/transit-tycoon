/** Timetable estimates (opt-in `timetableEstimates`, OpenTTD G3 estimates + G4 preserve-wait autofill). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { loadingTick, arriveAtStation, advanceOrder } from '../js/simulation/orders.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

function setup(on = false) {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: false }, { stationId: L.b.id }]).ok).toBe(true);
  if (on) setSetting(g.state, 'timetableEstimates', true);
  const stA = g.state.stations.find((s) => s.id === v.orders[0].stationId);
  const stB = g.state.stations.find((s) => s.id === v.orders[1].stationId);
  return { g, L, v, stA, stB };
}

/** Leave A at tick 0 (order 0), then advance to order 1. */
function departA(g, v, stA) {
  g.state.tick = 0;
  v.state = 'loading'; v.atStationId = stA.id; v.speed = 0; v.loadingTicks = 1; v.orderIndex = 0;
  expect(loadingTick(g.ctx, v)).toBe(true);
  advanceOrder(v);
}

describe('timetableEstimates default OFF', () => {
  test('the setting is off by default and has exactly one meta row', () => {
    expect(DEFAULT_SETTINGS.timetableEstimates).toBe(false);
    const rows = SETTING_META.filter((m) => m.key === 'timetableEstimates');
    expect(rows.length).toBe(1);
    expect(rows[0].group).toBe('vehicles');
  });

  test('off: an untimetabled leg records no estimates and no bookkeeping ticks', () => {
    const { g, v, stA, stB } = setup(false);
    departA(g, v, stA);
    g.state.tick = 2 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.orders[1].estTravelDays).toBeUndefined();
    expect(v.orders[1].estWaitDays).toBeUndefined();
    expect(v.arriveTick).toBeUndefined(); // no waitDays/timetable need
    expect(v.departTick).toBeUndefined();
    expect(v.lateDays).toBeUndefined();
    // current behaviour for a timetabled leg is untouched
    g.setOrderTimetable(v.id, 1, { travelDays: 2 });
    departA(g, v, stA);
    g.state.tick = TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.lateDays).toBe(-1);
    expect(v.orders[1].estTravelDays).toBeUndefined();
  });

  test('off: no estimate keys are written into a save', () => {
    const { g, v, stA, stB } = setup(false);
    departA(g, v, stA);
    g.state.tick = 2 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    const back = parseState(serializeState(g.state));
    const w = back.vehicles.find((x) => x.id === v.id);
    expect(w.orders.some((o) => o.estWaitDays !== undefined || o.estTravelDays !== undefined)).toBe(false);
  });
});

describe('timetableEstimates ON (G3)', () => {
  test('travel estimate is recorded for an untimetabled leg and is not used for lateness', () => {
    const { g, v, stA, stB } = setup(true);
    setSetting(g.state, 'timetableLateness', true); // estimates must not feed the lateness counter
    departA(g, v, stA);
    g.state.tick = 2 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.orders[1].estTravelDays).toBe(2);
    expect(v.orders[1].travelDays).toBeUndefined();
    expect(v.lateTicks).toBeUndefined();
    expect(v.lateDays).toBeUndefined();
  });

  test('wait estimate is recorded for an untimetabled stop and does not add a hold', () => {
    const { g, v, stA, stB } = setup(true);
    departA(g, v, stA);
    g.state.tick = TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    g.state.tick += 2 * TICKS_PER_DAY;
    v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(true); // no waitDays: departs at once
    expect(v.orders[1].estWaitDays).toBe(2);
    expect(v.orders[1].waitDays).toBeUndefined();
  });

  test('a timetabled value is not replaced by an estimate', () => {
    const { g, v, stA, stB } = setup(true);
    g.setOrderTimetable(v.id, 1, { travelDays: 2 });
    departA(g, v, stA);
    g.state.tick = TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.orders[1].travelDays).toBe(2);
    expect(v.orders[1].estTravelDays).toBeUndefined();
    expect(v.lateDays).toBe(-1);
  });

  test('estimates round-trip through a save', () => {
    const { g, v, stA, stB } = setup(true);
    departA(g, v, stA);
    g.state.tick = 2 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    const back = parseState(serializeState(g.state));
    const w = back.vehicles.find((x) => x.id === v.id);
    expect(w.orders[1].estTravelDays).toBe(2);
    setSetting(back, 'timetableEstimates', false); // a save made with the setting on loads with it off
    expect(back.vehicles.find((x) => x.id === v.id).orders[1].estTravelDays).toBe(2);
  });
});

describe('timetableEstimates ON (G4 autofill)', () => {
  test('plain autofill confirms estimates into the real fields', () => {
    const { g, v, stA, stB } = setup(true);
    expect(g.setTimetableAutofill(v.id, true).ok).toBe(true);
    departA(g, v, stA);
    g.state.tick = 2 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.orders[1].travelDays).toBe(2);
    expect(v.orders[1].estTravelDays).toBeUndefined();
    g.state.tick += 2 * TICKS_PER_DAY;
    v.loadingTicks = 1;
    expect(loadingTick(g.ctx, v)).toBe(true);
    expect(v.orders[1].waitDays).toBe(2);
    expect(v.orders[1].estWaitDays).toBeUndefined();
  });

  test('Ctrl-autofill (preserve wait) keeps a longer timetabled wait but still updates travel', () => {
    const { g, v, stA, stB } = setup(true);
    setSetting(g.state, 'timetableLateness', true); // lateness reduces the hold, so the measured wait can be shorter
    g.setOrderTimetable(v.id, 0, { waitDays: 5 });
    expect(g.setTimetableAutofill(v.id, true, { preserveWait: true }).ok).toBe(true);
    // vehicle is 3 days late, so it departs after a measured 2-day wait: the existing 5-day wait must stay
    v.lateTicks = 3 * TICKS_PER_DAY;
    g.state.tick = 0;
    v.state = 'loading'; v.atStationId = stA.id; v.speed = 0; v.arriveTick = 0; v.loadingTicks = 1; v.orderIndex = 0;
    g.state.tick = 2 * TICKS_PER_DAY;
    expect(loadingTick(g.ctx, v)).toBe(true);
    expect(v.orders[0].waitDays).toBe(5);
    advanceOrder(v);
    g.state.tick += 1 * TICKS_PER_DAY;
    arriveAtStation(g.ctx, v, stB);
    expect(v.orders[1].travelDays).toBe(1); // travel is still overwritten
  });

  test('plain autofill without preserve does shorten the wait, as before', () => {
    const { g, v, stA } = setup(true);
    setSetting(g.state, 'timetableLateness', true);
    g.setOrderTimetable(v.id, 0, { waitDays: 5 });
    expect(g.setTimetableAutofill(v.id, true).ok).toBe(true);
    v.lateTicks = 3 * TICKS_PER_DAY;
    g.state.tick = 0;
    v.state = 'loading'; v.atStationId = stA.id; v.speed = 0; v.arriveTick = 0; v.loadingTicks = 1; v.orderIndex = 0;
    g.state.tick = 2 * TICKS_PER_DAY;
    expect(loadingTick(g.ctx, v)).toBe(true);
    expect(v.orders[0].waitDays).toBe(2);
  });
});
