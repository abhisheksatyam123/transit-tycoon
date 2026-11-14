/** Finance window display fixes (UI only): live interest label, Own value row, Max borrow / Max repay. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { MAX_LOAN, LOAN_STEP } from '../js/simulation/constants.js';
import { interestLabel, ownValue, maxBorrowAmount, maxRepayAmount } from '../js/ui/windows/finances.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

describe('finances window: interest label', () => {
  test('default shows 2% (OpenTTD initial_interest)', () => {
    const g = Game.create(small);
    expect(interestLabel(g.state)).toBe('2%');
  });
  test('shows the live loanInterestRate setting', () => {
    const g = Game.create(small);
    setSetting(g.state, 'loanInterestRate', 7);
    expect(interestLabel(g.state)).toBe('7%');
  });
});

describe('finances window: own value row', () => {
  test('equals money minus loan for a fixed state', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.money = 250000;
    c.loan = 120000;
    expect(ownValue(c)).toBe(130000);
    c.money = 50000;
    c.loan = 80000;
    expect(ownValue(c)).toBe(-30000);
  });
});

describe('finances window: max borrow / max repay', () => {
  test('max borrow raises the loan to maxLoan and only changes loan and money', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.loan = 100000; c.money = 400000; c.maxLoan = MAX_LOAN;
    const before = { money: c.money, loan: c.loan, expenses: c.ledger.current.expenses };
    const res = g.borrow(maxBorrowAmount(c));
    expect(res.ok).toBe(true);
    expect(c.loan).toBe(MAX_LOAN);
    expect(c.money - before.money).toBe(MAX_LOAN - before.loan); // cash received equals the new debt
    expect(c.ledger.current.expenses).toBe(before.expenses);      // no cost charged
  });
  test('max borrow with a non-step gap rounds down, never above maxLoan', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.loan = 100000; c.maxLoan = 305000;
    expect(maxBorrowAmount(c)).toBe(200000);
    expect(g.borrow(maxBorrowAmount(c)).ok).toBe(true);
    expect(c.loan).toBe(300000);
    expect(maxBorrowAmount(c)).toBe(0);
  });
  test('max repay with enough cash clears the loan', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.loan = 120000; c.money = 500000;
    expect(maxRepayAmount(c)).toBe(120000);
    const res = g.repay(maxRepayAmount(c));
    expect(res.ok).toBe(true);
    expect(c.loan).toBe(0);
    expect(c.money).toBe(380000);
  });
  test('max repay with short cash repays as far as cash allows in steps', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.loan = 200000; c.money = 75000;
    expect(maxRepayAmount(c)).toBe(70000);
    expect(g.repay(maxRepayAmount(c)).ok).toBe(true);
    expect(c.loan).toBe(130000);
    expect(c.money).toBe(5000);
  });
  test('step constant matches the window step', () => {
    expect(LOAN_STEP).toBe(10000);
  });
});
