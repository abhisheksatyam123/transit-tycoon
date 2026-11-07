import { describe, test, expect } from 'bun:test';
import { refusalLabel, priceWhenRefused, NOT_ENOUGH_MONEY } from '../js/ui/tools/refusal.js';

describe('refusal text (F14)', () => {
  test('money refusal names cost and balance', () => {
    const s = refusalLabel(NOT_ENOUGH_MONEY, 60000, 1000);
    expect(s).toBe('Not enough money: costs $60,000, you have $1,000');
  });
  test('other refusals pass through unchanged', () => {
    expect(refusalLabel('Tile occupied by a station', null, 5)).toBe('Tile occupied by a station');
    expect(refusalLabel(undefined, null, 5)).toBe('Not possible');
  });
  test('money refusal without a known cost falls back to the plain reason', () => {
    expect(refusalLabel(NOT_ENOUGH_MONEY, null, 5)).toBe(NOT_ENOUGH_MONEY);
  });
});

describe('priceWhenRefused (F14)', () => {
  test('returns the price and restores the balance', () => {
    const game = { state: { company: { money: 500 } } };
    let seen = null;
    const cost = priceWhenRefused(game, (o) => { seen = game.state.company.money; return { ok: true, cost: 9000 }; });
    expect(cost).toBe(9000);
    expect(seen).toBe(Infinity);
    expect(game.state.company.money).toBe(500);
  });
  test('restores the balance even when the dry run throws', () => {
    const game = { state: { company: { money: 42 } } };
    expect(() => priceWhenRefused(game, () => { throw new Error('boom'); })).toThrow('boom');
    expect(game.state.company.money).toBe(42);
  });
  test('null when the build is refused for another reason', () => {
    const game = { state: { company: { money: 1 } } };
    expect(priceWhenRefused(game, () => ({ ok: false, error: 'Out of map bounds' }))).toBeNull();
    expect(game.state.company.money).toBe(1);
  });
  test('null without a company', () => {
    expect(priceWhenRefused({ state: {} }, () => ({ ok: true, cost: 1 }))).toBeNull();
  });
});
