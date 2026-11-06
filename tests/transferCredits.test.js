/** Transfer credits (OpenTTD feeder share): virtual credit for the transferring vehicle, full payment on delivery. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { unload, loadCargo, transferCredit, FEEDER_PAYMENT_SHARE } from '../js/simulation/orders.js';
import { waitingAmount } from '../js/simulation/stations.js';

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
  v.load.sourceX = L.a.x;
  v.load.sourceY = L.a.y;
  v.load.sinceTick = tick;
  v.load.fromStationId = L.a.id;
}

describe('transfer credits', () => {
  test('FEEDER_PAYMENT_SHARE defaults to 75%', () => {
    expect(FEEDER_PAYMENT_SHARE).toBe(75);
  });

  test('transfer gives the feeder a virtual credit, not cash', () => {
    const { g, L, v, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 20);
    const money = g.state.company.money;
    unload(ctx, v, L.b);
    expect(g.state.company.money).toBe(money);
    expect(v.transferCredits).toBeGreaterThan(0);
    expect(v.profitThisYear).toBe(v.transferCredits);
    expect(waitingAmount(L.b, 'COAL')).toBe(20);
  });

  test('credit equals 75% of the leg payment', () => {
    const { g, L, v, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 20);
    const expected = transferCredit(g.state, v, L.b, 20, 0);
    unload(ctx, v, L.b);
    expect(expected).toBeGreaterThan(0);
    expect(v.transferCredits).toBe(expected);
  });

  test('the packet carries the feeder share (lazy field)', () => {
    const { v, L, ctx } = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(v, L, 20);
    unload(ctx, v, L.b);
    const packet = L.b.cargo.COAL[L.b.cargo.COAL.length - 1];
    expect(packet.feeder).toBe(v.transferCredits);
    expect(packet.sourceX).toBe(L.a.x);
  });

  test('a normal delivery leaves no transfer fields behind', () => {
    const { v, L, ctx, g } = setup((L) => [{ stationId: L.b.id, full: false }]);
    loadCoal(v, L, 20);
    const before = g.state.company.money;
    unload(ctx, v, L.b);
    expect(v.transferCredits).toBeUndefined();
    expect(v.load.feeder).toBeUndefined();
    expect(g.state.company.money).toBeGreaterThan(before);
  });

  test('chain: company income equals the direct payment; vehicle profits sum to it', () => {
    // Direct: coal A -> power station B, delivered at B on one vehicle.
    const direct = setup((L) => [{ stationId: L.b.id, full: false }]);
    loadCoal(direct.v, direct.L, 20);
    const d0 = direct.g.state.company.money;
    unload(direct.ctx, direct.v, direct.L.b);
    const directPay = direct.g.state.company.money - d0;
    expect(directPay).toBeGreaterThan(0);

    // Chain: feeder carries A -> B and transfers at B (no cash). The delivering vehicle then loads at B and
    // delivers at B's accepting station. Here the delivery is simulated on the same accepting station B,
    // because only B accepts coal; so the cargo is re-loaded from B and delivered back at B.
    const chain = setup((L) => [{ stationId: L.b.id, full: false, unload: 'transfer' }]);
    loadCoal(chain.v, chain.L, 20);
    const c0 = chain.g.state.company.money;
    unload(chain.ctx, chain.v, chain.L.b);
    expect(chain.g.state.company.money).toBe(c0);
    const feederCredit = chain.v.transferCredits;
    expect(feederCredit).toBeGreaterThan(0);

    const dv = chain.g.buyVehicle(chain.L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' }).vehicle;
    dv.profitThisYear = 0;
    loadCargo(chain.ctx, dv, chain.L.b);
    expect(dv.load.amount).toBe(20);
    expect(dv.load.feeder).toBe(feederCredit);

    // the delivering vehicle delivers at B (accepts coal); it did not load at B's cargo source, so no same-station bounce
    dv.load.fromStationId = 999999;
    const before = chain.g.state.company.money;
    unload(chain.ctx, dv, chain.L.b);
    const cashIn = chain.g.state.company.money - before;
    expect(cashIn).toBe(directPay);
    expect(feederCredit + dv.profitThisYear).toBe(directPay);
  });
});
