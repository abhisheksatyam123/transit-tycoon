/** D6: Borrow and the Finance "Max borrow" / "Max loan" enforce the same cap; inflationAdjustsMaxLoan OFF keeps the flat cap. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { effectiveMaxLoan } from '../js/simulation/prices.js';
import { maxLoanCap, borrow, createCompany } from '../js/simulation/economy.js';
import { maxBorrowAmount } from '../js/ui/windows/finances.js';
import { MAX_LOAN, LOAN_STEP } from '../js/simulation/constants.js';
import { ensureEconomy, COST_INDEX } from '../js/simulation/loco/economy.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

/** Double the general cost factor so inflation-adjusted cap is clearly above the flat cap. */
function inflate(g) {
  const e = ensureEconomy(g.state);
  e.factors[COST_INDEX.general] = e.base[COST_INDEX.general] * 2;
}

/** Borrow in LOAN_STEP increments until refused; returns the final loan. */
function borrowToLimit(g) {
  const c = g.state.company;
  c.money = 1e12;
  let guard = 0;
  while (g.borrow(LOAN_STEP).ok && guard++ < 1000) { /* keep borrowing */ }
  return c.loan;
}

describe('D6 borrow respects inflation max', () => {
  test('default value of inflationAdjustsMaxLoan is still false', () => {
    expect(DEFAULT_SETTINGS.inflationAdjustsMaxLoan).toBe(false);
    const g = Game.create(small);
    expect(getSetting(g.state, 'inflationAdjustsMaxLoan')).toBe(false);
  });

  test('setting OFF: borrow cap is the flat company.maxLoan', () => {
    const g = Game.create(small);
    const c = g.state.company;
    expect(maxLoanCap(g.state, c)).toBe(c.maxLoan);
    expect(effectiveMaxLoan(g.state)).toBe(MAX_LOAN);
    expect(borrowToLimit(g)).toBe(c.maxLoan - (c.maxLoan % LOAN_STEP));
  });

  test('setting ON: borrow cap equals effectiveMaxLoan', () => {
    const g = Game.create(small);
    setSetting(g.state, 'inflationAdjustsMaxLoan', true);
    inflate(g);
    const c = g.state.company;
    const eff = effectiveMaxLoan(g.state);
    expect(eff).toBeGreaterThan(c.maxLoan);
    expect(maxLoanCap(g.state, c)).toBe(eff);
    expect(borrowToLimit(g)).toBe(eff - (eff % LOAN_STEP));
  });

  test('setting ON: Max borrow display matches what Borrow allows', () => {
    const g = Game.create(small);
    setSetting(g.state, 'inflationAdjustsMaxLoan', true);
    inflate(g);
    const c = g.state.company;
    c.money = 1e12;
    c.loan = 0;
    const cap = maxLoanCap(g.state, c);
    const shown = maxBorrowAmount(c, cap);
    expect(shown).toBe(cap - (cap % LOAN_STEP));
    expect(g.borrow(shown).ok).toBe(true);
    expect(c.loan).toBe(shown);
    expect(g.borrow(LOAN_STEP).ok).toBe(false); // nothing left to borrow
  });

  test('setting OFF even with inflation: borrow cap stays flat', () => {
    const g = Game.create(small);
    inflate(g);
    const c = g.state.company;
    expect(maxLoanCap(g.state, c)).toBe(c.maxLoan);
    expect(borrowToLimit(g)).toBe(c.maxLoan - (c.maxLoan % LOAN_STEP));
  });

  test('setting OFF: Max borrow display matches flat cap', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.money = 1e12;
    c.loan = 0;
    const shown = maxBorrowAmount(c, maxLoanCap(g.state, c));
    expect(shown).toBe(maxBorrowAmount(c));
    expect(g.borrow(shown).ok).toBe(true);
    expect(c.loan).toBe(shown);
  });

  test('rival company borrow (no state passed) keeps the flat cap', () => {
    const c = createCompany('R');
    c.loan = 0; c.money = 0;
    while (borrow(c, LOAN_STEP).ok) { /* fill */ }
    expect(c.loan).toBeLessThanOrEqual(c.maxLoan);
  });

  test('rival company borrow with state and setting ON uses effective cap', () => {
    const g = Game.create(small);
    setSetting(g.state, 'inflationAdjustsMaxLoan', true);
    inflate(g);
    const r = createCompany('R');
    r.loan = 0; r.money = 0;
    const eff = effectiveMaxLoan(g.state);
    while (borrow(r, LOAN_STEP, g.state).ok) { /* fill */ }
    expect(r.loan).toBe(eff - (eff % LOAN_STEP));
  });
});
