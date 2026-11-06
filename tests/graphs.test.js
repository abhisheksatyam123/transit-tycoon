/** Company graphs helpers: performance title, history order, nice axis, league rows, bankruptcy stages. */
import { test, expect, describe } from 'bun:test';
import { performanceTitle, chronological, niceScale, ledgerSeries, leagueRows, GRAPH_TABS } from '../js/ui/windows/graphs.js';
import { bankruptcyStage, monthsUntilBankrupt } from '../js/ui/bankruptcy.js';

describe('company graphs', () => {
  test('performance title follows OpenLoco performanceToRating', () => {
    expect(performanceTitle(0)).toEqual({ rating: 0, title: 'Platelayer' });
    expect(performanceTitle(250).title).toBe('Traffic Manager');
    expect(performanceTitle(1000)).toEqual({ rating: 9, title: 'Tycoon' });
    expect(performanceTitle(5000).rating).toBe(9);
    expect(performanceTitle(-3).rating).toBe(0);
  });

  test('history is stored newest first and is reversed for charts', () => {
    expect(chronological([3, 2, 1])).toEqual([1, 2, 3]);
    expect(chronological([5, 4, 3, 2, 1], 2)).toEqual([4, 5]);
    expect(chronological(undefined)).toEqual([]);
  });

  test('nice scale covers the data with round steps and keeps 0', () => {
    const s = niceScale([0, 873]);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(873);
    expect([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]).toContain(s.step);
    const neg = niceScale([-120, 40]);
    expect(neg.min).toBeLessThanOrEqual(-120);
    expect(neg.max).toBeGreaterThanOrEqual(40);
    expect(niceScale([7, 7]).max).toBeGreaterThan(7);
  });

  test('ledger series adds the running month and keeps the last 12', () => {
    const hist = Array.from({ length: 14 }, (_, i) => ({ month: i % 12, year: 1950, income: i, expenses: 1 }));
    const s = ledgerSeries({ ledger: { history: hist, current: { income: 9, expenses: 4 } } });
    expect(s.income.length).toBe(13);
    expect(s.labels[s.labels.length - 1]).toBe('Now');
    expect(s.income[s.income.length - 1]).toBe(9);
    expect(ledgerSeries({}).labels).toEqual([]);
  });

  test('league lists player and rivals by value, bankrupt flagged', () => {
    const state = {
      company: { name: 'Me', companyValue: 500, performanceIndex: 120 },
      companies: [{ name: 'Rival', companyValue: 900, performanceIndex: 10, bankrupt: true }],
    };
    const rows = leagueRows(state);
    expect(rows.map((r) => r.name)).toEqual(['Rival', 'Me']);
    expect(rows[0].bankrupt).toBe(true);
    expect(rows[1].player).toBe(true);
    expect(rows[1].title).toBe('Engineer');
    expect(leagueRows({ company: { name: 'Solo' } }).length).toBe(1);
  });

  test('tabs include all five views', () => {
    expect(GRAPH_TABS.map(([k]) => k)).toEqual(['value', 'finance', 'cargo', 'performance', 'league']);
  });
});

describe('bankruptcy stages', () => {
  test('warning at 3 and 6 months, bankrupt flag wins, none otherwise', () => {
    expect(bankruptcyStage({ numMonthsInTheRed: 3 })).toBe('warn3');
    expect(bankruptcyStage({ numMonthsInTheRed: 6 })).toBe('warn6');
    expect(bankruptcyStage({ numMonthsInTheRed: 4 })).toBe(null);
    expect(bankruptcyStage({ numMonthsInTheRed: 9, bankrupt: true })).toBe('bankrupt');
    expect(bankruptcyStage({ numMonthsInTheRed: 0 })).toBe(null);
    expect(bankruptcyStage(null)).toBe(null);
    expect(monthsUntilBankrupt(3)).toBe(6);
    expect(monthsUntilBankrupt(6)).toBe(3);
  });
});
