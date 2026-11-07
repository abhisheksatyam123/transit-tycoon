/** Industry production history: monthly capped tuples and the graph series (OTTD industry window). */
import { test, expect, describe } from 'bun:test';
import { pushIndustryHistory, INDUSTRY_HISTORY_MONTHS } from '../js/simulation/loco/industry.js';
import { industryHistorySeries } from '../js/ui/windows/industry.js';

describe('industry production history', () => {
  test('lazy: created at the first month end and capped at 24 entries', () => {
    const ind = { producedPrev: [10, 0], deliveredPrev: [7, 0] };
    expect(ind.hist).toBeUndefined();
    pushIndustryHistory(ind, ['COAL', 'X'], { year: 1950, month: 0 });
    expect(ind.hist).toEqual([[1950 * 12, 10, 7, 0, 0]]);
    for (let i = 0; i < 40; i++) pushIndustryHistory(ind, ['COAL', 'X'], { year: 1950, month: i % 12 });
    expect(ind.hist.length).toBe(INDUSTRY_HISTORY_MONTHS);
    expect(INDUSTRY_HISTORY_MONTHS).toBe(24);
  });

  test('transported is capped at produced', () => {
    const ind = { producedPrev: [5], deliveredPrev: [9] };
    pushIndustryHistory(ind, ['COAL'], { year: 1951, month: 2 });
    expect(ind.hist[0]).toEqual([1951 * 12 + 2, 5, 5]);
  });

  test('producers with no cargo, or no date, add nothing', () => {
    const ind = { producedPrev: [], deliveredPrev: [] };
    pushIndustryHistory(ind, [], { year: 1950, month: 0 });
    pushIndustryHistory({ producedPrev: [1], deliveredPrev: [1] }, ['COAL'], null);
    expect(ind.hist).toBeUndefined();
  });

  test('series: produced and transported per cargo, oldest first, month labels', () => {
    const hist = [[1950 * 12, 10, 4], [1950 * 12 + 1, 20, 20]];
    const g = industryHistorySeries(hist, ['COAL'], 24);
    expect(g.labels).toEqual(['Jan 1950', 'Feb 1950']);
    expect(g.series.map((s) => s.name)).toEqual(['Coal produced', 'Coal transported']);
    expect(g.series[0].values).toEqual([10, 20]);
    expect(g.series[1].values).toEqual([4, 20]);
    expect(g.series[1].dashed).toBe(true);
  });

  test('series: empty or missing history is safe', () => {
    expect(industryHistorySeries(undefined, ['COAL']).series[0].values).toEqual([]);
    expect(industryHistorySeries([], []).series).toEqual([]);
  });

  test('series respects the max window (last N months)', () => {
    const hist = Array.from({ length: 30 }, (_, i) => [1900 * 12 + i, i, i]);
    const g = industryHistorySeries(hist, ['COAL'], 24);
    expect(g.series[0].values.length).toBe(24);
    expect(g.series[0].values[23]).toBe(29);
  });
});
