import { test, expect } from 'bun:test';
import { openWindow } from '../js/ui/windows/index.js';

// Regression: the logger import used to live inside the registry's JSDoc comment, so the unknown-window
// fallback threw ReferenceError instead of logging and returning null.
test('unknown window name returns null and does not throw', () => {
  let result;
  expect(() => { result = openWindow({}, 'unknown'); }).not.toThrow();
  expect(result).toBeNull();
});
