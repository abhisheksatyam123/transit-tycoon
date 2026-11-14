import { test, expect, describe, beforeEach } from 'bun:test';
import { effectiveGain, clampVolume, MASTER_GAIN, SFX_VOLUME_DEFAULT, setSfxVolume, getSfxVolume, setMuted, isMuted } from '../js/audio/sfx.js';

describe('sfx master volume (tt.sfxVolume)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  });

  test('default volume is 100 and gain is exactly the original 0.35', () => {
    expect(SFX_VOLUME_DEFAULT).toBe(100);
    expect(MASTER_GAIN).toBe(0.35);
    expect(effectiveGain(100, false)).toBe(0.35);
    expect(effectiveGain(SFX_VOLUME_DEFAULT, false)).toBe(0.35);
  });

  test('volume 50 gives 0.175 and volume 0 gives 0', () => {
    expect(effectiveGain(50, false)).toBe(0.175);
    expect(effectiveGain(0, false)).toBe(0);
  });

  test('mute silences regardless of volume', () => {
    expect(effectiveGain(100, true)).toBe(0);
    expect(effectiveGain(50, true)).toBe(0);
    expect(effectiveGain(0, true)).toBe(0);
  });

  test('clampVolume rounds and clamps to 0..100 integers', () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(250)).toBe(100);
    expect(clampVolume(47.6)).toBe(48);
    expect(clampVolume(NaN)).toBe(100);
  });

  test('setSfxVolume persists under tt.sfxVolume and round-trips', () => {
    setSfxVolume(35);
    expect(getSfxVolume()).toBe(35);
    expect(store.get('tt.sfxVolume')).toBe('35');
  });

  test('mute uses the same localStorage store as volume', () => {
    setMuted(true);
    expect(isMuted()).toBe(true);
    expect(store.get('tt.muted')).toBe('1');
    setMuted(false);
    expect(store.get('tt.muted')).toBe('0');
  });

  test('a saved volume is read back on a fresh module load', async () => {
    store.set('tt.sfxVolume', '60');
    const fresh = await import('../js/audio/sfx.js?fresh=60');
    expect(fresh.getSfxVolume()).toBe(60);
  });

  test('invalid saved volume falls back to the default 100', async () => {
    store.set('tt.sfxVolume', 'loud');
    const fresh = await import('../js/audio/sfx.js?fresh=bad');
    expect(fresh.getSfxVolume()).toBe(100);
  });
});
