/**
 * D7 finance history (N1-F1): quarterly/yearly finance views derived from existing ledger history and the
 * company's yearly expenditure table. Pure helpers only - no new state, settings or save fields.
 */
import { test, expect, describe } from 'bun:test';
import {
  categoryTotals, quarterOf, groupQuarters, yearColumns, FINANCE_PERIODS, DEFAULT_FINANCE_PERIOD,
} from '../js/ui/windows/finances.js';
import { createCompany, spend, earn, closeLedgerMonth } from '../js/simulation/economy.js';
import { updateYearlyExpenditure } from '../js/simulation/loco/company.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';

function entry(year, month, income = 0, expenses = 0, byType = {}, current = false) {
  return { year, month, income, expenses, byType, ...(current ? { current: true } : {}) };
}

describe('D7 quarterly bucketing', () => {
  test('quarterOf aligns with the calendar (Jan-Mar = Q1, Apr-Jun = Q2, ...)', () => {
    expect([0, 1, 2].map(quarterOf)).toEqual([1, 1, 1]);
    expect([3, 4, 5].map(quarterOf)).toEqual([2, 2, 2]);
    expect([6, 7, 8].map(quarterOf)).toEqual([3, 3, 3]);
    expect([9, 10, 11].map(quarterOf)).toEqual([4, 4, 4]);
  });

  test('a full year of monthly entries groups into four complete quarters', () => {
    const history = Array.from({ length: 12 }, (_, m) => entry(2026, m, m + 1, 2, { running: 2 }));
    const quarters = groupQuarters(history);
    expect(quarters.map((q) => `${q.year}-Q${q.quarter}`)).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(quarters.every((q) => q.months === 3 && !q.partial)).toBe(true);
  });

  test('quarter sums equal the sum of their monthly entries (income, expenses, byType)', () => {
    const history = Array.from({ length: 12 }, (_, m) => entry(2026, m, 1000 + m, 300 + m, {
      running: 100 + m, income: 1000 + m, construction: m % 2 ? 50 : 0,
    }));
    const quarters = groupQuarters(history);
    expect(quarters.reduce((a, q) => a + q.income, 0)).toBe(history.reduce((a, h) => a + h.income, 0));
    expect(quarters.reduce((a, q) => a + q.expenses, 0)).toBe(history.reduce((a, h) => a + h.expenses, 0));
    const sumBy = (list, k) => list.reduce((a, x) => a + ((x.byType || {})[k] || 0), 0);
    for (const k of ['running', 'income', 'construction']) expect(sumBy(quarters, k)).toBe(sumBy(history, k));
    // category subtotals are linear, so a quarter's subtotals equal the sum of its months' subtotals
    const q2 = quarters[1];
    const months = history.slice(3, 6).map((h) => categoryTotals(h.byType));
    expect(categoryTotals(q2.byType).revenue).toBe(months.reduce((a, c) => a + c.revenue, 0));
    expect(categoryTotals(q2.byType).operating).toBe(months.reduce((a, c) => a + c.operating, 0));
    expect(categoryTotals(q2.byType).capital).toBe(months.reduce((a, c) => a + c.capital, 0));
  });

  test('a history that starts mid-quarter marks the first bucket partial', () => {
    const history = Array.from({ length: 11 }, (_, i) => entry(2026, i + 1, 10, 1));
    const quarters = groupQuarters(history);
    expect(quarters[0].quarter).toBe(1);
    expect(quarters[0].months).toBe(2);
    expect(quarters[0].partial).toBe(true);
    expect(quarters[1].partial).toBe(false);
  });

  test('the in-progress month marks its quarter partial even when three months are present', () => {
    const history = [entry(2026, 9, 10, 1), entry(2026, 10, 10, 1), entry(2026, 11, 5, 0, {}, true)];
    const quarters = groupQuarters(history);
    expect(quarters).toHaveLength(1);
    expect(quarters[0].months).toBe(3);
    expect(quarters[0].partial).toBe(true);
  });

  test('quarters across a year boundary sort chronologically', () => {
    const quarters = groupQuarters([entry(2026, 0, 1, 0), entry(2025, 11, 1, 0), entry(2025, 10, 1, 0)]);
    expect(quarters.map((q) => `${q.year}-Q${q.quarter}`)).toEqual(['2025-Q4', '2026-Q1']);
  });

  test('grouping does not mutate the monthly entries', () => {
    const history = [entry(2026, 0, 10, 2, { running: 2 })];
    const before = JSON.stringify(history);
    groupQuarters(history);
    expect(JSON.stringify(history)).toBe(before);
  });
});

