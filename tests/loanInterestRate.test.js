import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { monthlyLoanInterest } from '../js/simulation/economy.js';
import { updateMonthly1 as companyMonthly } from '../js/simulation/loco/companyManager.js';
import { calculateCargoRating } from '../js/simulation/loco/station.js';
import { updateMonthly as objMonthly, updateDaily as objDaily, createObjective } from '../js/simulation/objective.js';
import { SETTING_META, groupOfSetting } from '../js/ui/settingsGroups.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

describe('loan interest rate (World/Company.cpp:724)', () => {
  test('default is 5 (unchanged world) and old saves fall back to it', () => {
    expect(DEFAULT_SETTINGS.loanInterestRate).toBe(5);
    const g = Game.create(small);
    expect(getSetting(g.state, 'loanInterestRate')).toBe(5);
    expect(monthlyLoanInterest(g.state, 120000)).toBe(500); // 120000*5/1200
  });

  test('formula is loan*rate/1200 truncated; editor value 10 doubles it', () => {
    const g = Game.create(small);
    setSetting(g.state, 'loanInterestRate', 10);
    expect(monthlyLoanInterest(g.state, 100000)).toBe(833); // trunc(1000000/1200)
    expect(monthlyLoanInterest(g.state, 0)).toBe(0);
  });

  test('player company pays the setting through the monthly manager', () => {
    const g = Game.create(small);
    const c = g.state.company;
    c.loan = 120000;
    setSetting(g.state, 'loanInterestRate', 12);
    const before = c.ledger.current.expenses;
    companyMonthly(g);
    expect(c.ledger.current.expenses - before).toBeGreaterThanOrEqual(1200); // 120000*12/1200 = 1200
  });

  test('settings group exposes loanInterestRate under economy', () => {
    const entry = SETTING_META.find((e) => e.key === 'loanInterestRate');
    expect(entry.group).toBe('economy');
    expect(entry.min).toBe(0);
    expect(groupOfSetting('loanInterestRate')).toBe('economy');
  });
});

describe('NPC station cargo rating (Station.cpp:790-793)', () => {
  const base = { age: 1, quantity: 50, vehicleSpeed: 20, vehicleAge: 0 };
  test('player station (no npc) is unchanged', () => {
    expect(calculateCargoRating({ ...base, npc: false })).toBe(calculateCargoRating(base));
  });
  test('rival station is fixed at 120 regardless of quantity/age terms', () => {
    // vehicleAge 0 adds +33 after the override in OL (vehicle-age terms are not overridden)
    expect(calculateCargoRating({ ...base, npc: true })).toBe(120 + 33);
    expect(calculateCargoRating({ age: 50, quantity: 2000, vehicleSpeed: 0, vehicleAge: 9, npc: true })).toBe(120);
  });
  test('speed/vehicle-age terms still add after the 120 override (OL order)', () => {
    // OL: rating=120 then speed bonus then vehicle-age bonus, clamp to max 200
    const r = calculateCargoRating({ age: 1, quantity: 50, vehicleSpeed: 135, vehicleAge: 0, npc: true });
    expect(r).toBe(120 + Math.trunc((135 - 35) / 4) + 33);
  });
});

describe('objective time limit before progress (Company.cpp:1075)', () => {
  test('target reached after the deadline is a loss', () => {
    const g = Game.create({ ...small, objective: { type: 'companyValue', target: 1000, timeLimitYears: 1 } });
    g.state.company.companyValue = 5000; // target reached
    g.state.date.year += 2; // past the limit (RX2b: the deadline is enforced daily, OpenLoco calendar rule, not on the 1st)
    g.state.date.day = 2;
    objDaily(g);
    objMonthly(g);
    expect(g.state.objective.status).toBe('lost');
  });
  test('target reached within the limit is a win', () => {
    const g = Game.create({ ...small, objective: { type: 'companyValue', target: 1000, timeLimitYears: 3 } });
    g.state.company.companyValue = 5000;
    objMonthly(g);
    expect(g.state.objective.status).toBe('won');
  });
  test('createObjective unaffected', () => {
    const g = Game.create(small);
    expect(createObjective(g.state, { type: 'companyValue', target: 5, timeLimitYears: 2 }).timeLimitYears).toBe(2);
  });
});
