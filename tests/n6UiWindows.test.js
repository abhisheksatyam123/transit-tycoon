/**
 * N6 UI fixes (UI only, no simulation state):
 *  - title menu Resume/Esc restores the speed the game had (including paused = 0)
 *  - prompt is modal: Escape/Space stop at the backdrop, Tab cycles inside, focus pulled back, Enter submits
 *  - replacing a running game / overwriting an occupied slot asks first (discardGuard helpers)
 *  - WindowManager.open returns null and unregisters when build() throws
 *  - setGame-style closeAll({includeSticky}) closes pinned windows too
 * Runs against a tiny fake DOM (no jsdom in the repo), like roundADShade.test.js.
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { WindowManager } from '../js/ui/windowManager.js';
import { openPrompt, nextFocusIndex } from '../js/ui/prompt.js';
import { openTitleMenu, titleMenuOpen } from '../js/ui/titleMenu.js';
import { confirmDiscardGame, confirmOverwriteSlot } from '../js/ui/discardGuard.js';

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.value = '';
    this._classes = new Set();
    this._text = '';
    this.hidden = false;
    this._listeners = {};
    this._connected = false;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      toggle: (c, on) => {
        const v = on === undefined ? !this._classes.has(c) : !!on;
        if (v) this._classes.add(c); else this._classes.delete(c);
        return v;
      },
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get title() { return this.attrs.title || ''; }
  set title(v) { this.attrs.title = String(v); }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; }
  set textContent(v) { this._text = String(v); for (const c of this.children) c.parentNode = null; this.children = []; }
  get isConnected() { return this._connected; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { return this.insertBefore(c, null); }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this;
    c._setConnected(true);
    return c;
  }
  _setConnected(on) { this._connected = on; for (const c of this.children) c._setConnected(on); }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    c._setConnected(false);
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  querySelector(sel) { return find(this, (n) => (sel.startsWith('.') ? n.classList.contains(sel.slice(1)) : n.tagName === sel.toUpperCase())); }
  focus() { globalThis.document.activeElement = this; }
  select() {}
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn); }
  /** Dispatch on this node only (no capture/bubble path): tests call the listeners they care about. */
  fire(type, init = {}) {
    const ev = { type, key: '', target: this, shiftKey: false, defaultPrevented: false, stopped: false, ...init,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    for (const fn of this._listeners[type] || []) fn(ev);
    return ev;
  }
}
function find(node, pred) {
  for (const c of node.children) {
    if (pred(c)) return c;
    const f = find(c, pred);
    if (f) return f;
  }
  return null;
}
const findAll = (node, pred, out = []) => {
  for (const c of node.children) { if (pred(c)) out.push(c); findAll(c, pred, out); }
  return out;
};
const byText = (root, text) => findAll(root, (n) => n.tagName === 'BUTTON' && n.textContent === text)[0];

const docListeners = {};
function installDom() {
  for (const k of Object.keys(docListeners)) delete docListeners[k];
  globalThis.Node = FakeNode;
  const body = new FakeNode('body');
  body._connected = true;
  globalThis.document = {
    body,
    createElement: (t) => new FakeNode(t),
    createTextNode: (t) => { const n = new FakeNode('#text'); n._text = String(t); return n; },
    activeElement: null,
    documentElement: new FakeNode('html'),
    addEventListener: (t, fn) => (docListeners[t] ||= []).push(fn),
    removeEventListener: (t, fn) => { docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn); },
  };
  globalThis.document.documentElement.style.getPropertyValue = () => '';
  const winListeners = {};
  globalThis.window = {
    innerWidth: 1024, innerHeight: 768, _l: winListeners,
    addEventListener: (t, fn) => (winListeners[t] ||= []).push(fn),
    removeEventListener: (t, fn) => { winListeners[t] = (winListeners[t] || []).filter((f) => f !== fn); },
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
}
const winKey = (key) => {
  const ev = { key, shiftKey: false, stopped: false, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  for (const fn of [...(window._l.keydown || [])]) fn(ev);
  return ev;
};

describe('nextFocusIndex (prompt focus trap)', () => {
  test('cycles forward and backward inside the list, wraps at both ends', () => {
    expect(nextFocusIndex(3, 0)).toBe(1);
    expect(nextFocusIndex(3, 2)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 2, true)).toBe(1);
  });
  test('focus outside the dialog lands on the first (or last when backwards); empty list gives -1', () => {
    expect(nextFocusIndex(3, -1)).toBe(0);
    expect(nextFocusIndex(3, -1, true)).toBe(2);
    expect(nextFocusIndex(0, 0)).toBe(-1);
  });
});

