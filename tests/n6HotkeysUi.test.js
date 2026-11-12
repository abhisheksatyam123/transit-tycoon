/** N6: fixed keys cannot be bound, the editor's capture listener is detached on close, and hints follow bindings. */
import { test, expect, describe } from 'bun:test';
import { FIXED_SHORTCUTS } from '../js/input/fixedShortcuts.js';
import {
  bindProblem, isFixedKey, captureKeydown, loadOverrides, setOverrides, currentOverrides, HOTKEYS_STORAGE_KEY,
} from '../js/ui/hotkeys.js';
import { PREF_META } from '../js/ui/settingsGroups.js';

/** Minimal event-target stub that records listeners, so attach/detach can be checked. */
function fakeTarget() {
  const set = new Set();
  return {
    set,
    addEventListener(type, fn, capture) { if (type === 'keydown' && capture === true) set.add(fn); },
    removeEventListener(type, fn, capture) { if (type === 'keydown' && capture === true) set.delete(fn); },
  };
}

describe('fixed keys are refused by bindProblem', () => {
  test('every FIXED_SHORTCUTS key (c, delete, f1..f10) is a reserved shortcut', () => {
    expect(FIXED_SHORTCUTS.length).toBeGreaterThan(0);
    for (const s of FIXED_SHORTCUTS) {
      expect(isFixedKey(s.key)).toBe(true);
      const msg = bindProblem(s.key);
      expect(typeof msg).toBe('string');
      expect(msg).toContain('reserved shortcut');
    }
  });

  test('named keys from the audit', () => {
    for (const k of ['c', 'delete', 'f1', 'f8', 'f10']) expect(bindProblem(k)).toContain('reserved shortcut');
  });

  test('a free key is still allowed', () => {
    expect(bindProblem('g')).toBeNull();
    expect(bindProblem('f')).toBeNull(); // Finances default: not the fixed F-key
    expect(isFixedKey('g')).toBe(false);
  });
});

describe('stored bindings to fixed keys are dropped', () => {
  test('loadOverrides ignores a binding to a fixed key (it could never fire)', () => {
    const st = { getItem: (k) => (k === HOTKEYS_STORAGE_KEY ? '{"win:vehicles":"f8","tool:rail":"g"}' : null) };
    expect(loadOverrides(st)).toEqual({ 'tool:rail': 'g' });
  });
});

describe('editor capture listener', () => {
  test('captureKeydown attaches once and the returned detach removes it', () => {
    const t = fakeTarget();
    const fn = () => {};
    const detach = captureKeydown(t, fn);
    expect(t.set.has(fn)).toBe(true);
    detach();
    expect(t.set.size).toBe(0);
  });

  test('re-arming capture after detach leaves exactly one listener', () => {
    const t = fakeTarget();
    const fn = () => {};
    let detach = captureKeydown(t, fn);
    detach();
    detach = captureKeydown(t, fn);
    expect(t.set.size).toBe(1);
    detach();
    expect(t.set.size).toBe(0);
  });
});

describe('hints follow the current binding', () => {
  const sound = () => PREF_META.find((p) => p.id === 'sound').help;
  const gfx = () => PREF_META.find((p) => p.id === 'gfx').help;
  test('default hints show the default keys', () => {
    setOverrides({});
    expect(sound()).toContain('(M)');
    expect(gfx()).toContain('Same as K.');
  });
  test('a rebind changes the displayed hint', () => {
    setOverrides({ sound: 'q', graphics: 'y' });
    expect(currentOverrides()).toEqual({ sound: 'q', graphics: 'y' });
    expect(sound()).toContain('(Q)');
    expect(gfx()).toContain('Same as Y.');
    setOverrides({});
  });
});
