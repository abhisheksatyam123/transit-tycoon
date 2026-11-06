/** Screenshot file naming (pure). */
import { test, expect, describe } from 'bun:test';
import { shotDate } from '../js/ui/screenshot.js';

describe('screenshot names', () => {
  test('date part is YYYY-MM-DD with zero padding', () => {
    expect(shotDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(shotDate(new Date(2026, 10, 27))).toBe('2026-11-27');
  });
});
