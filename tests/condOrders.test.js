/** Conditional orders (OpenTTD OT_CONDITIONAL): variables, jump vs fall-through, loop guard, renumbering, save round trip. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { condOperand, condTrue, resolveConditionals, deleteOrderAt, moveOrderTo, normaliseCond, condText, isCond } from '../js/simulation/condOrders.js';

function setup() {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('conditional order normalisation', () => {
  test('accepts known variables and comparators, rejects unknown', () => {
    expect(normaliseCond({ v: 'load', cmp: '<', val: 50, to: 0 }).ok).toBe(true);
    expect(normaliseCond({ v: 'nope', cmp: '<', val: 1, to: 0 }).ok).toBe(false);
    expect(normaliseCond({ v: 'load', cmp: '~', val: 1, to: 0 }).ok).toBe(false);
    expect(normaliseCond({ v: 'load', cmp: '<', val: -3, to: 0 }).ok).toBe(false);
  });
  test('boolean variables are forced to == with 0/1', () => {
    const r = normaliseCond({ v: 'service', cmp: '<', val: 7, to: 0 });
    expect(r.entry.cond.cmp).toBe('==');
    expect(r.entry.cond.val).toBe(1);
  });
  test('UI text', () => {
    expect(condText({ v: 'load', cmp: '<', val: 50, to: 2 })).toBe('Jump to order 3 if load % < 50');
    expect(condText({ v: 'service', cmp: '==', val: 1, to: 0 })).toBe('Jump to order 1 if requires service is true');
  });
});

describe('condition operands and jumps', () => {
  test('load percentage follows loaded amount over capacity', () => {
    const { g, v } = setup();
    v.load.amount = 0;
    expect(condOperand(g.state, v, 'load')).toBe(0);
    v.load.amount = v.capacity;
    expect(condOperand(g.state, v, 'load')).toBe(100);
  });
  test('reliability, age (years), maxSpeed and always', () => {
    const { g, v } = setup();
    v.reliability = 0.5;
    expect(condOperand(g.state, v, 'reliability')).toBe(50);
    v.age = 365 * 3 + 10;
    expect(condOperand(g.state, v, 'age')).toBe(3);
    expect(condOperand(g.state, v, 'maxSpeed')).toBeGreaterThan(0);
    expect(condOperand(g.state, v, 'always')).toBe(1);
  });
  test('comparators', () => {
    const { g, v } = setup();
    v.load.amount = 0;
    expect(condTrue(g.state, v, { v: 'load', cmp: '<', val: 50 })).toBe(true);
    expect(condTrue(g.state, v, { v: 'load', cmp: '>=', val: 1 })).toBe(false);
    expect(condTrue(g.state, v, { v: 'load', cmp: '!=', val: 0 })).toBe(false);
  });
  test('jump when true, fall through when false', () => {
    const { g, L, v } = setup();
    // A: station, 0: conditional load < 50 -> jump to 2 (B); 1: station A; 2: station B
    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'load', cmp: '<', val: 50, to: 3 } },
      { stationId: L.a.id },
      { stationId: L.b.id },
    ]).ok).toBe(true);
    v.load.amount = 0;
    v.orderIndex = 1;
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(3); // load 0 < 50 -> jumps to order 3
    v.load.amount = v.capacity;
    v.orderIndex = 1;
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(2); // full -> falls through to station A
  });
  test('loop guard: a cycle of conditionals terminates', () => {
    const { g, L, v } = setup();
    g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'always', cmp: '==', val: 1, to: 2 } },
      { cond: { v: 'always', cmp: '==', val: 1, to: 1 } },
    ]);
    v.orderIndex = 1;
    const ok = resolveConditionals(g.state, v); // must return, not hang
    expect(typeof ok).toBe('boolean');
    expect(isCond(v.orders[v.orderIndex])).toBe(false);
  });
});

describe('renumbering', () => {
  const base = () => [
    { stationId: 1 },
    { cond: { v: 'load', cmp: '<', val: 50, to: 3 } },
    { stationId: 2 },
    { stationId: 3 },
  ];
  test('delete an order before the target shifts the target back', () => {
    const out = deleteOrderAt(base(), 0);
    expect(out[0].cond.to).toBe(2);
  });
  test('delete the target shifts the target back', () => {
    const out = deleteOrderAt(base(), 3); // the target itself is removed: OpenTTD renumbers it to order_id-1
    expect(out.length).toBe(3);
    expect(out[1].cond.to).toBe(2);
  });
  test('move follows the order the target pointed at', () => {
    const out = moveOrderTo(base(), 3, 2); // station 3 moves before station 2
    const c = out.find(isCond);
    expect(out[c.cond.to].stationId).toBe(3);
  });
  test('move a conditional itself', () => {
    const out = moveOrderTo(base(), 1, 0);
    expect(isCond(out[0])).toBe(true);
    expect(out[0].cond.to).toBe(3);
  });
  test('a target pointing at its own order moves on', () => {
    const list = [{ stationId: 1 }, { cond: { v: 'load', cmp: '<', val: 50, to: 1 } }, { stationId: 2 }];
    const out = deleteOrderAt(list, 0);
    expect(out[0].cond.to).not.toBe(0);
  });
  test('setOrders rejects a target past the end', () => {
    const { g, L, v } = setup();
    const r = g.setOrders(v.id, [{ stationId: L.a.id }, { cond: { v: 'load', cmp: '<', val: 5, to: 9 } }]);
    expect(r.ok).toBe(false);
  });
});

describe('save round trip', () => {
  test('conditional order survives serialise / deserialise', () => {
    const { g, L, v } = setup();
    expect(g.setOrders(v.id, [{ stationId: L.a.id }, { cond: { v: 'reliability', cmp: '>', val: 70, to: 0 } }]).ok).toBe(true);
    const g2 = Game.deserialize(g.serialize());
    const bv = g2.state.vehicles.find((x) => x.id === v.id);
    expect(bv.orders[1].cond).toEqual({ v: 'reliability', cmp: '>', val: 70, to: 0 });
  });
});

test('no conditional orders: plain lists keep their behaviour (lazy field)', () => {
  const { g, L, v } = setup();
  g.setOrders(v.id, [{ stationId: L.a.id }, { stationId: L.b.id }]);
  expect(v.orders.some(isCond)).toBe(false);
  expect(resolveConditionals(g.state, v)).toBe(true);
  expect(v.orderIndex).toBe(0);
});
