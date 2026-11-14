/**
 * Round AB settings: difficulty.infinite_money, economy.cargo_aging_rate, order.serviceathelipad,
 * economy.found_town. Each has a default that preserves the old behaviour, and the setting changes behaviour when set.
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting, infiniteMoney } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { checkMoney } from '../js/simulation/trackRules.js';
import { calculateDeliveredCargoPayment } from '../js/simulation/loco/economy.js';
import { updateMonthly1 } from '../js/simulation/loco/companyManager.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { ftaPartTiles } from '../js/simulation/airportGround.js';
import { arriveAtStation } from '../js/simulation/orders.js';

describe('Round AB settings: defaults and UI', () => {
  test('defaults preserve the current behaviour', () => {
    expect(DEFAULT_SETTINGS.infiniteMoney).toBe(false);
    expect(DEFAULT_SETTINGS.cargoAgingRate).toBe(100);
    expect(DEFAULT_SETTINGS.serviceAtHelipad).toBe(false);
    expect(DEFAULT_SETTINGS.townFounding).toBe('forbidden');
    const g = flatGame();
    expect(infiniteMoney(g.state)).toBe(false);
    expect(getSetting(g.state, 'cargoAgingRate')).toBe(100);
  });

  test('each key has one UI entry in the right group', () => {
    const byKey = (k) => SETTING_META.filter((m) => m.key === k);
    for (const [key, group] of [['infiniteMoney', 'difficulty'], ['cargoAgingRate', 'economy'], ['serviceAtHelipad', 'vehicles'], ['townFounding', 'economy']]) {
      expect(byKey(key).length).toBe(1);
      expect(byKey(key)[0].group).toBe(group);
    }
    const tf = byKey('townFounding')[0];
    expect(tf.options.map((o) => o[0])).toEqual(['allowed', 'forbidden']);
  });
});

describe('infinite money (difficulty.infinite_money)', () => {
  test('default: a purchase above the balance is refused', () => {
    const g = flatGame();
    g.state.company.money = 1000;
    expect(checkMoney(g.state, 5000)).toEqual({ ok: false, error: expect.any(String) });
  });

  test('on: the same purchase is allowed and the balance is not checked', () => {
    const g = flatGame();
    g.state.company.money = 1000;
    setSetting(g.state, 'infiniteMoney', true);
    expect(infiniteMoney(g.state)).toBe(true);
    expect(checkMoney(g.state, 5000)).toBeNull();
  });

  test('on: a company that is in debt for 9 months is not declared bankrupt', () => {
    const g = flatGame();
    setSetting(g.state, 'infiniteMoney', true);
    g.state.company.money = -1_000_000_000;
    for (let i = 0; i < 12; i++) updateMonthly1(g);
    expect(g.state.company.bankrupt).toBeFalsy();
    expect(g.state.company.numMonthsInTheRed ?? 0).toBe(0);
  });

  test('off: a company in debt for 9 months is declared bankrupt', () => {
    const g = flatGame();
    g.state.company.money = -1_000_000_000;
    for (let i = 0; i < 12; i++) updateMonthly1(g);
    expect(g.state.company.bankrupt).toBe(true);
  });

  test('on: a share purchase above the balance is allowed', () => {
    const g = Game.create({ seed: 5, width: 64, height: 64, townCount: 4 });
    setSetting(g.state, 'shares', true);
    setSetting(g.state, 'aiCompanies', 1);
    const [r] = ensureRivals(g.state, 1);
    r.companyValue = 40000;
    r.foundedAt = g.state.date.year * 12 + g.state.date.month - 12;
    g.state.company.money = 0;
    expect(g.tradeShare(r.id, 'buy').ok).toBe(false);
    setSetting(g.state, 'infiniteMoney', true);
    expect(g.tradeShare(r.id, 'buy').ok).toBe(true);
  });
});

describe('cargo aging rate (economy.cargo_aging_rate)', () => {
  test('100 (default) pays the same as before for any transit time', () => {
    const g = flatGame();
    const base = calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 20);
    expect(base).toBeGreaterThan(0);
    expect(calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 20)).toBe(base);
  });

  test('200 pays the same as 100 with twice the transit days', () => {
    const g = flatGame();
    const twice = calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 40);
    const once = calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 20);
    expect(twice).toBeLessThan(once); // the test has teeth: longer transit pays less
    setSetting(g.state, 'cargoAgingRate', 200);
    expect(calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 20)).toBe(twice);
  });

  test('0 means no transit time: the maximum payment for the same delivery', () => {
    const g = flatGame();
    const fast = calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 0);
    setSetting(g.state, 'cargoAgingRate', 0);
    expect(calculateDeliveredCargoPayment(g.state, 'COAL', 20, 100, 500)).toBe(fast);
  });
});

describe('found town (economy.found_town)', () => {
  /** A free land site 12+ tiles from every town (same search as foundTown.test.js). */
  function freeSite(g) {
    const s = g.state;
    for (let y = 4; y < s.map.height - 4; y += 2) for (let x = 4; x < s.map.width - 4; x += 2) {
      if (g.estimateFound('town', x, y).ok && s.towns.every((t) => Math.abs(t.x - x) + Math.abs(t.y - y) >= 12)) return [x, y];
    }
    throw new Error('no free site');
  }

  test('allowed (explicit; default is forbidden): a town can be founded', () => {
    const g = Game.create({ seed: 42, width: 96, height: 96 });
    const [x, y] = freeSite(g);
    setSetting(g.state, 'townFounding', 'allowed');
    const n = g.state.towns.length;
    expect(g.foundTown(x, y).ok).toBe(true);
    expect(g.state.towns.length).toBe(n + 1);
  });

  test('forbidden: founding is refused, no town and no money spent', () => {
    const g = Game.create({ seed: 42, width: 96, height: 96 });
    const [x, y] = freeSite(g);
    setSetting(g.state, 'townFounding', 'forbidden');
    const n = g.state.towns.length, money = g.state.company.money;
    const r = g.foundTown(x, y);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/forbidden/);
    expect(g.state.towns.length).toBe(n);
    expect(g.state.company.money).toBe(money);
  });
});

