/**
 * D7 Phase 2: sparse revenue-by-vehicle-type (`ledger.current.byKind`). Attribution happens in deliverLoad,
 * months copy it only when present, and idle/default ledgers never gain the key (save bytes and hash unchanged).
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { unload } from '../js/simulation/orders.js';
import {
  createCompany, earn, closeLedgerMonth, noteRevenueKind, revenueKindOfModel, REVENUE_KINDS,
} from '../js/simulation/economy.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { groupQuarters } from '../js/ui/windows/finances.js';
import { serializeState, parseState } from '../js/simulation/save.js';

function setup(seed = 11) {
  const g = flatGame(seed);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.b.id, full: false }]).ok).toBe(true);
  const ctx = { state: g.state, emit() {} };
  return { g, L, v, ctx };
}

function loadCoal(v, L, amount, tick = 0) {
  v.cargoId = 'COAL';
  v.load.amount = amount;
  v.load.sourceX = L.a.x;
  v.load.sourceY = L.a.y;
  v.load.sinceTick = tick;
  v.load.fromStationId = L.a.id;
}

const sumKinds = (byKind) => Object.values(byKind || {}).reduce((a, v) => a + (Number(v) || 0), 0);

describe('D7 per-vehicle-type revenue: model kinds', () => {
  test('model kinds map to the stable UI buckets (engines/wagons -> train)', () => {
    expect(REVENUE_KINDS).toEqual(['train', 'tram', 'bus', 'truck', 'ship', 'aircraft']);
    for (const [id, expected] of [
      ['eng_puffer', 'train'], ['wag_hopper', 'train'], ['tram_horse', 'tram'], ['bus_city', 'bus'],
      ['trk_bulk', 'truck'], ['ac_li2', 'aircraft'],
    ]) expect(revenueKindOfModel(MODEL_BY_ID[id])).toBe(expected);
    const ship = Object.values(MODEL_BY_ID).find((m) => m.kind === 'ship');
    expect(revenueKindOfModel(ship)).toBe('ship');
    expect(revenueKindOfModel(null)).toBe(null);
    expect(revenueKindOfModel({ kind: 'unknown' })).toBe(null);
  });
});

describe('D7 per-vehicle-type revenue: deliveries', () => {
  test('a delivered cargo books its full payment under the unloading model kind', () => {
    const { g, L, v, ctx } = setup();
    loadCoal(v, L, 20);
    const before = g.state.company.ledger.current.income;
    unload(ctx, v, L.b);
    const cur = g.state.company.ledger.current;
    expect(cur.income).toBeGreaterThan(before);
    expect(cur.byKind).toEqual({ train: cur.income - before });
    // the invariant: sum of the buckets equals income exactly
    expect(sumKinds(cur.byKind)).toBe(cur.income);
  });

  test('road/tram/ship/aircraft models book into their own bucket, not a lumped road bucket', () => {
    for (const id of ['bus_city', 'trk_bulk', 'tram_horse', 'ac_li2']) {
      const { g, L, v, ctx } = setup();
      v.modelId = id;
      loadCoal(v, L, 20);
      unload(ctx, v, L.b);
      const cur = g.state.company.ledger.current;
      expect(cur.byKind).toEqual({ [revenueKindOfModel(MODEL_BY_ID[id])]: cur.income });
    }
  });

  test('the full payment is attributed even when a feeder share is carried (sum stays == income)', () => {
    const { g, L, v, ctx } = setup();
    loadCoal(v, L, 20);
    v.load.feeder = 123; // earlier transfer credit already paid to another vehicle
    unload(ctx, v, L.b);
    const cur = g.state.company.ledger.current;
    expect(sumKinds(cur.byKind)).toBe(cur.income);
    expect(cur.byKind.train).toBe(cur.income);
  });

  test('selling a vehicle does not touch byKind', () => {
    const { g, L, v, ctx } = setup();
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const before = JSON.stringify(g.state.company.ledger.current.byKind);
    expect(g.sellVehicle(v.id).ok).toBe(true);
    expect(JSON.stringify(g.state.company.ledger.current.byKind)).toBe(before);
  });
});

describe('D7 per-vehicle-type revenue: sparse ledger lifecycle', () => {
  test('a fresh company ledger has no byKind key at all', () => {
    const c = createCompany();
    expect('byKind' in c.ledger.current).toBe(false);
  });

  test('noteRevenueKind creates the map lazily, on first revenue only', () => {
    const c = createCompany();
    noteRevenueKind(c, 'train', 0);
    expect('byKind' in c.ledger.current).toBe(false);
    noteRevenueKind(c, 'train', 500);
    expect(c.ledger.current.byKind).toEqual({ train: 500 });
  });

  test('month close copies byKind only when present and resets the current month to a bare ledger', () => {
    const c = createCompany();
    earn(c, 900);
    noteRevenueKind(c, 'bus', 900);
    closeLedgerMonth({ company: c }, { year: 2026, month: 3 });
    const closed = c.ledger.history[c.ledger.history.length - 1];
    expect(closed.byKind).toEqual({ bus: 900 });
    expect('byKind' in c.ledger.current).toBe(false);

    const idle = createCompany();
    earn(idle, 1000);
    closeLedgerMonth({ company: idle }, { year: 2026, month: 4 });
    expect('byKind' in idle.ledger.history[idle.ledger.history.length - 1]).toBe(false);
  });

  test('quarterly buckets sum the sparse byKind entries', () => {
    const history = [
      { year: 2026, month: 0, income: 100, expenses: 0, byType: {}, byKind: { train: 60, bus: 40 } },
      { year: 2026, month: 1, income: 50, expenses: 0, byType: {}, byKind: { train: 50 } },
      { year: 2026, month: 2, income: 10, expenses: 0, byType: {} }, // old / unattributed month
    ];
    const [q] = groupQuarters(history);
    expect(q.byKind).toEqual({ train: 110, bus: 40 });
    expect(Object.values(q.byKind).reduce((a, v) => a + v, 0)).toBe(150);
  });

  test('save/load round-trip preserves byKind; a default save has no byKind key', () => {
    // default game: no deliveries -> the serialized company ledger has no byKind at all
    const plain = flatGame(3);
    const plainJson = serializeState(plain.state);
    expect(plainJson.includes('byKind')).toBe(false);

    const { g, L, v, ctx } = setup();
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const expected = { ...g.state.company.ledger.current.byKind };
    const loaded = parseState(serializeState(g.state));
    expect(loaded.company.ledger.current.byKind).toEqual(expected);
  });

  test('loading an old save without byKind yields an empty breakdown, no key written', () => {
    const g = flatGame(4);
    const json = JSON.parse(serializeState(g.state));
    delete json.company.ledger.current.byKind;
    const loaded = parseState(JSON.stringify(json));
    expect('byKind' in loaded.company.ledger.current).toBe(false);
    expect(loaded.company.ledger.current.byKind).toBeUndefined();
  });
});
