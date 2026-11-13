/** D15 opt-in stationAutoRefit: a station order marked refitAuto refits an empty vehicle to the cargo with the most
 * waiting for its next stop (OpenTTD CARGO_AUTO_REFIT). Default off = the order field is inert. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';
import { loadingTick, normaliseOrders, orderFlagText, autoRefitTarget } from '../js/simulation/orders.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

/** Coal line with a train of 2 hoppers (COAL/IORE/GRAI capable) at station A; orders: A (refitAuto) then B. */
function setup(orderA = { full: false, refitAuto: true }) {
  const g = flatGame(31);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, ...orderA }, { stationId: L.b.id, full: false }]).ok).toBe(true);
  const ctx = { state: g.state, emit() {} };
  v.cargoId = 'COAL';
  v.load.amount = 0;
  v.atStationId = L.a.id;
  v.state = 'loading';
  v.loadingTicks = 1;
  v.orderIndex = 0;
  return { g, L, v, ctx };
}

describe('D15 stationAutoRefit (opt-in, default off)', () => {
  test('default off, exactly one settings entry', () => {
    expect(DEFAULT_SETTINGS.stationAutoRefit).toBe(false);
    expect(SETTING_META.filter((m) => m.key === 'stationAutoRefit').length).toBe(1);
  });

  test('normaliseOrders keeps refitAuto only on a stopping, loading station order', () => {
    const { g, L, v } = setup();
    const ok = normaliseOrders(g.state, v, [{ stationId: L.a.id, refitAuto: true }, { stationId: L.b.id }], () => 'rail');
    expect(ok.ok).toBe(true);
    expect(ok.orders[0].refitAuto).toBe(true);
    expect(ok.orders[1]).not.toHaveProperty('refitAuto');
    const plain = normaliseOrders(g.state, v, [{ stationId: L.a.id }, { stationId: L.b.id }], () => 'rail');
    expect(plain.ok).toBe(true);
    expect(plain.orders[0]).not.toHaveProperty('refitAuto');
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, refitAuto: true, load: 'none' }, { stationId: L.b.id }], () => 'rail').ok).toBe(false);
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, refitAuto: true, stop: 'via' }, { stationId: L.b.id }], () => 'rail').ok).toBe(false);
    expect(normaliseOrders(g.state, v, [{ stationId: L.a.id, refitAuto: 'yes' }, { stationId: L.b.id }], () => 'rail').ok).toBe(false);
  });

  test('orderFlagText shows auto refit', () => {
    expect(orderFlagText({ stationId: 1, refitAuto: true })).toContain('auto refit');
    expect(orderFlagText({ stationId: 1 })).not.toContain('auto refit');
  });

  test('setting off (default): an empty vehicle keeps its cargo even when another cargo waits', () => {
    const { g, L, v, ctx } = setup();
    addWaiting(L.a, 'IORE', 50, L.a.x, L.a.y, 0, 9999);
    const before = g.state.company.money;
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.cargoId).toBe('COAL');
    expect(g.state.company.money).toBe(before);
  });

  test('setting on: an empty vehicle refits to the cargo with most waiting and loads it, paying the refit price', () => {
    const { g, L, v, ctx } = setup();
    setSetting(g.state, 'stationAutoRefit', true);
    addWaiting(L.a, 'IORE', 50, L.a.x, L.a.y, 0, 9999);
    const before = g.state.company.money;
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.cargoId).toBe('IORE');
    expect(v.load.amount).toBeGreaterThan(0);
    expect(v.load.amount).toBeLessThanOrEqual(v.capacity);
    expect(g.state.company.money).toBeLessThan(before);
  });

  test('setting on: a tie keeps the current cargo (no refit)', () => {
    const { g, L, v, ctx } = setup();
    setSetting(g.state, 'stationAutoRefit', true);
    addWaiting(L.a, 'COAL', 20, L.a.x, L.a.y, 0, 9999);
    addWaiting(L.a, 'IORE', 20, L.a.x, L.a.y, 0, 9999);
    expect(autoRefitTarget(g.state, v, L.a)).toBe(null);
  });

  test('setting on: no refit when the order has no refitAuto', () => {
    const { g, L, v, ctx } = setup({ full: false });
    setSetting(g.state, 'stationAutoRefit', true);
    addWaiting(L.a, 'IORE', 50, L.a.x, L.a.y, 0, 9999);
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.cargoId).toBe('COAL');
  });

  test('setting on: a vehicle still carrying cargo is not refitted (cargo is never dropped)', () => {
    const { g, L, v, ctx } = setup();
    setSetting(g.state, 'stationAutoRefit', true);
    v.load.amount = 5;
    addWaiting(L.a, 'IORE', 50, L.a.x, L.a.y, 0, 9999);
    expect(loadingTick(ctx, v)).toBe(true);
    expect(v.cargoId).toBe('COAL');
  });

  test('setting on: no waiting cargo anywhere keeps the current cargo', () => {
    const { g, L, v } = setup();
    setSetting(g.state, 'stationAutoRefit', true);
    expect(waitingAmount(L.a, 'IORE')).toBe(0);
    expect(autoRefitTarget(g.state, v, L.a)).toBe(null);
  });
});
