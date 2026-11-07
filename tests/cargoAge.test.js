/** Cargo aging in vehicles (OpenTTD CargoList::AgeCargo, setting cargoAgeInVehicle): whole 2.5-day periods in payment. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { transitDays, transferCredit, CARGO_AGE_PERIOD_DAYS } from '../js/simulation/orders.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { calculateDeliveredCargoPayment } from '../js/simulation/loco/economy.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

function setup() {
  const g = flatGame(21);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('cargo aging in vehicles', () => {
  test('default is off and the period is OpenTTD 185 ticks / 74 per day', () => {
    expect(DEFAULT_SETTINGS.cargoAgeInVehicle).toBe(false);
    expect(CARGO_AGE_PERIOD_DAYS).toBeCloseTo(185 / 74, 10);
  });

  test('off: transit days are continuous (unchanged behaviour)', () => {
    const { g } = setup();
    g.state.tick = 100 * TICKS_PER_DAY / 3;
    const load = { sinceTick: 0 };
    expect(transitDays(g.state, load)).toBeCloseTo(100 / 3, 6);
  });

  test('on: transit days advance in whole 2.5-day periods', () => {
    const { g } = setup();
    setSetting(g.state, 'cargoAgeInVehicle', true);
    const load = { sinceTick: 0 };
    g.state.tick = Math.round(2.4 * TICKS_PER_DAY);
    expect(transitDays(g.state, load)).toBe(0);
    g.state.tick = Math.round(2.6 * TICKS_PER_DAY);
    expect(transitDays(g.state, load)).toBeCloseTo(CARGO_AGE_PERIOD_DAYS, 6);
    g.state.tick = Math.round(5.1 * TICKS_PER_DAY);
    expect(transitDays(g.state, load)).toBeCloseTo(2 * CARGO_AGE_PERIOD_DAYS, 6);
  });

  test('payment on vs off differs for a long trip, and on equals the payment for the floored days', () => {
    const { g, L, v } = setup();
    const dist = 30;
    const st = { x: L.a.x + dist, y: L.a.y };
    const load = { sinceTick: 0, amount: 100, sourceX: L.a.x, sourceY: L.a.y, fromStationId: L.a.id };
    const veh = { ...v, cargoId: 'COAL', load };
    // a long trip where the coal payment has already fallen
    g.state.tick = Math.round(99.5 * TICKS_PER_DAY); // on: 39 whole periods = 97.5 days
    const off = transferCredit(g.state, veh, st, 100, 0);
    setSetting(g.state, 'cargoAgeInVehicle', true);
    const on = transferCredit(g.state, veh, st, 100, 0);
    expect(on).not.toBe(off);
    // on: days floored to whole periods (99.5 -> 97.5), then whole days for the payment table
    expect(transitDays(g.state, load)).toBeCloseTo(97.5, 6);
    const floored = Math.floor(transitDays(g.state, load));
    const pay = calculateDeliveredCargoPayment(g.state, 'COAL', 100, dist, floored);
    expect(on).toBe(Math.round((pay * 75) / 100)); // FEEDER_PAYMENT_SHARE, feeder share 0
  });

  test('save/load roundtrip keeps the setting and its payment', () => {
    const { g } = setup();
    setSetting(g.state, 'cargoAgeInVehicle', true);
    const back = parseState(serializeState(g.state));
    expect(getSetting(back, 'cargoAgeInVehicle')).toBe(true);
    const load = { sinceTick: 0 };
    back.tick = Math.round(7 * TICKS_PER_DAY);
    expect(transitDays(back, load)).toBeCloseTo(5, 6);
  });

  test('a default save does not gain the key (old saves and world hash unchanged)', () => {
    const { g } = setup();
    const back = parseState(serializeState(g.state));
    expect(back.settings && back.settings.cargoAgeInVehicle).toBeUndefined();
  });
});