describe('openPrompt keyboard handling', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; });

  function mk(onSubmit = () => ({ ok: true })) {
    const p = openPrompt({ title: 'Rename', value: 'abc', onSubmit });
    const input = findAll(p.root, (n) => n.tagName === 'INPUT')[0];
    return { ...p, input, cancel: byText(p.root, 'Cancel'), ok: byText(p.root, 'OK') };
  }

  test('Escape closes the prompt from a button and never reaches the window beneath', () => {
    const { root, cancel } = mk();
    const beneath = []; // a window-level listener standing in for the window manager / input.js
    window.addEventListener('keydown', (e) => beneath.push(e.key));
    const ev = root.fire('keydown', { key: 'Escape', target: cancel });
    expect(ev.stopped).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(root.isConnected).toBe(false);
    expect(beneath).toEqual([]); // the backdrop capture handler stopped it, nothing reached the window
  });

  test('plain shortcut keys (Space, letters) are stopped at the backdrop while the prompt is open', () => {
    const { root, cancel } = mk();
    const ev = root.fire('keydown', { key: ' ', target: cancel });
    expect(ev.stopped).toBe(true);
    expect(root.isConnected).toBe(true);
    expect(root.fire('keydown', { key: 'p', target: cancel }).stopped).toBe(true);
    expect(root.fire('keyup', { key: ' ', target: cancel }).stopped).toBe(true);
  });

  test('Tab cycles focus inside the dialog; Shift+Tab goes back', () => {
    const { root, input, cancel, ok } = mk();
    root.fire('keydown', { key: 'Tab', target: input });
    expect(document.activeElement).toBe(cancel);
    root.fire('keydown', { key: 'Tab', target: cancel });
    expect(document.activeElement).toBe(ok);
    root.fire('keydown', { key: 'Tab', target: ok });
    expect(document.activeElement).toBe(input);
    root.fire('keydown', { key: 'Tab', target: input, shiftKey: true });
    expect(document.activeElement).toBe(ok);
  });

  test('Enter on the input submits; a successful submit closes', () => {
    let got = null;
    const { root, input } = mk((t) => { got = t; return { ok: true }; });
    input.value = 'New name';
    root.fire('keydown', { key: 'Enter', target: input });
    expect(got).toBe('New name');
    expect(root.isConnected).toBe(false);
  });

  test('a rejected submit keeps the prompt open with the error', () => {
    const { root, input } = mk(() => ({ ok: false, error: 'Taken' }));
    root.fire('keydown', { key: 'Enter', target: input });
    expect(root.isConnected).toBe(true);
    expect(findAll(root, (n) => n.tagName === 'DIV' && n.textContent === 'Taken').length).toBe(1);
  });

  test('focus that leaves the dialog is pulled back to the input; the listener is removed on close', () => {
    const { root, input, close } = mk();
    const outside = new FakeNode('button');
    document.body.appendChild(outside);
    const focusin = docListeners.focusin[docListeners.focusin.length - 1];
    focusin({ target: outside });
    expect(document.activeElement).toBe(input);
    close();
    expect(root.isConnected).toBe(false);
    expect(docListeners.focusin.length).toBe(0);
  });

  test('close() is idempotent', () => {
    const { root, close } = mk();
    close();
    close();
    expect(root.isConnected).toBe(false);
  });
});

describe('discard / overwrite guards', () => {
  test('no running game: nothing to discard, no question asked', () => {
    let asked = false;
    expect(confirmDiscardGame(null, () => { asked = true; return false; })).toBe(true);
    expect(asked).toBe(false);
  });
  test('running game: the answer decides (Cancel keeps the game)', () => {
    expect(confirmDiscardGame({}, () => false)).toBe(false);
    expect(confirmDiscardGame({}, () => true)).toBe(true);
  });
  test('overwrite asks with the slot number; Cancel means no overwrite', () => {
    let msg = '';
    expect(confirmOverwriteSlot('2', (m) => { msg = m; return false; })).toBe(false);
    expect(msg).toContain('slot 2');
    expect(confirmOverwriteSlot('2', () => true)).toBe(true);
  });
});

describe('WindowManager build failure', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; });

  test('a throwing build returns null, closes the window (onClose runs) and leaves nothing registered', () => {
    const container = new FakeNode('div');
    const wm = new WindowManager(container);
    let closed = 0;
    const r = wm.open('bad', { title: 'Bad', onClose: () => closed++, build() { throw new Error('boom'); } });
    expect(r).toBeNull();
    expect(wm.isOpen('bad')).toBe(false);
    expect(wm.windows.size).toBe(0);
    expect(container.children.length).toBe(0);
    expect(closed).toBe(1);
  });

  test('a later open() of the same id builds again instead of returning the broken window', () => {
    const container = new FakeNode('div');
    const wm = new WindowManager(container);
    wm.open('x', { title: 'X', build() { throw new Error('boom'); } });
    const ok = wm.open('x', { title: 'X', build: () => undefined });
    expect(ok).not.toBeNull();
    expect(wm.isOpen('x')).toBe(true);
  });
});

describe('closeAll includeSticky (setGame closes pinned windows)', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; });

  test('default closeAll keeps pinned windows; includeSticky closes them too', () => {
    const wm = new WindowManager(new FakeNode('div'));
    wm.open('a', { title: 'A', build: () => undefined });
    const pinned = wm.open('p', { title: 'P', build: () => undefined });
    pinned.setSticky(true);
    wm.closeAll();
    expect(wm.isOpen('a')).toBe(false);
    expect(wm.isOpen('p')).toBe(true);
    wm.closeAll({ includeSticky: true });
    expect(wm.windows.size).toBe(0);
  });
});

describe('title menu resume speed', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; delete globalThis.localStorage; });

  /** App stub: only what the menu touches. prevSpeed is the last non-zero speed, as in app.js. */
  function fakeApp(speed, prevSpeed) {
    const app = {
      speed, prevSpeed, game: null, toast() {}, open() {},
      setSpeed(s) { app.speed = s; if (s > 0) app.prevSpeed = s; },
    };
    return app;
  }
  const escape = () => {
    const ev = { key: 'Escape', preventDefault() {}, stopPropagation() {} };
    for (const fn of [...window._l.keydown]) fn(ev);
  };

  test('paused game (speed 0, prevSpeed 2): Escape keeps it paused', () => {
    const app = fakeApp(0, 2);
    openTitleMenu(app);
    expect(app.speed).toBe(0);
    escape();
    expect(titleMenuOpen()).toBe(false);
    expect(app.speed).toBe(0);
  });

  test('running at speed 2: Escape restores 2', () => {
    const app = fakeApp(2, 2);
    openTitleMenu(app);
    expect(app.speed).toBe(0);
    escape();
    expect(app.speed).toBe(2);
  });
});
