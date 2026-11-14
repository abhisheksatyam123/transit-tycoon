/**
 * financeByVehicleType (opt-in, D7): the Finances window's this-year / last-year revenue-by-vehicle-type table.
 * It reads ledger byKind only; setting off creates no state, setting on changes no money or ledger value.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { unload } from '../js/simulation/orders.js';
import { closeLedgerMonth } from '../js/simulation/economy.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { kindTotalsForYear } from '../js/ui/windows/finances.js';

function setup(seed = 11, modelId = 'bus_city') {
  const g = flatGame(seed);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.b.id, full: false }]).ok).toBe(true);
  v.modelId = modelId;
  const ctx = { state: g.state, emit() {} };
  return { g, L, v, ctx };
}

function loadCoal(v, L, amount) {
  v.cargoId = 'COAL';
  v.load.amount = amount;
  v.load.sourceX = L.a.x;
  v.load.sourceY = L.a.y;
  v.load.sinceTick = 0;
  v.load.fromStationId = L.a.id;
}

describe('financeByVehicleType: setting', () => {
  test('defaults to off and is a boolean', () => {
    const { g } = setup();
    expect(getSetting(g.state, 'financeByVehicleType')).toBe(false);
  });

  test('setting off: a delivery creates no state.finByType and the ledger is as before', () => {
    const { g, L, v, ctx } = setup();
    loadCoal(v, L, 20);
    const before = g.state.company.ledger.current.income;
    unload(ctx, v, L.b);
    expect(g.state.finByType).toBeUndefined();
    const cur = g.state.company.ledger.current;
    expect(cur.income).toBeGreaterThan(before);
    expect(cur.byKind).toEqual({ bus: cur.income - before });
  });
});

describe('financeByVehicleType: on', () => {
  test('a bus delivery shows in the bus total for this year and no other type', () => {
    const { g, L, v, ctx } = setup();
    setSetting(g.state, 'financeByVehicleType', true);
    loadCoal(v, L, 20);
    const c = g.state.company;
    const year = g.state.date.year;
    const before = kindTotalsForYear(c, year, year);
    unload(ctx, v, L.b);
    const after = kindTotalsForYear(c, year, year);
    const earned = c.ledger.current.income;
    expect(after.bus - before.bus).toBe(earned);
    for (const k of Object.keys(after)) if (k !== 'bus') expect(after[k]).toBe(before[k]);
    expect(after.train).toBe(0);
  });

  test('turning the setting on changes no money or ledger value', () => {
    const run = (on) => {
      const { g, L, v, ctx } = setup(11);
      if (on) setSetting(g.state, 'financeByVehicleType', true);
      loadCoal(v, L, 20);
      unload(ctx, v, L.b);
      const c = g.state.company;
      return { money: c.money, income: c.ledger.current.income, expenses: c.ledger.current.expenses };
    };
    expect(run(true)).toEqual(run(false));
  });

  test('the read is pure: kindTotalsForYear does not mutate the company', () => {
    const { g, L, v, ctx } = setup();
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const c = g.state.company;
    const snap = JSON.stringify(c);
    kindTotalsForYear(c, g.state.date.year, g.state.date.year);
    expect(JSON.stringify(c)).toBe(snap);
  });
});

describe('financeByVehicleType: additive and per-year', () => {
  test('a closed month stays in its year; the next year shows it as last year', () => {
    const { g, L, v, ctx } = setup();
    const c = g.state.company;
    const year = g.state.date.year;
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const earned = c.ledger.current.byKind.bus;
    expect(earned).toBeGreaterThan(0);
    // close the month that holds the delivery (year `year`)
    closeLedgerMonth(g.state, { year, month: 11 });
    expect(kindTotalsForYear(c, year, year + 1).bus).toBe(earned);
    expect(kindTotalsForYear(c, year + 1, year + 1).bus).toBe(0);
    // a second delivery in the new year adds to this year, and last year stays fixed
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const second = c.ledger.current.byKind.bus;
    expect(kindTotalsForYear(c, year + 1, year + 1).bus).toBe(second);
    expect(kindTotalsForYear(c, year, year + 1).bus).toBe(earned);
  });
});
