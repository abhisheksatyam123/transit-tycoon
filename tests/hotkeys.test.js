import { test, expect, describe } from 'bun:test';
import {
  HOTKEY_ACTIONS, HOTKEYS_STORAGE_KEY, defaultKeys, effectiveKeys, loadOverrides, saveOverrides,
  findConflict, bindKey, bindProblem, resetOverrides, normalizeKey, keyLabel, hotkeyTitle, shortcutTable,
} from '../js/ui/hotkeys.js';

/** Fake localStorage. */
function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

describe('hotkey table defaults', () => {
  test('ids are unique and every default is a single key or Space', () => {
    const ids = HOTKEY_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of HOTKEY_ACTIONS) expect(a.key.length).toBeLessThanOrEqual(1);
  });

  test('defaults reproduce the old hard-coded shortcuts', () => {
    const d = defaultKeys();
    expect(d.pause).toBe(' ');
    expect(d['win:vehicles']).toBe('v');
    expect(d['win:help']).toBe('h');
    expect(d['tool:rail']).toBe('1');
    expect(d['tool:airport']).toBe('0');
    expect(d['tool:terraform']).toBe('z');
    expect(d['tool:plant']).toBe('y');
    expect(d['alt:query']).toBe('q');
    expect(d['win:hotkeys']).toBe('?');
  });

  test('no default key is reserved or duplicated', () => {
    const d = defaultKeys();
    const seen = new Map();
    for (const [id, k] of Object.entries(d)) {
      expect(bindProblem(k)).toBeNull();
      if (seen.has(k)) throw new Error(`default ${k} used by ${seen.get(k)} and ${id}`);
      seen.set(k, id);
    }
  });

  test('effectiveKeys with no overrides equals the defaults', () => {
    expect(effectiveKeys({})).toEqual(defaultKeys());
  });
});

describe('override load / save', () => {
  test('save then load round-trips overrides (fake storage)', () => {
    const st = fakeStorage();
    saveOverrides({ 'tool:rail': 'g' }, st);
    expect(JSON.parse(st.m.get(HOTKEYS_STORAGE_KEY))).toEqual({ 'tool:rail': 'g' });
    expect(loadOverrides(st)).toEqual({ 'tool:rail': 'g' });
  });

  test('defaults are not stored', () => {
    const st = fakeStorage();
    saveOverrides({ 'tool:rail': '1', 'tool:road': 'x' }, st);
    expect(loadOverrides(st)).toEqual({ 'tool:road': 'x' });
  });

  test('empty overrides remove the key', () => {
    const st = fakeStorage({ [HOTKEYS_STORAGE_KEY]: '{"tool:road":"x"}' });
    saveOverrides({}, st);
    expect(st.m.has(HOTKEYS_STORAGE_KEY)).toBe(false);
  });

  test('invalid JSON, unknown ids and bad values are ignored', () => {
    expect(loadOverrides(fakeStorage({ [HOTKEYS_STORAGE_KEY]: '{not json' }))).toEqual({});
    expect(loadOverrides(fakeStorage({ [HOTKEYS_STORAGE_KEY]: '{"nope":"x","tool:rail":5,"tool:road":"q"}' }))).toEqual({ 'tool:road': 'q' });
    expect(loadOverrides(fakeStorage({ [HOTKEYS_STORAGE_KEY]: '[1,2]' }))).toEqual({});
  });

  test('no storage at all is harmless', () => {
    expect(loadOverrides(null)).toEqual({});
    expect(() => saveOverrides({ 'tool:rail': 'g' }, null)).not.toThrow();
  });
});

describe('conflicts', () => {
  test('findConflict names the other action holding the key', () => {
    const keys = effectiveKeys({});
    expect(findConflict(keys, 'tool:road', '1')).toBe('tool:rail');
    expect(findConflict(keys, 'tool:rail', '1')).toBeNull(); // itself is not a conflict
    expect(findConflict(keys, 'tool:rail', 'c')).toBeNull();
  });

  test('binding onto a used key without swap moves the key and leaves the other action unbound', () => {
    const r = bindKey({}, 'tool:road', '1');
    expect(r.displaced).toBeNull();
    expect(effectiveKeys(r.overrides)['tool:road']).toBe('1');
  });

  test('swap gives the old key of the target to the other action', () => {
    const r = bindKey({}, 'tool:road', '1', { swap: true });
    expect(r.displaced).toBe('tool:rail');
    const k = effectiveKeys(r.overrides);
    expect(k['tool:road']).toBe('1');
    expect(k['tool:rail']).toBe('2');
    expect(findConflict(k, 'tool:road', '1')).toBeNull();
  });

  test('reserved keys are refused', () => {
    expect(bindProblem('w')).not.toBeNull();
    expect(bindProblem('escape')).not.toBeNull();
    expect(bindProblem('r')).not.toBeNull();
    expect(bindProblem('g')).toBeNull();
  });
});

describe('reset and labels', () => {
  test('reset returns an empty override set and the effective keys are the defaults', () => {
    const r = bindKey({}, 'tool:rail', 'g').overrides;
    expect(effectiveKeys(r)['tool:rail']).toBe('g');
    expect(effectiveKeys(resetOverrides())).toEqual(defaultKeys());
  });

  test('rebinding back to the default drops the override', () => {
    const r = bindKey({ 'tool:rail': 'c' }, 'tool:rail', '1').overrides;
    expect(r).toEqual({});
  });

  test('normalizeKey lower-cases and maps Spacebar and modifiers', () => {
    expect(normalizeKey('Z')).toBe('z');
    expect(normalizeKey('Spacebar')).toBe(' ');
    expect(normalizeKey('Shift')).toBeNull();
    expect(normalizeKey('')).toBeNull();
  });

  test('keyLabel and hotkeyTitle show the current key', () => {
    expect(keyLabel(' ')).toBe('Space');
    expect(keyLabel('z')).toBe('Z');
    expect(hotkeyTitle('Rail', 'tool:rail', effectiveKeys({ 'tool:rail': 'g' }))).toBe('Rail (G)');
    expect(hotkeyTitle('Rail', 'tool:rail', effectiveKeys({}))).toBe('Rail (1)');
  });

  test('shortcutTable maps the effective key to the handler', () => {
    const calls = [];
    const t = shortcutTable(effectiveKeys({ 'tool:rail': 'g' }), { 'tool:rail': () => calls.push('rail') });
    expect(t.g).toBeDefined();
    expect(t['1']).toBeUndefined();
    t.g();
    expect(calls).toEqual(['rail']);
  });
});
