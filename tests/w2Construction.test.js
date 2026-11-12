/**
 * W2 construction settings (OpenTTD construction.* gaps):
 *  - construction.train_signal_side -> trainSignalSide ('right' default = TT's historic post side)
 *  - construction.build_on_slopes   -> buildOnSlopes (true default = no slope check, TT's historic behaviour)
 *  - construction.map_height_limit  -> mapHeightLimit (7 default = cmdTerraform MAX_HEIGHT)
 * Each default reproduces the current Transit Tycoon behaviour; the off/other value changes it.
 */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { planTerraform, MAX_HEIGHT } from '../js/simulation/cmdTerraform.js';
import { drawSignalPost, signalPostSide } from '../js/renderer/layers/signals.js';

const NEW_KEYS = ['trainSignalSide', 'buildOnSlopes', 'mapHeightLimit'];

/** Canvas stand-in: records every call so the drawn x positions can be checked. */
function recordingCtx() {
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      return (...args) => { calls.push([p, ...args]); };
    },
    set(t, p, v) { t[p] = v; return true; },
  });
  return { ctx, calls };
}

describe('W2 construction settings: defaults and metadata', () => {
  test('defaults equal the current hard-coded behaviour', () => {
    expect(DEFAULT_SETTINGS.trainSignalSide).toBe('right');
    expect(DEFAULT_SETTINGS.buildOnSlopes).toBe(true);
    expect(DEFAULT_SETTINGS.mapHeightLimit).toBe(MAX_HEIGHT);
    expect(MAX_HEIGHT).toBe(7);
  });

  test('each new key has exactly one SETTING_META entry in the construction group', () => {
    for (const key of NEW_KEYS) {
      const metas = SETTING_META.filter((m) => m.key === key);
      expect(metas.length).toBe(1);
      expect(metas[0].group).toBe('construction');
    }
  });

  test('select options contain the default value (as a string for numeric selects)', () => {
    const sig = SETTING_META.find((m) => m.key === 'trainSignalSide');
    expect(sig.type).toBe('select');
    expect(sig.options.map((o) => o[0])).toContain(DEFAULT_SETTINGS.trainSignalSide);
    const hl = SETTING_META.find((m) => m.key === 'mapHeightLimit');
    expect(hl.type).toBe('select');
    expect(hl.options.map((o) => o[0])).toContain(String(DEFAULT_SETTINGS.mapHeightLimit));
  });
});

describe('construction.train_signal_side (render-only)', () => {
  test('pure side rule: right is the default, left mirrors, driving follows roadSide', () => {
    expect(signalPostSide('right', 'right')).toBe(1);
    expect(signalPostSide('right', 'left')).toBe(1);
    expect(signalPostSide('left', 'right')).toBe(-1);
    expect(signalPostSide('driving', 'right')).toBe(1);
    expect(signalPostSide('driving', 'left')).toBe(-1);
    expect(signalPostSide(undefined, 'right')).toBe(1);
  });

  test('procedural post: default side keeps sx+6; left side moves it to sx-6', () => {
    const sx = 100, sy = 100;
    const a = recordingCtx();
    drawSignalPost(a.ctx, sx, sy, false, 'block', 0);
    const b = recordingCtx();
    drawSignalPost(b.ctx, sx, sy, false, 'block', 0, -1);
    const xOf = (calls) => calls.filter((c) => c[0] === 'moveTo').map((c) => c[1]);
    if (xOf(a.calls).length) {
      expect(xOf(a.calls)[0]).toBe(sx + 6);
      expect(xOf(b.calls)[0]).toBe(sx - 6);
    } else {
      // sprite pack drew the post: the left side is mirrored via save/translate/scale around sx
      expect(b.calls.some((c) => c[0] === 'scale' && c[1] === -1)).toBe(true);
      expect(a.calls.some((c) => c[0] === 'scale')).toBe(false);
    }
  });
});

describe('construction.build_on_slopes', () => {
  test('default on: track builds across a sloped tile as before', () => {
    const game = flatGame(7);
    const s = game.state;
    s.map.tiles[20 * s.map.width + 22].height = 2; // one raised tile on the line
    const r = game.buildRail(20, 20, 24, 20);
    expect(r.ok).toBe(true);
  });

  test('off: track refuses a tile whose corners are not level; level ground still builds', () => {
    const game = flatGame(7);
    const s = game.state;
    setSetting(s, 'buildOnSlopes', false);
    s.map.tiles[20 * s.map.width + 22].height = 2;
    const bad = game.buildRail(20, 20, 24, 20);
    expect(bad.ok).toBe(false);
    const good = game.buildRail(20, 26, 24, 26); // flat row
    expect(good.ok).toBe(true);
  });
});

describe('construction.map_height_limit (terraform ceiling)', () => {
  function levelledGame(h) {
    const game = flatGame(7);
    const s = game.state;
    for (const t of s.map.tiles) t.height = h;
    return game;
  }
  const rect = { x0: 30, y0: 30, x1: 31, y1: 31 };

  test('default 7: raising to 6 is allowed, raising past 7 is refused (unchanged)', () => {
    expect(planTerraform(levelledGame(5).state, 'raise', rect).ok).toBe(true);
    expect(planTerraform(levelledGame(7).state, 'raise', rect).ok).toBe(false);
  });

  test('a lower limit refuses raising above it; the default still matches MAX_HEIGHT', () => {
    const game = levelledGame(5);
    setSetting(game.state, 'mapHeightLimit', 5);
    expect(planTerraform(game.state, 'raise', rect).ok).toBe(false);
    const game2 = levelledGame(5);
    setSetting(game2.state, 'mapHeightLimit', 6);
    expect(planTerraform(game2.state, 'raise', rect).ok).toBe(true);
    expect(getSetting(game2.state, 'mapHeightLimit')).toBe(6);
  });
});
