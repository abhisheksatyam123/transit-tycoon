import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { createCompany } from '../js/simulation/economy.js';

describe('economy', () => {
  test('borrow respects LOAN_STEP and maxLoan', () => {
    const g = Game.create({ seed: 3, width: 64, height: 64 });
    const c = g.state.company;
    const start = c.loan;
    const m0 = c.money;
    const r = g.borrow(5000);
    expect(r.ok).toBe(true);
    expect(c.loan).toBe(start + 10000); // rounded up to step
    expect(c.money).toBe(m0 + 10000);
    expect(g.borrow(0).ok).toBe(false);
    const max = g.borrow(1e9);
    expect(max.ok).toBe(false);
    expect(c.loan).toBeLessThanOrEqual(c.maxLoan);
  });

  test('repay reduces loan and money; cannot repay below zero', () => {
    const g = Game.create({ seed: 3, width: 64, height: 64 });
    const c = g.state.company;
    const r = g.repay(20000);
    expect(r.ok).toBe(true);
    expect(c.loan).toBeGreaterThanOrEqual(0);
    g.repay(1e9);
    expect(c.loan).toBe(0);
  });

  test('createCompany has zeroed ledger and sane loan limits', () => {
    const c = createCompany('X');
    expect(c.name).toBe('X');
    expect(c.loan).toBeLessThanOrEqual(c.maxLoan);
    expect(c.ledger.current.income).toBe(0);
  });
});
