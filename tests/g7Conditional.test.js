/** G7: opt-in lateness clock on timetabled conditional orders (default off; needs timetableLateness too). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { resolveConditionals } from '../js/simulation/condOrders.js';
import { vehicleTick } from '../js/simulation/movement.js';

// A conditional that is never true (always == 0) then a plain stop: the cond holds, then falls through.
const COND = { v: 'always', cmp: '==', val: 0, to: -1 };

function setup(on) {
  const g = flatGame(33);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: false }, { stationId: L.b.id }]).ok).toBe(true);
  // direct order list: conditional at index 0 (optionally carrying a wait), plain stop at index 1
  v.orders = [{ cond: { ...COND } }, { stationId: L.b.id }];
  v.orderIndex = 0;
  if (on) {
    setSetting(g.state, 'timetableLateness', true);
    setSetting(g.state, 'timetableLatenessConditional', true);
  }
  return { g, L, v, state: g.state };
}

describe('G7 conditional lateness clock', () => {
  test('setting off: conditional waits are refused and the cond resolves instantly (old behaviour)', () => {
    const { g, v, state } = setup(false);
    state.tick = 1000;
    const before = v.state;
    expect(g.setOrderTimetable(v.id, 0, { waitDays: 2 }).ok).toBe(false);
    expect(v.orders[0].waitDays).toBeUndefined();
    // a wait set directly is ignored with the setting off: no hold, no lazy fields
    v.orders[0].waitDays = 2;
    expect(resolveConditionals(state, v)).toBe(true);
    expect(v.orderIndex).toBe(1);
    expect(v.state).toBe(before);
    expect(v.condSince).toBeUndefined();
    expect(v.lateTicks).toBeUndefined();
  });

  test('default game: no G7 keys on vehicles or orders', () => {
    const { v } = setup(false);
    expect(['condSince', 'lateTicks', 'lateDays', 'ttStart']
      .filter((k) => v[k] !== undefined)).toEqual([]);
    expect(v.state).not.toBe('condWait');
    expect(v.orders.every((o) => o.waitDays === undefined)).toBe(true);
  });

  test('setting on: a conditional wait is accepted; travel time is still refused', () => {
    const { g, v } = setup(true);
    expect(g.setOrderTimetable(v.id, 0, { waitDays: 2 }).ok).toBe(true);
    expect(v.orders[0].waitDays).toBe(2);
    expect(g.setOrderTimetable(v.id, 0, { travelDays: 1 }).ok).toBe(false);
  });

  test('setting on, late by 1 day: holds 1 day (wait 2 - late 1), then books the lateness back to 0', () => {
    const { v, state } = setup(true);
    v.orders[0].waitDays = 2;
    v.lateTicks = TICKS_PER_DAY;
    const T0 = 5000;
    state.tick = T0;
    expect(resolveConditionals(state, v)).toBe(false);
    expect(v.state).toBe('condWait');
    expect(v.retryTick).toBe(T0 + TICKS_PER_DAY);
    state.tick = T0 + TICKS_PER_DAY - 1;
    expect(resolveConditionals(state, v)).toBe(false);
    state.tick = T0 + TICKS_PER_DAY;
    expect(resolveConditionals(state, v)).toBe(true);
    expect(v.orderIndex).toBe(1);
    // actual 1 day minus timetabled 2 days = -1 day, added to +1 day late: on time, fields cleared
    expect(v.lateTicks).toBeUndefined();
    expect(v.lateDays).toBeUndefined();
    expect(v.condSince).toBeUndefined();
    expect(v.state).toBe('running');
  });

  test('setting on, early by 1 day: holds 3 days (wait 2 + early 1), then lateness ends at 0', () => {
    const { v, state } = setup(true);
    v.orders[0].waitDays = 2;
    v.lateTicks = -TICKS_PER_DAY;
    const T0 = 0;
    state.tick = T0;
    expect(resolveConditionals(state, v)).toBe(false);
    expect(v.retryTick).toBe(3 * TICKS_PER_DAY);
    state.tick = 2 * TICKS_PER_DAY;
    expect(resolveConditionals(state, v)).toBe(false);
    state.tick = 3 * TICKS_PER_DAY;
    expect(resolveConditionals(state, v)).toBe(true);
    expect(v.lateTicks).toBeUndefined();
  });

  test('setting on, untimetabled conditional: no hold and no lazy fields', () => {
    const { v, state } = setup(true);
    state.tick = 100;
    expect(resolveConditionals(state, v)).toBe(true);
    expect(v.orderIndex).toBe(1);
    expect(v.condSince).toBeUndefined();
  });

  test('setting on: vehicleTick wakes a condWait vehicle at retryTick and moves on', () => {
    const { v, state } = setup(true);
    v.orders[0].waitDays = 1;
    state.tick = 0;
    expect(resolveConditionals(state, v)).toBe(false);
    v.state = 'condWait';
    const ctx = { state };
    state.tick = TICKS_PER_DAY - 1;
    vehicleTick(ctx, v);
    expect(v.state).toBe('condWait');
    state.tick = TICKS_PER_DAY;
    vehicleTick(ctx, v);
    expect(v.orderIndex).toBe(1);
    expect(v.state).not.toBe('condWait');
  });
});
