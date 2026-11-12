// D3 invisibility opt-in: Ctrl+Shift+1..8 HIDES the class when setting transparencyInvisibleHides is on,
// otherwise it is the same alias as Ctrl+digit (fade). Drives the real keydown handler in input/input.js.
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { setupInput } from '../js/input/input.js';
import {
  TRANSPARENCY_KEY, TRANSPARENCY_HIDDEN, TRANSPARENCY_OPTIONS, TRANSPARENT_ALPHA,
  loadTransparency, resetTransparencyCache, tileTransparency, classAlpha,
} from '../js/renderer/transparency.js';

const g = globalThis;

describe('D3 transparencyInvisibleHides setting', () => {
  test('default is false and has exactly one SETTING_META entry', () => {
    expect(DEFAULT_SETTINGS.transparencyInvisibleHides).toBe(false);
    const metas = SETTING_META.filter((m) => m.key === 'transparencyInvisibleHides');
    expect(metas.length).toBe(1);
    expect(metas[0].type).toBe('check');
    expect(metas[0].help).toMatch(/Ctrl\+Shift\+1\.\.8 hides the class instead of fading it/);
  });
});

describe('D3 Ctrl+Shift+digit handling', () => {
  let store, handler, state, toasts, invalidated;
  const saved = { window: g.window, document: g.document, localStorage: g.localStorage };

  function keydown(opts) {
    const e = {
      key: '', code: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
      target: { tagName: 'DIV' }, preventDefault() { e.prevented = true; }, prevented: false, ...opts,
    };
    handler(e);
    return e;
  }
  const ctrl = (digit) => keydown({ ctrlKey: true, code: `Digit${digit}`, key: String(digit) });
  const ctrlShift = (digit) => keydown({ ctrlKey: true, shiftKey: true, code: `Digit${digit}`, key: '!' });
  const cur = () => loadTransparency() || {};

  beforeEach(() => {
    store = new Map();
    g.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    resetTransparencyCache();
    toasts = [];
    invalidated = 0;
    const listeners = [];
    g.document = { body: {} };
    g.window = { addEventListener: (t, fn) => listeners.push([t, fn]), removeEventListener() {} };
    const canvas = {
      addEventListener() {}, focus() {}, setPointerCapture() {}, releasePointerCapture() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    };
    state = { map: { width: 4, height: 4 }, settings: {} };
    const app = {
      game: { state },
      renderer: { invalidateGround: () => { invalidated++; }, overlay: {}, camera: { zoomAt() {} } },
      toast: (msg) => toasts.push(msg),
    };
    setupInput(app, canvas, {});
    // the first window keydown listener after the save-block one is the transparency/cheats handler
    handler = listeners.filter(([t]) => t === 'keydown')[1][1];
  });
  afterEach(() => {
    g.window = saved.window; g.document = saved.document; g.localStorage = saved.localStorage;
    resetTransparencyCache();
  });

  test('setting off (default): Ctrl+Shift+1 is the fade alias, same as Ctrl+1', () => {
    expect(DEFAULT_SETTINGS.transparencyInvisibleHides).toBe(false);
    const e = ctrlShift(1);
    expect(e.prevented).toBe(true);
    expect(cur().buildings).toBe(true); // faded, not hidden
    expect(toasts.at(-1)).toBe('Buildings transparency: on');
    ctrlShift(1);
    expect(cur().buildings).toBeFalsy();
    expect(store.has(TRANSPARENCY_KEY)).toBe(true);
  });

  test('setting explicitly false behaves the same as default', () => {
    setSetting(state, 'transparencyInvisibleHides', false);
    ctrlShift(3);
    expect(cur().industries).toBe(true);
  });

  test('setting on: Ctrl+Shift+digit 1..8 HIDES the class (not faded), toggles back off', () => {
    setSetting(state, 'transparencyInvisibleHides', true);
    for (let d = 1; d <= 8; d++) {
      const id = TRANSPARENCY_OPTIONS[d - 1].id;
      const e = ctrlShift(d);
      expect(e.prevented).toBe(true);
      expect(cur()[id]).toBe(TRANSPARENCY_HIDDEN);
      expect(toasts.at(-1)).toBe(`${TRANSPARENCY_OPTIONS[d - 1].label} hidden`);
      ctrlShift(d);
      expect(cur()[id]).toBeFalsy();
      expect(toasts.at(-1)).toBe(`${TRANSPARENCY_OPTIONS[d - 1].label} shown`);
    }
    expect(invalidated).toBe(16);
  });

  test('setting on: Ctrl+Shift+9 (text, not an invisibility class) keeps the fade alias', () => {
    setSetting(state, 'transparencyInvisibleHides', true);
    ctrlShift(9);
    expect(cur().text).toBe(true);
  });

  test('setting on: Ctrl+digit (no shift) still fades in both modes', () => {
    setSetting(state, 'transparencyInvisibleHides', true);
    ctrl(2); // trees: fade toggle, stored as true
    expect(cur().trees).toBe(true);
    expect(toasts.at(-1)).toBe('Trees transparency: on');
    ctrl(2);
    expect(cur().trees).toBeFalsy();
  });

  test('setting off: Ctrl+digit unchanged', () => {
    ctrl(5);
    expect(cur().bridges).toBe(true);
    expect(toasts.at(-1)).toBe('Bridges transparency: on');
  });

  test('a hidden class ends a Ctrl+digit toggle as off (fade toggle clears it)', () => {
    setSetting(state, 'transparencyInvisibleHides', true);
    ctrlShift(6);
    expect(cur().signs).toBe(TRANSPARENCY_HIDDEN);
    ctrl(6);
    expect(cur().signs).toBeFalsy();
  });
});

describe('D3 renderer alpha for hidden classes', () => {
  test('classAlpha: hidden 0, faded TRANSPARENT_ALPHA, normal 1', () => {
    expect(classAlpha(null, 'bridges')).toBe(1);
    expect(classAlpha({ bridges: TRANSPARENCY_HIDDEN }, 'bridges')).toBe(0);
    expect(classAlpha({ bridges: true }, 'bridges')).toBe(TRANSPARENT_ALPHA);
    expect(classAlpha({ bridges: false, signs: true }, 'bridges')).toBe(1);
  });

  test('tileTransparency: hidden buildings/industries/stations return 0, faded return TRANSPARENT_ALPHA', () => {
    const house = { building: { type: 'house' } };
    expect(tileTransparency(house, { buildings: TRANSPARENCY_HIDDEN })).toBe(0);
    expect(tileTransparency(house, { buildings: true })).toBe(TRANSPARENT_ALPHA);
    expect(tileTransparency({ building: { type: 'industry' } }, { industries: TRANSPARENCY_HIDDEN })).toBe(0);
    expect(tileTransparency({ building: { type: 'station' } }, { stations: true })).toBe(TRANSPARENT_ALPHA);
    expect(tileTransparency({ object: {} }, { structures: TRANSPARENCY_HIDDEN })).toBe(0);
    expect(tileTransparency(house, { trees: true })).toBe(1);
  });
});
