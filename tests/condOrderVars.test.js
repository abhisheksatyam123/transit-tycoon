/** Conditional order variables lifetime (OCV_REMAINING_LIFETIME) and maxReliability (OCV_MAX_RELIABILITY): values, normalisation, text, jumps. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { condOperand, condTrue, resolveConditionals, normaliseCond, condText, COND_VARS } from '../js/simulation/condOrders.js';

function setup() {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('lifetime and maxReliability variables', () => {
  test('registered in COND_VARS', () => {
    expect(COND_VARS).toContain('lifetime');
    expect(COND_VARS).toContain('maxReliability');
  });
  test('normalisation: lifetime accepts negative values, maxReliability does not', () => {
    expect(normaliseCond({ v: 'lifetime', cmp: '<', val: -5, to: 0 }).ok).toBe(true);
    expect(normaliseCond({ v: 'lifetime', cmp: '<', val: -5, to: 0 }).entry.cond.val).toBe(-5);
    expect(normaliseCond({ v: 'lifetime', cmp: '<', val: -100001, to: 0 }).ok).toBe(false);
    expect(normaliseCond({ v: 'maxReliability', cmp: '>', val: -1, to: 0 }).ok).toBe(false);
    expect(normaliseCond({ v: 'maxReliability', cmp: '>', val: 80, to: 0 }).ok).toBe(true);
  });
  test('UI text', () => {
    expect(condText({ v: 'lifetime', cmp: '<', val: 0, to: 0 })).toBe('Jump to order 1 if remaining lifetime (years) < 0');
    expect(condText({ v: 'maxReliability', cmp: '>=', val: 75, to: 1 })).toBe('Jump to order 2 if max reliability % >= 75');
  });
  test('lifetime operand: whole years to max age, negative past it, truncated toward zero', () => {
    const { g, v } = setup();
    v.maxAge = 25 * 365;
    v.age = 0;
    expect(condOperand(g.state, v, 'lifetime')).toBe(25);
    v.age = 10 * 365 + 200; // 14.45 years left -> 14
    expect(condOperand(g.state, v, 'lifetime')).toBe(14);
    v.age = 25 * 365 + 1; // 1 day past -> 0 (trunc)
    expect(condOperand(g.state, v, 'lifetime')).toBe(0);
    v.age = 27 * 365; // 2 years past -> -2
    expect(condOperand(g.state, v, 'lifetime')).toBe(-2);
    v.age = 27 * 365 + 300; // -2.82 -> -2 (toward zero)
    expect(condOperand(g.state, v, 'lifetime')).toBe(-2);
  });
  test('maxReliability operand: model max reliability percent, not current', () => {
    const { g, v } = setup();
    v.baseReliability = 0.8;
    v.reliability = 0.31;
    expect(condOperand(g.state, v, 'maxReliability')).toBe(80);
    expect(condOperand(g.state, v, 'reliability')).toBe(31);
  });
  test('jumps: lifetime < 0 jumps only once past max age; maxReliability comparison', () => {
    const { g, L, v } = setup();
    expect(g.setOrders(v.id, [
      { stationId: L.a.id },
      { cond: { v: 'lifetime', cmp: '<', val: 0, to: 3 } },
      { stationId: L.a.id },
      { stationId: L.b.id },
    ]).ok).toBe(true);
    v.maxAge = 15 * 365;
    v.age = 14 * 365;
    v.orderIndex = 1;
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(2); // 1 year left -> falls through
    v.age = 16 * 365;
    v.orderIndex = 1;
    resolveConditionals(g.state, v);
    expect(v.orderIndex).toBe(3); // -1 -> jumps
    v.baseReliability = 0.9;
    expect(condTrue(g.state, v, { v: 'maxReliability', cmp: '>=', val: 90 })).toBe(true);
    expect(condTrue(g.state, v, { v: 'maxReliability', cmp: '<', val: 90 })).toBe(false);
  });
});
