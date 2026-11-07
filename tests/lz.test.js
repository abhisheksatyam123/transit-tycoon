import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect } from 'bun:test';
import { compress, decompress } from '../js/ui/lz.js';
import { Game } from '../js/simulation/game.js';

function rnd(seed, len, alphabet) {
  let x = seed >>> 0 || 1;
  let s = '';
  for (let i = 0; i < len; i++) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    s += alphabet[x % alphabet.length];
  }
  return s;
}
const noLoneSurrogates = (s) => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) return false;
  }
  return true;
};

test('empty string', () => {
  expect(decompress(compress(''))).toBe('');
});

test('unicode round-trip', () => {
  const s = 'Москва — 莫斯科 😀 Москва Москва';
  const c = compress(s);
  expect(decompress(c)).toBe(s);
  expect(noLoneSurrogates(c)).toBe(true);
});

test('random strings round-trip', () => {
  for (let k = 1; k <= 30; k++) {
    const s = rnd(k * 7919, k * 97, 'ab');
    expect(decompress(compress(s))).toBe(s);
  }
  const wide = rnd(12345, 20000, 'abcdефгҐ\u0000\uffff😀xyz');
  expect(decompress(compress(wide))).toBe(wide);
  expect(noLoneSurrogates(compress(wide))).toBe(true);
  const aaa = 'a'.repeat(100000);
  expect(decompress(compress(aaa))).toBe(aaa);
});

test('real Moscow save round-trip', () => {
  const g = Game.create({ scenario: 'moscow', seed: 1 });
  for (let i = 0; i < 600; i++) g.step();
  const s = g.serialize();
  const t0 = performance.now();
  const c = compress(s);
  const t1 = performance.now();
  const back = decompress(c);
  const t2 = performance.now();
  console.log(`moscow save: ${s.length} chars -> ${c.length} chars; compress ${(t1 - t0).toFixed(0)} ms, decompress ${(t2 - t1).toFixed(0)} ms`);
  expect(back === s).toBe(true);
  expect(c.length).toBeLessThan(2_000_000);
  expect(noLoneSurrogates(c)).toBe(true);
}, 120000);
