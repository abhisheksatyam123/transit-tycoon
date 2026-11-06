import { test, expect, describe, beforeEach } from 'bun:test';
import { parseA11y, loadA11y, setA11y, resetA11yCache, A11Y_DEFAULTS, UI_SCALES, uiScaleFactor, applyA11y } from '../js/ui/a11yPrefs.js';

describe('a11y prefs (tt.a11y)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    resetA11yCache();
  });

  test('defaults are 100%, high contrast off, reduce motion off', () => {
    expect(A11Y_DEFAULTS).toEqual({ uiScale: 100, highContrast: false, reduceMotion: false });
    expect(UI_SCALES).toEqual([75, 100, 125, 150, 200]);
    expect(loadA11y()).toEqual(A11Y_DEFAULTS);
    expect(uiScaleFactor()).toBe(1);
  });

  test('parse: invalid JSON, arrays and bad values fall back to defaults', () => {
    expect(parseA11y('{not json')).toEqual(A11Y_DEFAULTS);
    expect(parseA11y('[1,2]')).toEqual(A11Y_DEFAULTS);
    expect(parseA11y('null')).toEqual(A11Y_DEFAULTS);
    expect(parseA11y('{"uiScale":133,"highContrast":"yes","reduceMotion":1}')).toEqual(A11Y_DEFAULTS);
    expect(parseA11y(null)).toEqual(A11Y_DEFAULTS);
  });

  test('parse: valid values are kept', () => {
    expect(parseA11y('{"uiScale":150,"highContrast":true,"reduceMotion":true}')).toEqual({ uiScale: 150, highContrast: true, reduceMotion: true });
    expect(parseA11y('{"uiScale":"200"}').uiScale).toBe(200);
  });

  test('setA11y persists to localStorage and loads back after a cache reset', () => {
    setA11y({ uiScale: 125, highContrast: true });
    expect(JSON.parse(store.get('tt.a11y'))).toEqual({ uiScale: 125, highContrast: true, reduceMotion: false });
    resetA11yCache();
    expect(loadA11y()).toEqual({ uiScale: 125, highContrast: true, reduceMotion: false });
    expect(uiScaleFactor()).toBe(1.25);
  });

  test('setA11y normalises an invalid scale to the default', () => {
    expect(setA11y({ uiScale: 42 }).uiScale).toBe(100);
  });

  test('a patch keeps the other fields', () => {
    setA11y({ reduceMotion: true });
    setA11y({ uiScale: 75 });
    expect(loadA11y()).toEqual({ uiScale: 75, highContrast: false, reduceMotion: true });
  });

  test('applyA11y sets --ui-scale and the hc / reduce-motion classes on the root', () => {
    setA11y({ uiScale: 150, highContrast: true, reduceMotion: true });
    const set = new Map(); const cls = new Set();
    const root = { style: { setProperty: (k, v) => set.set(k, v) }, classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } };
    applyA11y(root);
    expect(set.get('--ui-scale')).toBe('1.5');
    expect([...cls].sort()).toEqual(['hc', 'reduce-motion']);
    setA11y({ uiScale: 100, highContrast: false, reduceMotion: false });
    applyA11y(root);
    expect(set.get('--ui-scale')).toBe('1');
    expect(cls.size).toBe(0);
  });

  test('works without localStorage (memory only)', () => {
    globalThis.localStorage = undefined;
    resetA11yCache();
    expect(setA11y({ uiScale: 200 }).uiScale).toBe(200);
    expect(loadA11y().uiScale).toBe(200);
  });
});
