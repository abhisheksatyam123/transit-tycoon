// Bankruptcy and negative-cash opt-in rules (OpenTTD economy.cpp). Defaults reproduce the TT behaviour.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { updateMonthly1 as companyMonthly, declareBankrupt } from '../js/simulation/loco/companyManager.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const small = { seed: 7, width: 64, height: 64, townCount: 3, industryCount: 4 };
const KEYS = ['bankruptcyNegativeLoanRule', 'bankruptcySinglePlayerContinue', 'negativeCashInterest'];

/** Company primed to hit the 9-month bankruptcy on the next monthly update. */
function primed(g, { money, loan = 0, maxLoan = 100000, months = 8 }) {
  const c = g.state.company;
  c.money = money;
  c.loan = loan;
  c.maxLoan = maxLoan;
  c.numMonthsInTheRed = months;
  c.bankrupt = false;
  return c;
}

describe('ad-bankrupt: defaults and settings UI', () => {
  test('each rule defaults to false (TT behaviour)', () => {
    for (const k of KEYS) expect(DEFAULT_SETTINGS[k]).toBe(false);
  });

  test('each key has exactly one SETTING_META entry in the economy group', () => {
    for (const k of KEYS) {
      const hits = SETTING_META.filter((m) => m.key === k);
      expect(hits.length).toBe(1);
      expect(hits[0].group).toBe('economy');
    }
  });
});

describe('bankruptcyNegativeLoanRule', () => {
  test('default: money -1 is bankrupt after 9 months in the red', () => {
    const g = Game.create(small);
    const c = primed(g, { money: -1 });
    companyMonthly(g);
    expect(c.bankrupt).toBe(true);
  });

  test('default: negative money with a loan above -maxLoan is still bankrupt', () => {
    const g = Game.create(small);
    const c = primed(g, { money: -1000, loan: 50000, maxLoan: 100000 });
    companyMonthly(g);
    expect(c.bankrupt).toBe(true);
  });

  test('rule on: money below zero but money - loan >= -maxLoan is not bankrupt', () => {
    const g = Game.create(small);
    setSetting(g.state, 'bankruptcyNegativeLoanRule', true);
    const c = primed(g, { money: -1000, loan: 50000, maxLoan: 100000 });
    companyMonthly(g);
    expect(c.bankrupt).toBe(false);
    expect(c.numMonthsInTheRed).toBe(0);
  });

  test('rule on: money - loan below -maxLoan is bankrupt', () => {
    const g = Game.create(small);
    setSetting(g.state, 'bankruptcyNegativeLoanRule', true);
    const c = primed(g, { money: -1000, loan: 120000, maxLoan: 100000 });
    companyMonthly(g);
    expect(c.bankrupt).toBe(true);
  });
});

describe('bankruptcySinglePlayerContinue', () => {
  test('off: the local company bankruptcy sets game over', () => {
    const g = Game.create(small);
    const c = primed(g, { money: -1 });
    companyMonthly(g);
    expect(c.bankrupt).toBe(true);
  });

  test('on: the local company bankruptcy does not set game over and says so in the news', () => {
    const g = Game.create(small);
    setSetting(g.state, 'bankruptcySinglePlayerContinue', true);
    const c = primed(g, { money: -1 });
    companyMonthly(g);
    expect(c.bankrupt).toBe(false);
    expect(c.numMonthsInTheRed).toBe(9);
    expect(g.state.news.some((n) => /single-player rule/.test(n.text))).toBe(true);
  });

  test('on: a direct declareBankrupt also leaves the company running', () => {
    const g = Game.create(small);
    setSetting(g.state, 'bankruptcySinglePlayerContinue', true);
    declareBankrupt(g, g.state.company);
    expect(g.state.company.bankrupt).toBe(false);
  });
});

describe('negativeCashInterest', () => {
  test('off: no interest on negative cash (loan 0 -> no interest charge)', () => {
    const g = Game.create(small);
    const c = primed(g, { money: -10000, loan: 0, months: 0 });
    const before = c.ledger.current.byType.interest || 0;
    companyMonthly(g);
    expect((c.ledger.current.byType.interest || 0) - before).toBe(0);
  });

  test('on: negative cash of -10000 at 5% charges trunc(10000*5/1200) = 41 extra', () => {
    const g = Game.create(small);
    setSetting(g.state, 'negativeCashInterest', true);
    setSetting(g.state, 'loanInterestRate', 5);
    const c = primed(g, { money: -10000, loan: 0, months: 0 });
    const before = c.ledger.current.byType.interest || 0;
    companyMonthly(g);
    expect((c.ledger.current.byType.interest || 0) - before).toBe(41);
  });

  test('on: positive cash is not charged', () => {
    const g = Game.create(small);
    setSetting(g.state, 'negativeCashInterest', true);
    const c = primed(g, { money: 10000, loan: 0, months: 0 });
    const before = c.ledger.current.byType.interest || 0;
    companyMonthly(g);
    expect((c.ledger.current.byType.interest || 0) - before).toBe(0);
  });
});
