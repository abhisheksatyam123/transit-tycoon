/** Town cargo generation mode (OpenTTD economy.town_cargogen_mode): original = current, bitcount = opt-in. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { HOUSE_POP } from '../js/simulation/towns.js';
import {
  BITCOUNT_PASS_RATE,
  BITCOUNT_MAIL_RATE,
  bitcountRateFor,
  bitcountMask,
  bitcountAmount,
  bitcountVisitActive,
  countBits,
} from '../js/simulation/loco/tileManager.js';

const TICKS = 3000;
const VPM = (30.4 * 96) / 256 / 4; // production visits per month (1/4 gate)

const game = (opts = {}) => Game.create({ seed: 11, width: 96, height: 96, ...opts });

/** Sum per-tick increases so the monthly counter reset does not hide production. */
function produced(game, key) {
  let total = 0;
  let prev = game.state.towns.reduce((a, t) => a + (t[key] || 0), 0);
  for (let k = 0; k < TICKS; k++) {
    game.step();
    const now = game.state.towns.reduce((a, t) => a + (t[key] || 0), 0);
    if (now > prev) total += now - prev;
    prev = now;
  }
  return total;
}

describe('townCargogenMode setting', () => {
  test('default is original and the select options are exposed', () => {
    expect(DEFAULT_SETTINGS.townCargogenMode).toBe('original');
    const g = game();
    expect(getSetting(g.state, 'townCargogenMode')).toBe('original');
  });

  test('default and explicit original produce identical passengers, mail and RNG stream', () => {
    const a = game();
    const b = game();
    setSetting(b.state, 'townCargogenMode', 'original');
    const ap = produced(a, 'passengersThisMonth');
    const am = produced(a, 'mailThisMonth');
    const bp = produced(b, 'passengersThisMonth');
    const bm = produced(b, 'mailThisMonth');
    expect(ap).toBeGreaterThan(0);
    expect(bp).toBe(ap);
    expect(bm).toBe(am);
    expect(a.state.rngState).toBe(b.state.rngState);
  });

  test('original ignores townCargoScale (dead path stays dead in default mode)', () => {
    const a = game();
    const b = game();
    setSetting(b.state, 'townCargoScale', 50);
    expect(produced(b, 'passengersThisMonth')).toBe(produced(a, 'passengersThisMonth'));
  });
});

describe('bitcount formula and calibration', () => {
  test('countBits and likely bit-count masks', () => {
    expect(countBits(0)).toBe(0);
    expect(countBits(0xffffffff)).toBe(32);
    expect(countBits(0x80000001)).toBe(2);
    expect(bitcountMask(bitcountRateFor(6))).toBe(0xf); // genmax 4
    expect(BITCOUNT_PASS_RATE).toEqual([0, 25, 65, 137, 233]);
    expect(BITCOUNT_MAIL_RATE).toEqual([0, 1, 9, 25, 41]);
  });

  test('amount is CountBits(r & mask), integer, and never above genmax', () => {
    for (let level = 1; level <= 4; level++) {
      for (const rate of [BITCOUNT_PASS_RATE[level], BITCOUNT_MAIL_RATE[level]]) {
        const genmax = (rate + 7) >> 3;
        for (let k = 0; k < 400; k++) {
          const r = (Math.imul(k + 1, 2654435761) ^ (k << 13)) >>> 0;
          const amount = bitcountAmount(rate, r);
          expect(Number.isInteger(amount)).toBe(true);
          expect(amount).toBe(countBits(r & bitcountMask(rate)));
          expect(amount).toBeGreaterThanOrEqual(0);
          expect(amount).toBeLessThanOrEqual(genmax);
        }
      }
    }
  });

  test('per-house monthly means match the original pop/3 and pop/15 targets', () => {
    for (let level = 1; level <= 4; level++) {
      const passMean = (((BITCOUNT_PASS_RATE[level] + 7) >> 3) / 2) * VPM;
      const mailMean = (((BITCOUNT_MAIL_RATE[level] + 7) >> 3) / 2) * VPM;
      expect(Math.abs(passMean - HOUSE_POP[level] / 3) / (HOUSE_POP[level] / 3)).toBeLessThan(0.08);
      expect(Math.abs(mailMean - HOUSE_POP[level] / 15) / (HOUSE_POP[level] / 15)).toBeLessThan(0.25);
    }
  });

  test('the 1/4 tile gate activates exactly one visit in four', () => {
    const tile = 1234;
    let active = 0;
    for (let k = 0; k < 400; k++) {
      // a house is visited once every 256 ticks, so the same tick phase repeats
      const tick = tile * 256 + k * 256;
      if (bitcountVisitActive(tick, tile)) active++;
    }
    expect(active).toBe(100);
  });
});

describe('bitcount live path', () => {
  test('deterministic: identical games with the mode on stay identical', () => {
    const a = game();
    const b = game();
    setSetting(a.state, 'townCargogenMode', 'bitcount');
    setSetting(b.state, 'townCargogenMode', 'bitcount');
    expect(produced(a, 'passengersThisMonth')).toBe(produced(b, 'passengersThisMonth'));
    expect(a.state.rngState).toBe(b.state.rngState);
  });

  test('monthly passengers stay calibrated to the original path', () => {
    const base = game();
    const bc = game();
    setSetting(bc.state, 'townCargogenMode', 'bitcount');
    const bp = produced(base, 'passengersThisMonth');
    const cp = produced(bc, 'passengersThisMonth');
    expect(bp).toBeGreaterThan(0);
    expect(cp).toBeGreaterThan(0);
    expect(cp).toBeGreaterThan(bp * 0.6);
    expect(cp).toBeLessThan(bp * 1.4);
    // mail is coarser at low house levels but still the right order of magnitude
    const bm = produced(base, 'mailThisMonth');
    const cm = produced(bc, 'mailThisMonth');
    expect(cm).toBeGreaterThan(bm * 0.5);
    expect(cm).toBeLessThan(bm * 2);
  });

  test('townCargoScale scales bitcount output (100% is unchanged)', () => {
    const full = game();
    const half = game();
    setSetting(full.state, 'townCargogenMode', 'bitcount');
    setSetting(half.state, 'townCargogenMode', 'bitcount');
    setSetting(half.state, 'townCargoScale', 50);
    const f = produced(full, 'passengersThisMonth');
    const h = produced(half, 'passengersThisMonth');
    expect(h).toBeGreaterThan(f * 0.35);
    expect(h).toBeLessThan(f * 0.65);
  });

  test('recession halves bitcount production', () => {
    const rec = game();
    setSetting(rec.state, 'townCargogenMode', 'bitcount');
    setSetting(rec.state, 'economyRecessions', true);
    rec.state.recession = { fluct: -500 };
    const normal = game();
    setSetting(normal.state, 'townCargogenMode', 'bitcount');
    const during = produced(rec, 'passengersThisMonth');
    const base = produced(normal, 'passengersThisMonth');
    expect(base).toBeGreaterThan(0);
    expect(during).toBeGreaterThan(base * 0.3);
    expect(during).toBeLessThan(base * 0.7);
  });
});
