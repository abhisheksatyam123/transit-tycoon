/** Finance window category subtotals (W4, OpenTTD company_gui.cpp expense categories). Pure, no DOM. */
import { test, expect, describe } from 'bun:test';
import { categoryTotals } from '../js/ui/windows/finances.js';

describe('finances window: category subtotals', () => {
  test('empty or missing byType gives zero totals', () => {
    expect(categoryTotals({})).toEqual({ revenue: 0, operating: 0, capital: 0 });
    expect(categoryTotals(undefined)).toEqual({ revenue: 0, operating: 0, capital: 0 });
  });

  test('income is revenue; running, interest, property and infrastructure are operating', () => {
    const t = categoryTotals({ income: 900, running: 100, interest: 20, property: 30, infrastructure: 5 });
    expect(t.revenue).toBe(900);
    expect(t.operating).toBe(155);
    expect(t.capital).toBe(0);
  });

  test('construction and new vehicles are capital', () => {
    const t = categoryTotals({ construction: 400, vehicles: 250, running: 10 });
    expect(t.capital).toBe(650);
    expect(t.operating).toBe(10);
    expect(t.revenue).toBe(0);
  });

  test('unknown keys are ignored (no new ledger type added)', () => {
    expect(categoryTotals({ foo: 999 })).toEqual({ revenue: 0, operating: 0, capital: 0 });
  });

  test('a default-game month: subtotals match the per-type rows the table shows', () => {
    const byType = { construction: 0, vehicles: 0, running: 1200, income: 5000, interest: 250, property: 300 };
    const t = categoryTotals(byType);
    const expectedNet = byType.income - (byType.running + byType.interest + byType.property);
    expect(t.revenue - t.operating - t.capital).toBe(expectedNet);
  });
});
