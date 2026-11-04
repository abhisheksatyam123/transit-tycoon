import { test, expect, describe } from 'bun:test';
import { createRng, hashSeed } from '../js/simulation/rng.js';
import { Game } from '../js/simulation/game.js';

describe('rng', () => {
  test('hashSeed is deterministic and 32-bit unsigned', () => {
    expect(hashSeed(42)).toBe(hashSeed(42));
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
    const h = hashSeed('transit');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  test('same seed gives identical sequences; state lives in holder', () => {
    const a = { rngState: hashSeed(7) }, b = { rngState: hashSeed(7) };
    const ra = createRng(a), rb = createRng(b);
    const seqA = Array.from({ length: 50 }, () => ra.next());
    const seqB = Array.from({ length: 50 }, () => rb.next());
    expect(seqA).toEqual(seqB);
    expect(a.rngState).toBe(b.rngState);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  test('int/range/pick/chance stay within bounds', () => {
    const r = createRng({ rngState: 1 });
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 9);
      expect(n >= 3 && n <= 9 && Number.isInteger(n)).toBe(true);
      const f = r.range(-2, 2);
      expect(f >= -2 && f < 2).toBe(true);
      expect(['a', 'b']).toContain(r.pick(['a', 'b']));
    }
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });

  test('Game.create with same seed yields identical worlds', () => {
    const a = Game.create({ seed: 'same', width: 64, height: 64 });
    const b = Game.create({ seed: 'same', width: 64, height: 64 });
    expect(a.serialize()).toBe(b.serialize());
  });

  test('different seeds yield different terrain', () => {
    const a = Game.create({ seed: 1, width: 64, height: 64 });
    const b = Game.create({ seed: 2, width: 64, height: 64 });
    expect(a.serialize()).not.toBe(b.serialize());
  });
});