describe('D7 yearly columns from company.expenditures', () => {
  test('oldest-first columns, current year labelled This year, signed expenditures flipped for display', () => {
    const cols = yearColumns([{ income: 300, running: -50 }, { income: 1000, running: -200, construction: -400 }], 1951);
    expect(cols).toHaveLength(2);
    expect(cols[0].label).toBe('1950');
    expect(cols[1].label).toBe('This year');
    expect(cols[0].year).toBe(1950);
    expect(cols[1].year).toBe(1951);
    expect(cols[0].byType).toEqual({ income: 1000, running: 200, construction: 400 });
    expect(cols[1].byType).toEqual({ income: 300, running: 50 });
    expect(cols[0].income).toBe(1000);
    expect(cols[0].expenses).toBe(600);
    expect(cols[0].income - cols[0].expenses).toBe(400);
    expect(cols[1].income).toBe(300);
    expect(cols[1].expenses).toBe(50);
    expect(categoryTotals(cols[0].byType)).toEqual({ revenue: 1000, operating: 200, capital: 400 });
  });

  test('defaults to four columns and tolerates an empty expenditure table', () => {
    const exps = [{}, {}, {}, {}, {}];
    expect(yearColumns(exps, 2000)).toHaveLength(4);
    expect(yearColumns([{}], 2000).map((c) => c.label)).toEqual(['This year']);
    expect(yearColumns(undefined, 2000).map((c) => c.label)).toEqual(['This year']);
    expect(yearColumns([{}], 2000)[0].byType).toEqual({});
  });

  test('a simulated year matches the monthly ledger sums for every type', () => {
    const c = createCompany('Yearly Co.');
    const months = [];
    for (let m = 0; m < 12; m++) {
      earn(c, 1000 + m * 10);
      spend(c, 'running', 100 + m);
      if (m % 3 === 0) spend(c, 'construction', 250);
      months.push({ income: c.ledger.current.income, expenses: c.ledger.current.expenses, byType: { ...c.ledger.current.byType } });
      closeLedgerMonth({ company: c }, { year: 1950, month: m });
    }
    expect(c.ledger.current.income).toBe(0);
    updateYearlyExpenditure(c);
    const cols = yearColumns(c.expenditures, 1951);
    const y1950 = cols.find((col) => col.year === 1950);
    expect(y1950).toBeTruthy();
    const sumMonthly = (k) => months.reduce((a, x) => a + ((x.byType || {})[k] || 0), 0);
    for (const k of ['income', 'running', 'construction']) expect(y1950.byType[k] || 0).toBe(sumMonthly(k));
    expect(y1950.income).toBe(months.reduce((a, x) => a + x.income, 0));
    expect(y1950.expenses).toBe(months.reduce((a, x) => a + x.expenses, 0));
    // raw expenditure entries keep the signed convention (income positive, costs negative)
    expect(c.expenditures[1].income).toBe(sumMonthly('income'));
    expect(c.expenditures[1].running).toBe(-sumMonthly('running'));
    expect(c.expenditures[1].construction).toBe(-sumMonthly('construction'));
  });
});

describe('D7 default view and no new state', () => {
  test('Monthly remains the default period', () => {
    expect(DEFAULT_FINANCE_PERIOD).toBe('monthly');
    expect(FINANCE_PERIODS[0]).toEqual(['monthly', 'Monthly']);
    expect(FINANCE_PERIODS.map(([k]) => k)).toEqual(['monthly', 'quarterly', 'yearly']);
  });

  test('the view state is UI-only: no company/ledger/settings fields are added', () => {
    const c = createCompany('No State');
    expect(Object.keys(c.ledger)).toEqual(['current', 'history']);
    expect(Object.keys(c.ledger.current).sort()).toEqual(['byType', 'expenses', 'income']);
    expect('financePeriod' in c).toBe(false);
    expect('financeView' in c).toBe(false);
    for (const k of Object.keys(DEFAULT_SETTINGS)) expect(k.toLowerCase()).not.toContain('finance');
    // a closed month keeps the existing five keys only
    spend(c, 'running', 10);
    closeLedgerMonth({ company: c }, { year: 1950, month: 0 });
    expect(Object.keys(c.ledger.history[0]).sort()).toEqual(['byType', 'expenses', 'income', 'month', 'year']);
  });
});
