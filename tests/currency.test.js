/** CU: display-only currency and speed units (simulation/currency.js). */
import { test, expect, describe } from 'bun:test';
import { formatMoney, parseMoney, formatSpeed, CURRENCIES } from '../js/simulation/currency.js';

describe('formatMoney', () => {
  test('default is the original $ look', () => {
    expect(formatMoney(1234)).toBe('$1,234');
    expect(formatMoney(1234, 'DEFAULT')).toBe('$1,234');
    expect(formatMoney(-12)).toBe('-$12');
  });
  test('rates per OpenTTD (GBP 1, USD 2, EUR 2, JPY 220, RUB 80)', () => {
    expect(formatMoney(100, 'GBP')).toBe('£100');
    expect(formatMoney(100, 'USD')).toBe('$200');
    expect(formatMoney(100, 'EUR')).toBe('€200');
    expect(formatMoney(100, 'JPY')).toBe('¥22,000');
    expect(formatMoney(100, 'RUB')).toBe('8,000\u00a0₽');
  });
  test('prefix vs suffix placement', () => {
    expect(formatMoney(5, 'EUR').startsWith('€')).toBe(true);
    expect(formatMoney(5, 'RUB').endsWith('\u00a0₽')).toBe(true);
    expect(formatMoney(-5, 'RUB')).toBe('-400\u00a0₽');
  });
  test('negative numbers keep the sign before the symbol', () => {
    expect(formatMoney(-1234, 'USD')).toBe('-$2,468');
    expect(formatMoney(-1, 'GBP')).toBe('-£1');
  });
  test('large numbers get thousands separators', () => {
    expect(formatMoney(1234567)).toBe('$1,234,567');
    expect(formatMoney(10000000, 'GBP')).toBe('£10,000,000');
  });
  test('rounds to whole units after the rate', () => {
    expect(formatMoney(1.4)).toBe('$1');
    expect(formatMoney(1.5)).toBe('$2');
    expect(formatMoney(0.3, 'USD')).toBe('$1');
    expect(formatMoney(-0.4)).toBe('$0');
  });
  test('unknown code, NaN and undefined fall back safely', () => {
    expect(formatMoney(10, 'XXX')).toBe('$10');
    expect(formatMoney(NaN)).toBe('$0');
    expect(formatMoney(undefined)).toBe('$0');
  });
  test('every listed currency formats without throwing', () => {
    for (const id of Object.keys(CURRENCIES)) expect(typeof formatMoney(42, id)).toBe('string');
  });
});

describe('parseMoney (round trip)', () => {
  test('inverts formatMoney for the same currency', () => {
    for (const id of Object.keys(CURRENCIES)) {
      for (const v of [0, 7, -350, 12345]) {
        expect(parseMoney(formatMoney(v, id), id)).toBeCloseTo(v, 6);
      }
    }
  });
  test('rejects labels of another currency or text', () => {
    expect(parseMoney('£10', 'USD')).toBeNull();
    expect(parseMoney('Not possible', 'DEFAULT')).toBeNull();
  });
});

describe('formatSpeed', () => {
  test('km/h is the default and mph converts', () => {
    expect(formatSpeed(160)).toBe('160 km/h');
    expect(formatSpeed(160, 'kmh')).toBe('160 km/h');
    expect(formatSpeed(100, 'mph')).toBe('62 mph');
    expect(formatSpeed(-0, 'mph')).toBe('0 mph');
  });
  test('unknown unit falls back to km/h', () => {
    expect(formatSpeed(50, 'furlong')).toBe('50 km/h');
  });
});
