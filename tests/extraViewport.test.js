/** Extra viewport helpers (pure): throttle, slot allocation, registry gating. */
import { test, expect, describe } from 'bun:test';
import { extraShouldDraw, freeSlot, MAX_EXTRA_VIEWPORTS, EXTRA_EVERY } from '../js/ui/extraViewport.js';

describe('extra viewport helpers', () => {
  test('extra views draw every EXTRA_EVERY frames', () => {
    expect(EXTRA_EVERY).toBe(3);
    const drawn = [];
    for (let f = 1; f <= 9; f++) if (extraShouldDraw(f)) drawn.push(f);
    expect(drawn).toEqual([3, 6, 9]);
  });

  test('interval 1 draws every frame', () => {
    expect(extraShouldDraw(5, 1)).toBe(true);
  });

  test('slots: first free index, -1 when full (max 2)', () => {
    expect(MAX_EXTRA_VIEWPORTS).toBe(2);
    expect(freeSlot([])).toBe(0);
    expect(freeSlot([0])).toBe(1);
    expect(freeSlot([0, 1])).toBe(-1);
    expect(freeSlot(new Set([1]))).toBe(0);
  });
});
