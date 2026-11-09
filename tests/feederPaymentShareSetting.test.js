/** Q3: economy.feeder_payment_share setting (OpenTTD economy_settings.ini:211, def 75%). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { transferCredit, unload, loadCargo } from '../js/simulation/orders.js';
import { waitingAmount } from '../js/simulation/stations.js';
import { serializeState, parseState } from '../js/simulation/save.js';

function setup(orders) {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, orders(L)).ok).toBe(true);
  const ctx = { state: g.state, emit() {} };
  return { g, L, v, ctx };
}
function loadCoal(v, L, amount, tick = 0) {
  v.cargoId = 'COAL';
  v.load.amount = amount;
  v.load.sourceX = L.a.x; v.load.sourceY = L.a.y; v.load.sinceTick = tick; v.load.fromStationId = L.a.id;
}

describe('feederPaymentShare setting', () => {
  test('default is 75 in DEFAULT_SETTINGS and getSetting', () => {
    expect(DEFAULT_SETTINGS.feederPaymentShare).toBe(75);
    const g = flatGame();
    expect(getSetting(g.state, 'feederPaymentShare')).toBe(75);
  });

  test('share 0 gives 0 transfer credit', () => {
    const { g, L, v } = setup(() => []);
    loadCoal(v, L, 20);
    setSetting(g.state, 'feederPaymentShare', 0);
    expect(transferCredit(g.state, v, L.b, 20, 0)).toBe(0);
  });

  test('share 50 gives 50% leg income credit', () => {
    const { g, L, v } = setup(() => []);
    loadCoal(v, L, 20);
    const full = transferCredit(g.state, v, L.b, 20, 0); // at default 75 gives 75%
    setSetting(g.state, 'feederPaymentShare', 50);
    const c50 = transferCredit(g.state, v, L.b, 20, 0);
    expect(c50).toBeGreaterThan(0);
    // c50 should be 50/75 of the 75% credit (allowing rounding)
    expect(Math.abs(c50 - Math.round((full * 50) / 75))).toBeLessThanOrEqual(1);
    // and exactly half of full income (income = credit at 100%)
    setSetting(g.state, 'feederPaymentShare', 100);
    const c100 = transferCredit(g.state, v, L.b, 20, 0);
    expect(c50).toBe(Math.round(c100 / 2));
  });

  test('share 100 gives 100% leg income credit', () => {
    const { g, L, v } = setup(() => []);
    loadCoal(v, L, 20);
    setSetting(g.state, 'feederPaymentShare', 100);
    const c100 = transferCredit(g.state, v, L.b, 20, 0);
    expect(c100).toBeGreaterThan(0);
    // income via 100% check: credit equals full leg payment
    // indirect: c100 > c75
    setSetting(g.state, 'feederPaymentShare', 75);
    const c75 = transferCredit(g.state, v, L.b, 20, 0);
    expect(c100).toBeGreaterThan(c75);
    expect(Math.abs(c75 - Math.round(c100 * 0.75))).toBeLessThanOrEqual(1);
  });

  test('multi-leg transfer: leg credits accumulate and final delivery reconciles', () => {
    const { g, L, v, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 20, 0);
    const money0 = g.state.company.money;
    // leg 1: transfer at B
    unload(ctx, v, L.b);
    expect(g.state.company.money).toBe(money0); // virtual credit, no cash
    const credit1 = v.transferCredits;
    expect(credit1).toBeGreaterThan(0);
    expect(waitingAmount(L.b, 'COAL')).toBe(20);
    const packet1 = L.b.cargo.COAL[L.b.cargo.COAL.length - 1];
    expect(packet1.feeder).toBe(credit1);

    // leg 2: second vehicle loads at B; its transfer credit subtracts feederHeld (OpenTTD PayTransfer)
    g.state.tick += 74 * 10; // 10 days later
    const v2 = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    v2.profitThisYear = 0;
    loadCargo(ctx, v2, L.b);
    expect(v2.load.amount).toBe(20);
    const feederHeld = v2.load.feeder || 0;
    expect(feederHeld).toBe(credit1);
    const expected2 = transferCredit(g.state, v2, L.b, 20, feederHeld);
    expect(expected2).toBeGreaterThan(0);
    // second leg credit is positive but smaller than a fresh credit (feeder already held)
    expect(expected2).toBeLessThan(transferCredit(g.state, v2, L.b, 20, 0));
    // v2 carries feederHeld from leg 1; its transfer credit (if it transferred now) would be expected2
    // final delivery uses v2 directly, so its profit delta should be pay - feederHeld

    // final delivery: v2 (now carrying the packet) delivers normally at B (accepts coal)
    expect(g.setOrders(v2.id, [{ stationId: L.b.id, full: false }]).ok).toBe(true);
    v2.load.fromStationId = 999999; // delivering vehicle did not load here (avoids same-station bounce)
    const money2 = g.state.company.money;
    const v2profitBefore = v2.profitThisYear || 0;
    const pay = unload(ctx, v2, L.b);
    expect(pay).toBeGreaterThan(0);
    expect(g.state.company.money).toBe(money2 + pay); // full journey paid on final delivery
    // delivering vehicle profit = full pay minus feederHeld credited to earlier feeder
    expect(v2.profitThisYear - v2profitBefore).toBe(pay - feederHeld);
    // vehicle profits sum to payment (feeder leg + delivering leg)
    expect(credit1 + (v2.profitThisYear - v2profitBefore)).toBe(pay);
  });

  test('SETTING_META options are [0,25,50,75,100] in Economy group', () => {
    const m = SETTING_META.find((x) => x.key === 'feederPaymentShare');
    expect(m).toBeDefined();
    expect(m.group).toBe('economy');
    expect(m.type).toBe('select');
    expect(m.options.map((o) => o[0])).toEqual(['0', '25', '50', '75', '100']);
    expect(m.label).toBe('Feeder payment share (%)');
  });

  test('save/load serialization keeps feederPaymentShare', () => {
    const g = flatGame();
    setSetting(g.state, 'feederPaymentShare', 25);
    const loaded = parseState(serializeState(g.state));
    expect(getSetting(loaded, 'feederPaymentShare')).toBe(25);
    // default when never set
    const g2 = flatGame();
    const loaded2 = parseState(serializeState(g2.state));
    expect(getSetting(loaded2, 'feederPaymentShare')).toBe(75);
  });
});
