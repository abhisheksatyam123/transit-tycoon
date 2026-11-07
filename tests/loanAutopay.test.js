import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { updateDaily as companyDaily } from '../js/simulation/loco/companyManager.js';

// OpenLoco Company::updateLoanAutorepay (World/Company.cpp:775), run from updateDailyControllingPlayer:
// repay min(loan, cash) per day while loan>0 and cash>0, only when CompanyFlags::autopayLoan is set.
describe('loan autopay (CompanyWindow loan_autopay)', () => {
  test('off by default: no flag field, daily tick leaves the loan alone', () => {
    const g = flatGame(42);
    expect(g.state.company.autopayLoan).toBe(false);
    g.state.company.loan = 50000;
    g.state.company.money = 200000;
    companyDaily(g);
    expect(g.state.company.loan).toBe(50000);
  });

  test('on: repays min(loan, cash) each day', () => {
    const g = flatGame(42);
    expect(g.setLoanAutopay(true).ok).toBe(true);
    g.state.company.loan = 50000;
    g.state.company.money = 20000;
    companyDaily(g);
    expect(g.state.company.loan).toBe(30000);
    expect(g.state.company.money).toBe(0);
    g.state.company.money = 100000;
    companyDaily(g);
    expect(g.state.company.loan).toBe(0);
    expect(g.state.company.money).toBe(70000);
  });

  test('on: nothing happens with no loan or no positive cash', () => {
    const g = flatGame(42);
    g.setLoanAutopay(true);
    g.state.company.loan = 0; g.state.company.money = 5000;
    companyDaily(g);
    expect(g.state.company.money).toBe(5000);
    g.state.company.loan = 10000; g.state.company.money = -100;
    companyDaily(g);
    expect(g.state.company.loan).toBe(10000);
  });

  test('off again clears the flag; save/load keeps it', () => {
    const g = flatGame(42);
    g.setLoanAutopay(true);
    g.state.company.loan = 40000;
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.autopayLoan).toBe(true);
    g2.setLoanAutopay(false);
    expect(g2.state.company.autopayLoan).toBe(false);
  });
});
