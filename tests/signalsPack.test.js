/** OpenGFX signal sprite wiring (SX4/T120): data-driven lookup; base pack 1275..1290. */
import { test, expect, describe } from 'bun:test';
import {
  SIGNAL_SPRITES,
  resolveSignalSprite,
  signalSpriteId,
  presignalSpriteKey,
  presignalFrame,
} from '../js/renderer/layers/signals.js';

describe('SIGNAL_SPRITES / resolveSignalSprite', () => {
  test('data-driven lookup has expected dir entries and red/green ids', () => {
    expect(SIGNAL_SPRITES[0]).toEqual({ red: 1283, green: 1284 });
    expect(SIGNAL_SPRITES[1]).toEqual({ red: 1289, green: 1290 });
    expect(SIGNAL_SPRITES[2]).toEqual({ red: 1283, green: 1284 });
    expect(SIGNAL_SPRITES[4]).toEqual({ red: 1287, green: 1288 });
    expect(SIGNAL_SPRITES[8]).toEqual({ red: 1285, green: 1286 });
  });
  test('resolveSignalSprite maps (dir,red) via lookup (preserves prior behaviour)', () => {
    expect(resolveSignalSprite(2, true)).toBe(1283); // E e-w red
    expect(resolveSignalSprite(2, false)).toBe(1284); // E e-w green
    expect(resolveSignalSprite(8, true)).toBe(1285); // W w-e red
    expect(resolveSignalSprite(8, false)).toBe(1286); // W w-e green
    expect(resolveSignalSprite(1, true)).toBe(1289); // N n-s red
    expect(resolveSignalSprite(1, false)).toBe(1290); // N n-s green
    expect(resolveSignalSprite(4, true)).toBe(1287); // S s-n red
    expect(resolveSignalSprite(4, false)).toBe(1288); // S s-n green
  });
  test('unknown dir falls back to axis-neutral pair', () => {
    expect(resolveSignalSprite(99, true)).toBe(1283);
    expect(resolveSignalSprite(99, false)).toBe(1284);
  });
  test('two-way (dir 0) defaults to e-w pair', () => {
    expect(resolveSignalSprite(0, true)).toBe(1283);
    expect(resolveSignalSprite(0, false)).toBe(1284);
  });
  test('every resolved id is within extracted 1275..1290 block range', () => {
    for (const dir of [0, 1, 2, 4, 8, 99]) for (const red of [true, false]) {
      const id = resolveSignalSprite(dir, red);
      expect(id).toBeGreaterThanOrEqual(1275);
      expect(id).toBeLessThanOrEqual(1290);
    }
  });
});

describe('signalSpriteId (backward compat)', () => {
  test('axis mapping (tmpl_signals pairs, red even / green odd)', () => {
    expect(signalSpriteId(2, true)).toBe(1283);
    expect(signalSpriteId(2, false)).toBe(1284);
    expect(signalSpriteId(8, true)).toBe(1285);
    expect(signalSpriteId(8, false)).toBe(1286);
    expect(signalSpriteId(1, true)).toBe(1289);
    expect(signalSpriteId(1, false)).toBe(1290);
    expect(signalSpriteId(4, true)).toBe(1287);
    expect(signalSpriteId(4, false)).toBe(1288);
  });
  test('matches resolveSignalSprite for all supported dirs', () => {
    for (const dir of [0, 1, 2, 4, 8]) for (const red of [true, false]) {
      expect(signalSpriteId(dir, red)).toBe(resolveSignalSprite(dir, red));
    }
  });
});

describe('presignalSpriteKey', () => {
  test('builds extra-pack key from type/dir/red', () => {
    expect(presignalSpriteKey('entry', 2, true)).toBe('presignal_entry.8');
    expect(presignalSpriteKey('entry', 2, false)).toBe('presignal_entry.9');
    expect(presignalSpriteKey('exit', 8, true)).toBe('presignal_exit.10');
    expect(presignalSpriteKey('combo', 1, false)).toBe('presignal_combo.15');
    expect(presignalSpriteKey('entry', 4, true)).toBe('presignal_entry.12');
  });
  test('uses presignalFrame (preserves prior behaviour)', () => {
    for (const type of ['entry', 'exit', 'combo']) {
      for (const dir of [0, 1, 2, 4, 8]) for (const red of [true, false]) {
        expect(presignalSpriteKey(type, dir, red)).toBe(`presignal_${type}.${presignalFrame(dir, red)}`);
      }
    }
  });
});
