/**
 * Breakdown opt-ins (all default false = current TT behaviour):
 *  shipBreakdownReduced  OpenTTD vehicle.cpp:1357 `if (Ship) rel += 0x6666`
 *  ageDecayOttd          OpenTTD vehicle.cpp:1454-1466 reliability decay doubles per year past max age
 *  serviceOnDepotVisit   OpenTTD vehicle.cpp:189-203 every depot entry services the vehicle
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { armBreakdownTimer, vehicleDaily, dailyReliabilityLoss, RELIABILITY_SCALE, RELIABILITY_LOSS_PER_DAY, SHIP_BREAKDOWN_BOOST } from '../js/simulation/loco/vehicle.js';
import { enterDepot } from '../js/simulation/movement.js';

const NEW_KEYS = ['shipBreakdownReduced', 'ageDecayOttd', 'serviceOnDepotVisit'];
const fixedRng = { next: () => 0.5 };
const stateWith = (settings = {}) => ({ settings: { ...settings } });

/** Armed breakdown timer for a fixed rng (0.5) and reliability. */
function armed(kind, reliability, settings = {}) {
  const v = { kind, reliability };
  armBreakdownTimer(v, fixedRng, stateWith(settings));
  return v.timeoutToBreakdown;
}

describe('settings invariant', () => {
  test('each new default is false', () => {
    for (const k of NEW_KEYS) expect(DEFAULT_SETTINGS[k]).toBe(false);
  });

  test('each new key has exactly one SETTING_META entry in group vehicles', () => {
    for (const k of NEW_KEYS) {
      const hits = SETTING_META.filter((e) => e.key === k);
      expect(hits.length).toBe(1);
      expect(hits[0].group).toBe('vehicles');
      expect(hits[0].type).toBe('check');
    }
  });
});

describe('shipBreakdownReduced', () => {
  test('default ship and train timers are unchanged (pinned: rel 0.5, rng 0.5 -> 156 days)', () => {
    // rel16 12800 -> f 50 -> f*f/16 = 156; randVal 39; f -= 39; f += 39 -> 156
    expect(armed('ship', 0.5)).toBe(156);
    expect(armed('train', 0.5)).toBe(156);
    expect(armed('ship', 0.5, { shipBreakdownReduced: false })).toBe(156);
  });

  test('on: a ship timer is longer than off (pinned 506 vs 156: rel16 23040 -> f 90 -> 506)', () => {
    expect(SHIP_BREAKDOWN_BOOST).toBe(10240); // 0x6666 on the 25600 scale
    expect(armed('ship', 0.5, { shipBreakdownReduced: true })).toBe(506);
    expect(armed('ship', 0.5, { shipBreakdownReduced: true })).toBeGreaterThan(armed('ship', 0.5));
  });

  test('on: trains are unchanged', () => {
    expect(armed('train', 0.5, { shipBreakdownReduced: true })).toBe(armed('train', 0.5));
  });

  test('on: a ship at full reliability is still lengthened (boost is not clamped, as in OpenTTD)', () => {
    // rel16 25600 + 10240 exceeds full scale; OpenTTD does not clamp rel either
    expect(armed('ship', 1, { shipBreakdownReduced: true })).toBeGreaterThan(armed('ship', 1));
  });
});

describe('ageDecayOttd', () => {
  const maxAge = 15 * 365;
  function lossAfterDay(ageDays, settings) {
    const v = { kind: 'train', reliability: 0.9, age: ageDays - 1, maxAge, timeoutToBreakdown: 1000, state: 'running', baseReliability: 0.9 };
    vehicleDaily({ state: stateWith(settings) }, v, fixedRng, 1900);
    return 0.9 - v.reliability;
  }

  test('default: decay after max age is one step (4/25600 per day)', () => {
    const d = lossAfterDay(maxAge + 3 * 365, {});
    expect(d).toBeCloseTo(RELIABILITY_LOSS_PER_DAY / RELIABILITY_SCALE, 12);
    expect(lossAfterDay(maxAge + 3 * 365, { ageDecayOttd: false })).toBeCloseTo(d, 12);
  });

  test('on: 3 years past max age loses 16x per day (4 doublings: x2 at max age, x4, x8, x16)', () => {
    const off = lossAfterDay(maxAge + 3 * 365, {});
    const on = lossAfterDay(maxAge + 3 * 365, { ageDecayOttd: true });
    expect(on / off).toBeCloseTo(16, 6);
  });

  test('on: before max age and at max age year 0 (x2) are as specified', () => {
    expect(dailyReliabilityLoss({ age: maxAge - 1, maxAge }, false, stateWith({ ageDecayOttd: true }))).toBe(4 / RELIABILITY_SCALE);
    expect(dailyReliabilityLoss({ age: maxAge, maxAge }, false, stateWith({ ageDecayOttd: true }))).toBe(8 / RELIABILITY_SCALE);
  });

  test('on: doubling caps at x32 (5 doublings) from year 4 on', () => {
    expect(dailyReliabilityLoss({ age: maxAge + 9 * 365, maxAge }, false, stateWith({ ageDecayOttd: true }))).toBe(128 / RELIABILITY_SCALE);
  });
});

describe('serviceOnDepotVisit', () => {
  function setup() {
    const g = flatGame(41);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(v.serviceIntervalDays).toBeUndefined();
    return { g, L, v };
  }

  test('off (default): a vehicle without serviceIntervalDays keeps its reliability on depot entry', () => {
    const { g, L, v } = setup();
    v.reliability = 0.3;
    enterDepot({ state: g.state }, v, L.depotId);
    expect(v.reliability).toBe(0.3);
    expect(v.services).toBeUndefined();
  });

  test('on: a vehicle without serviceIntervalDays regains max reliability on depot entry', () => {
    const { g, L, v } = setup();
    setSetting(g.state, 'serviceOnDepotVisit', true);
    v.reliability = 0.3;
    enterDepot({ state: g.state }, v, L.depotId);
    expect(v.reliability).toBe(v.baseReliability);
    expect(v.services).toBe(1);
    expect(v.serviceIntervalDays).toBeUndefined();
  });
});
