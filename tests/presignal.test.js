/** presignal sprite wiring check (PX5) */
import { test, expect, describe } from 'bun:test';
import { signalSpriteId, presignalFrame } from '../js/renderer/layers/signals.js';
describe('presignal', () => {
  test('frames in range', () => {
    expect(presignalFrame(2, true)).toBe(8); expect(presignalFrame(2, false)).toBe(9);
    expect(presignalFrame(8, true)).toBe(10); expect(presignalFrame(1, false)).toBe(15);
  });
});
