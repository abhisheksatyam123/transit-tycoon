/** OpenGFX signal sprite wiring (SX4): base pack 1275..1290 already extracted; renderer must map (dir,red)->id. */
import { test, expect, describe } from 'bun:test';
import { signalSpriteId } from '../js/renderer/layers/signals.js';

describe('signalSpriteId', () => {
  test('axis mapping (tmpl_signals pairs, red even / green odd)', () => {
    expect(signalSpriteId(2, true)).toBe(1283); // E e-w red
    expect(signalSpriteId(2, false)).toBe(1284); // E e-w green
    expect(signalSpriteId(8, true)).toBe(1285); // W w-e red
    expect(signalSpriteId(8, false)).toBe(1286); // W w-e green
    expect(signalSpriteId(1, true)).toBe(1289); // N n-s red
    expect(signalSpriteId(1, false)).toBe(1290); // N n-s green
    expect(signalSpriteId(4, true)).toBe(1287); // S s-n red
    expect(signalSpriteId(4, false)).toBe(1288); // S s-n green
  });
  test('two-way (dir 0) defaults to e-w pair', () => {
    expect(signalSpriteId(0, true)).toBe(1283);
    expect(signalSpriteId(0, false)).toBe(1284);
  });
  test('every id is within the extracted 1275..1290 block range', () => {
    for (const dir of [0, 1, 2, 4, 8]) for (const red of [true, false]) {
      const id = signalSpriteId(dir, red);
      expect(id).toBeGreaterThanOrEqual(1275);
      expect(id).toBeLessThanOrEqual(1290);
    }
  });
});