describe('service at helipad (order.serviceathelipad)', () => {
  /** A heliport on a clear map in 1985 (Tricario buyable) with a helicopter on a helipad tile. */
  function heliSetup() {
    const g = Game.create({ seed: 5, width: 96, height: 96 });
    g.state.company.money = 20_000_000;
    g.state.date.year = 1985;
    const type = 'heliport';
    const t = AIRPORT_TYPES[type];
    let spot = null;
    for (let y = 4; y < g.state.map.height - t.h && !spot; y++) for (let x = 4; x < g.state.map.width - t.w && !spot; x++) {
      if (g.buildAirport(x, y, { type, dryRun: true }).ok) spot = { x, y };
    }
    expect(spot).not.toBeNull();
    const r = g.buildAirport(spot.x, spot.y, { type });
    expect(r.ok).toBe(true);
    const st = g.state.stations.find((s) => s.id === r.stationId);
    const pad = ftaPartTiles(g.state, st, 'helipad')[0];
    expect(pad).toBeDefined();
    const buy = g.buyVehicle(r.depotId, { modelId: 'ac_tricario' });
    expect(buy.ok).toBe(true);
    const v = buy.vehicle;
    v.breakdownTicks = 9;
    v.services = 0;
    return { g, st, v, pad };
  }

  test('default off: a helicopter on a helipad arrives without a service', () => {
    const { g, st, v, pad } = heliSetup();
    v.tx = pad.x; v.ty = pad.y;
    arriveAtStation({ state: g.state, emit() {} }, v, st);
    expect(v.services).toBe(0);
    expect(v.breakdownTicks).toBe(9);
  });

  test('on: a helicopter on a helipad is serviced on arrival', () => {
    const { g, st, v, pad } = heliSetup();
    setSetting(g.state, 'serviceAtHelipad', true);
    v.tx = pad.x; v.ty = pad.y;
    arriveAtStation({ state: g.state, emit() {} }, v, st);
    expect(v.services).toBe(1);
    expect(v.breakdownTicks).toBe(0);
    expect(typeof v.lastServiceDay).toBe('number'); // stamped with the current game day (servicePerformed)
  });

  test('on: a helicopter on a plain tile (not a helipad) is not serviced', () => {
    const { g, st, v, pad } = heliSetup();
    setSetting(g.state, 'serviceAtHelipad', true);
    // a tile of the same airport that is not a helipad: the depot side, or any tile without a building
    v.tx = pad.x + 10; v.ty = pad.y + 10;
    arriveAtStation({ state: g.state, emit() {} }, v, st);
    expect(v.services).toBe(0);
  });
});
