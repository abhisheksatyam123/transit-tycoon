/**
 * W1 UI gaps: (1) OpenTTD TransparencyOption::Text (src/transparency.h:29 "loading and cost/income text",
 * applied in src/texteff.cpp:120) — TT has no per-vehicle loading text, its map text effects are the
 * floating income popups, so the class is 'text'; (2) the hotkey editor accepts Ctrl/Alt combinations
 * (the game's fixed transparency hotkeys are Ctrl+1..9), while the defaults stay single keys.
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import {
  HOTKEY_ACTIONS, HOTKEYS_STORAGE_KEY, defaultKeys, effectiveKeys, loadOverrides, saveOverrides,
  findConflict, bindKey, bindProblem, keyLabel, keyFromEvent, isKeyCombo, shortcutTable,
  RESERVED_COMBOS, BROWSER_RESERVED_COMBOS,
} from '../js/ui/hotkeys.js';
import {
  TRANSPARENCY_OPTIONS, TRANSPARENCY_KEY, TRANSPARENT_ALPHA,
  loadTransparency, setTransparency, resetTransparencyCache, tileTransparency, catenaryAlpha,
} from '../js/renderer/transparency.js';
import { FloatingTexts } from '../js/renderer/layers/overlays.js';
import { PREF_META } from '../js/ui/settingsGroups.js';

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

describe('hotkey defaults stay single keys', () => {
  test('no default binding contains a modifier', () => {
    for (const a of HOTKEY_ACTIONS) {
      expect(a.key.includes('+')).toBe(false);
      expect(isKeyCombo(a.key)).toBe(false);
    }
  });

  test('default map is unchanged and valid', () => {
    const d = defaultKeys();
    expect(d.pause).toBe(' ');
    expect(d['tool:rail']).toBe('1');
    expect(d['win:hotkeys']).toBe('?');
    for (const k of Object.values(d)) expect(bindProblem(k)).toBeNull();
  });
});

describe('keyFromEvent: modifier combinations', () => {
  test('plain and shift-only events keep the old single key', () => {
    expect(keyFromEvent({ key: 'A', code: 'KeyA' })).toBe('a');
    expect(keyFromEvent({ key: 'A', code: 'KeyA', shiftKey: true })).toBe('a');
    expect(keyFromEvent({ key: 'Spacebar' })).toBe(' ');
    expect(keyFromEvent({ key: '1', code: 'Digit1' })).toBe('1');
  });

  test('ctrl / alt / meta / shift combinations are canonical', () => {
    expect(keyFromEvent({ key: '1', code: 'Digit1', ctrlKey: true })).toBe('ctrl+1');
    expect(keyFromEvent({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })).toBe('ctrl+shift+1');
    expect(keyFromEvent({ key: 'K', code: 'KeyK', ctrlKey: true, altKey: true })).toBe('ctrl+alt+k');
    expect(keyFromEvent({ key: 'F4', code: 'F4', altKey: true, shiftKey: true })).toBe('alt+shift+f4');
    expect(keyFromEvent({ key: 'k', code: 'KeyK', metaKey: true })).toBe('ctrl+k'); // Cmd on macOS = Ctrl
    expect(keyFromEvent({ key: ' ', code: 'Space', ctrlKey: true })).toBe('ctrl+ ');
  });

  test('modifier-only and unusable keys return null', () => {
    expect(keyFromEvent({ key: 'Control', ctrlKey: true })).toBeNull();
    expect(keyFromEvent({ key: 'Shift', shiftKey: true })).toBeNull();
    expect(keyFromEvent({ key: '' })).toBeNull();
    expect(keyFromEvent(null)).toBeNull();
  });
});

describe('keyLabel for combinations', () => {
  test('modifiers get human names in stored order', () => {
    expect(keyLabel('ctrl+1')).toBe('Ctrl+1');
    expect(keyLabel('ctrl+shift+1')).toBe('Ctrl+Shift+1');
    expect(keyLabel('alt+f4')).toBe('Alt+F4');
    expect(keyLabel('ctrl+ ')).toBe('Ctrl+Space');
    expect(keyLabel('ctrl+numpad5')).toBe('Ctrl+Numpad5');
  });

  test('single keys are unchanged', () => {
    expect(keyLabel(' ')).toBe('Space');
    expect(keyLabel('z')).toBe('Z');
    expect(keyLabel('f1')).toBe('F1');
    expect(keyLabel('escape')).toBe('Escape');
    expect(keyLabel('')).toBe('');
  });
});

describe('bindProblem: what the editor refuses', () => {
  test('accepts combinations the game does not use', () => {
    expect(bindProblem('ctrl+alt+k')).toBeNull();
    expect(bindProblem('ctrl+shift+s')).toBeNull();
    expect(bindProblem('alt+g')).toBeNull();
    expect(bindProblem('ctrl+0')).toBeNull();
  });

  test('refuses the fixed game toggles (transparency Ctrl+digit, cheats)', () => {
    for (const k of RESERVED_COMBOS) expect(bindProblem(k)).not.toBeNull();
    expect(bindProblem('ctrl+1')).toContain('used by the game');
    expect(bindProblem('ctrl+shift+9')).toContain('used by the game');
    expect(bindProblem('ctrl+alt+c')).toContain('used by the game');
  });

  test('refuses browser-reserved combinations', () => {
    for (const k of BROWSER_RESERVED_COMBOS) expect(bindProblem(k)).toContain('browser');
    expect(bindProblem('ctrl+w')).toContain('browser');
  });

  test('single reserved keys keep their old message', () => {
    expect(bindProblem('escape')).toContain('reserved for camera');
    expect(bindProblem('w')).toContain('reserved for camera');
    expect(bindProblem('')).not.toBeNull();
  });
});

describe('combinations bind, conflict and persist', () => {
  test('bindKey accepts a combination and shortcutTable dispatches it', () => {
    const r = bindKey({}, 'tool:rail', 'ctrl+shift+k');
    const keys = effectiveKeys(r.overrides);
    expect(keys['tool:rail']).toBe('ctrl+shift+k');
    expect(findConflict(keys, 'tool:road', 'ctrl+shift+k')).toBe('tool:rail');
    const calls = [];
    const t = shortcutTable(keys, { 'tool:rail': () => calls.push('rail') });
    expect(t['ctrl+shift+k']).toBeDefined();
    t['ctrl+shift+k']();
    expect(calls).toEqual(['rail']);
  });

  test('a combination survives save/load; defaults are still not stored', () => {
    const st = fakeStorage();
    saveOverrides({ 'tool:rail': 'ctrl+shift+k', 'tool:road': '2' }, st);
    expect(JSON.parse(st.m.get(HOTKEYS_STORAGE_KEY))).toEqual({ 'tool:rail': 'ctrl+shift+k' });
    expect(loadOverrides(st)).toEqual({ 'tool:rail': 'ctrl+shift+k' });
  });

  test('bindKey to the default removes the override', () => {
    expect(bindKey({ 'tool:rail': 'ctrl+shift+k' }, 'tool:rail', '1').overrides).toEqual({});
  });
});

describe('text transparency class (OpenTTD TransparencyOption::Text)', () => {
  beforeEach(() => {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    };
    resetTransparencyCache();
  });

  test('appended after catenary, so Ctrl+9 toggles it', () => {
    expect(TRANSPARENCY_OPTIONS.map((o) => o.id)).toEqual([
      'buildings', 'trees', 'industries', 'stations', 'bridges', 'signs', 'structures', 'catenary', 'text',
    ]);
    expect(TRANSPARENCY_OPTIONS[8].id).toBe('text');
    expect(TRANSPARENCY_OPTIONS[8].label).toBe('Text');
  });

  test('off by default and persisted like the other classes', () => {
    expect(loadTransparency()).toBeNull();
    setTransparency('text', true);
    expect(loadTransparency().text).toBe(true);
    expect(JSON.parse(localStorage.getItem(TRANSPARENCY_KEY)).text).toBe(true);
    setTransparency('text', false);
    expect(loadTransparency()).toBeNull();
  });

  test('it does not fade tiles or catenary', () => {
    const tr = { text: true };
    expect(tileTransparency({ building: { type: 'house' } }, tr)).toBe(1);
    expect(tileTransparency({ terrain: 'forest' }, tr)).toBe(1);
    expect(catenaryAlpha(tr)).toBe(1);
    expect(catenaryAlpha({ catenary: true })).toBe(TRANSPARENT_ALPHA);
  });

  test('the settings window lists it with the other classes', () => {
    const p = PREF_META.find((x) => x.id === 'tr:text');
    expect(p.group).toBe('interface');
    expect(p.help).toContain('Ctrl+9');
  });
});

/** Canvas 2D stub for FloatingTexts: records every glyph draw. */
function textCtx() {
  const drawn = [];
  return {
    drawn,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, globalAlpha: 1,
    strokeStyle: '', fillStyle: '',
    strokeText(t) { drawn.push(['stroke', t]); },
    fillText(t) { drawn.push(['fill', t]); },
  };
}

describe('FloatingTexts with the text class on', () => {
  const cam = { x: 0, y: 0, zoom: 1, viewW: 800, viewH: 600 };

  test('visible by default (unchanged)', () => {
    const f = new FloatingTexts();
    f.add(10, 10, '+$100', '#4ade80');
    const c = textCtx();
    f.draw(c, 0.1, cam, false);
    expect(c.drawn.filter(([k]) => k === 'fill').length).toBe(1);
    expect(f.items.length).toBe(1);
  });

  test('hidden draws nothing but still ages the popup out', () => {
    const f = new FloatingTexts();
    f.add(10, 10, '-$50', '#f87171');
    const c = textCtx();
    f.draw(c, 0.1, cam, true);
    expect(c.drawn.length).toBe(0);
    expect(f.items.length).toBe(1); // still alive, just not drawn
    f.draw(c, 2.5, cam, true); // past the 2.2 s lifetime
    expect(c.drawn.length).toBe(0);
    expect(f.items.length).toBe(0);
  });
});
