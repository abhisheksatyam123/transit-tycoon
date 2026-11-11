/** Round AC7: fixed GUI hotkeys (Delete, C, F1-F4/F7-F10) and their read-only hotkey-editor entries. */
import { test, expect, describe } from 'bun:test';
import {
  FIXED_SHORTCUTS, C_SHADOWING_TOOLS, fixedShortcutFor, isTypingTarget, runFixedShortcut,
} from '../js/input/fixedShortcuts.js';
import { HOTKEY_ACTIONS, RESERVED_KEYS, READ_ONLY_HOTKEYS, defaultKeys } from '../js/ui/hotkeys.js';

/** App stub that records every action. */
function stubApp() {
  const calls = { closedAll: 0, opened: /** @type {string[]} */ ([]), pauses: 0, centers: /** @type {{x:number,y:number}[]} */ ([]) };
  const app = {
    calls,
    renderer: { overlay: /** @type {any} */ ({ hover: null }) },
    wm: { closeAll: () => { calls.closedAll++; } },
    open: (name) => { calls.opened.push(name); },
    togglePause: () => { calls.pauses++; },
    centerOn: (x, y) => { calls.centers.push({ x, y }); },
    tool: /** @type {any} */ (null),
  };
  return app;
}

describe('fixed shortcut table', () => {
  test('every key is unique and none collides with a rebindable or reserved key', () => {
    const keys = FIXED_SHORTCUTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const rebindable = new Set(Object.values(defaultKeys()));
    for (const k of keys) {
      expect(rebindable.has(k)).toBe(false);
      expect(RESERVED_KEYS.includes(k)).toBe(false);
    }
  });

  test('no browser-reserved key is bound (F5, F6, F11, F12, Ctrl shortcuts)', () => {
    const forbidden = ['f5', 'f6', 'f11', 'f12', 'ctrl+r', 'ctrl+w', 'ctrl+t', 'ctrl+n', 'ctrl+p', 'ctrl+s', 'ctrl+d'];
    for (const s of FIXED_SHORTCUTS) expect(forbidden.includes(s.key)).toBe(false);
  });

  test('lookup is lower-case and unknown keys are ignored', () => {
    expect(fixedShortcutFor('delete')?.action).toBe('closeAll');
    expect(fixedShortcutFor('f10')?.action).toBe('graphs');
    expect(fixedShortcutFor('F10')).toBeNull();
    expect(runFixedShortcut(stubApp(), 'f6')).toBe(false);
  });

  test('fixed keys are listed read-only in the hotkey editor', () => {
    const all = READ_ONLY_HOTKEYS.map((f) => `${f.label} ${f.keys}`);
    const text = all.join(' | ');
    expect(text).toContain('Close all windows');
    expect(text).toContain('Delete');
    expect(text).toContain('Centre view on the tile under the cursor');
    expect(text).toContain('C (when no tool uses C)');
    for (const k of ['F1', 'F2', 'F3', 'F4', 'F7', 'F8', 'F9', 'F10']) expect(text).toContain(k);
  });
});

describe('Delete closes all windows', () => {
  test('Delete calls wm.closeAll() once', () => {
    const app = stubApp();
    expect(runFixedShortcut(app, 'delete')).toBe(true);
    expect(app.calls.closedAll).toBe(1);
  });

  test('Delete does nothing while typing in a text input', () => {
    const app = stubApp();
    expect(runFixedShortcut(app, 'delete', { target: { tagName: 'INPUT' } })).toBe(false);
    expect(runFixedShortcut(app, 'delete', { target: { tagName: 'TEXTAREA' } })).toBe(false);
    expect(runFixedShortcut(app, 'delete', { target: { tagName: 'SELECT' } })).toBe(false);
    expect(app.calls.closedAll).toBe(0);
    expect(isTypingTarget({ tagName: 'input' })).toBe(false); // tagName is upper-case on elements
  });
});

describe('C centres on the tile under the cursor', () => {
  test('C moves the view centre to the hover tile', () => {
    const app = stubApp();
    app.renderer.overlay.hover = { x: 42, y: 17 };
    const before = { x: app.calls.centers.length, y: 0 };
    expect(runFixedShortcut(app, 'c')).toBe(true);
    expect(app.calls.centers).toEqual([{ x: 42, y: 17 }]);
    expect(app.calls.centers.length).toBeGreaterThan(before.x); // viewport centre changed
  });

  test('C does nothing when no tile is hovered or while typing', () => {
    const app = stubApp();
    expect(runFixedShortcut(app, 'c')).toBe(false);
    app.renderer.overlay.hover = { x: 1, y: 2 };
    expect(runFixedShortcut(app, 'c', { target: { tagName: 'INPUT' } })).toBe(false);
    expect(app.calls.centers.length).toBe(0);
  });

  test('C is left to tools that own it (Terraform and the line-drag tools)', () => {
    for (const id of C_SHADOWING_TOOLS) {
      const app = stubApp();
      app.renderer.overlay.hover = { x: 3, y: 4 };
      app.tool = { id };
      expect(runFixedShortcut(app, 'c')).toBe(false);
      expect(app.calls.centers.length).toBe(0);
    }
    const app = stubApp();
    app.renderer.overlay.hover = { x: 3, y: 4 };
    app.tool = { id: 'query' };
    expect(runFixedShortcut(app, 'c')).toBe(true); // a tool without C still lets C centre
  });
});

describe('F-keys open the matching TT window', () => {
  const windows = { f2: 'settings', f3: 'save', f4: 'map', f7: 'stations', f8: 'finances', f9: 'companies', f10: 'graphs' };
  for (const [key, name] of Object.entries(windows)) {
    test(`${key.toUpperCase()} opens ${name}`, () => {
      const app = stubApp();
      expect(runFixedShortcut(app, key)).toBe(true);
      expect(app.calls.opened).toEqual([name]);
    });
  }

  test('F1 toggles pause and opens no window', () => {
    const app = stubApp();
    expect(runFixedShortcut(app, 'f1')).toBe(true);
    expect(app.calls.pauses).toBe(1);
    expect(app.calls.opened).toEqual([]);
  });

  test('F-keys do nothing while typing in a text field', () => {
    const app = stubApp();
    for (const s of FIXED_SHORTCUTS) {
      expect(runFixedShortcut(app, s.key, { target: { tagName: 'INPUT' } })).toBe(false);
    }
    expect(app.calls.opened).toEqual([]);
    expect(app.calls.pauses).toBe(0);
    expect(app.calls.closedAll).toBe(0);
  });
});
