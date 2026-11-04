import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { CARGO_BY_ID } from '../js/config/cargos.js';
import { timeFactor, cargoPayment, createCompany } from '../js/simulation/economy.js';

describe('economy', () => {
  test('timeFactor is 1 within days1 and non-increasing afterwards', () => {
    for (const id of Object.keys(CARGO_BY_ID)) {
      const c = CARGO_BY_ID[id];
      expect(timeFactor(c, 0)).toBe(1);
      expect(timeFactor(c, c.days1)).toBe(1);
      let prev = Infinity;
      for (let d = 0; d <= 600; d++) {
        const f = timeFactor(c, d);
        expect(f).toBeLessThanOrEqual(prev + 1e-12);
        expect(f).toBeGreaterThanOrEqual(31 / 255 - 1e-12);
        prev = f;
      }
    }
  });

  test('cargoPayment is positive for valid delivery and zero otherwise', () => {
    const p = cargoPayment('COAL', 30, 20, 5);
    expect(p).toBeGreaterThan(0);
    expect(Number.isInteger(p)).toBe(true);
    expect(cargoPayment('COAL', 0, 20, 5)).toBe(0);
    expect(cargoPayment('COAL', 30, 0, 5)).toBe(0);
    expect(cargoPayment('NOPE', 30, 20, 5)).toBe(0);
  });

  test('cargoPayment decreases with transit time', () => {
    expect(cargoPayment('COAL', 30, 20, 200)).toBeLessThan(cargoPayment('COAL', 30, 20, 5));
  });

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
