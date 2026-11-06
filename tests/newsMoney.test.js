import { describe, test, expect } from 'bun:test';
import { localizeMoneyText } from '../js/ui/newsMoney.js';
import { formatMoney } from '../js/simulation/currency.js';

describe('news money text at display time', () => {
  test('default currency leaves text unchanged', () => {
    expect(localizeMoneyText('Earned $1,234 today', 'DEFAULT')).toBe('Earned $1,234 today');
    expect(localizeMoneyText('Earned $1,234 today', undefined)).toBe('Earned $1,234 today');
  });
  test('RUB re-formats amounts with the rouble symbol', () => {
    const out = localizeMoneyText('Profit $1,000 and -$250.50', 'RUB');
    expect(out).toBe(`Profit ${formatMoney(1000, 'RUB')} and ${formatMoney(-250.5, 'RUB')}`);
    expect(out).toContain('₽');
    expect(out).not.toMatch(/\$\d/);
  });
  test('GBP / JPY use their own symbols and rates', () => {
    expect(localizeMoneyText('$10', 'GBP')).toBe('£10');
    expect(localizeMoneyText('$10', 'JPY')).toBe('¥2,200');
  });
  test('text without money is unchanged; non-strings pass through', () => {
    expect(localizeMoneyText('New town founded', 'RUB')).toBe('New town founded');
    expect(localizeMoneyText(undefined, 'RUB')).toBe(undefined);
  });
});
