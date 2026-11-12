/**
 * N7 dialog keyboard cleanup (UI only):
 *  - shared modal containment (js/ui/modal.js): Escape closes the dialog itself, keys stop at the backdrop,
 *    Tab cycles, focus is pulled back; listeners are removed on close
 *  - depot "Sell all" and scenario "Remove" confirms use it (Cancel focused on open, Yes/Sell all runs onYes)
 *  - join picker: Escape cancels only the picker (stopped), close() removes keydown and pointerdown listeners
 * Runs against the same tiny fake DOM as n6UiWindows.test.js (no jsdom in the repo).
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { openConfirm, trapModalKeys } from '../js/ui/modal.js';
import { openJoinPicker } from '../js/ui/tools/joinPicker.js';

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
    querySelectorAll: (sel) => { const out = []; findAll(body, (n) => sel.startsWith('.') && n.classList.contains(sel.slice(1))).forEach((n) => out.push(n)); return out; },
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

const count = (type) => (docListeners[type] || []).length;
const bodyCount = (node, type) => (node._listeners[type] || []).length;
function docKey(key, target, extra = {}) {
  const ev = { type: 'keydown', key, target, shiftKey: false, stopped: false, prevented: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
  for (const fn of [...(docListeners.keydown || [])]) fn(ev);
  return ev;
}

describe('openConfirm (shared Yes/No modal)', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; });

  function mk(onYes = () => {}) {
    const beneath = [];
    window.addEventListener('keydown', (e) => beneath.push(e.key));
    const c = openConfirm({ question: 'Sell all 3?', yesText: 'Sell all', onYes });
    const cancel = byText(c.root, 'Cancel');
    const yes = byText(c.root, 'Sell all');
    return { ...c, cancel, yes, beneath };
  }

  test('Cancel is focused on open and the dialog is in the DOM', () => {
    const { root, cancel } = mk();
    expect(root.isConnected).toBe(true);
    expect(document.activeElement).toBe(cancel);
  });

  test('Escape closes the dialog itself without running onYes and never reaches the window beneath', () => {
    let yes = 0;
    const { root, yes: yesBtn, beneath } = mk(() => { yes++; });
    const ev = root.fire('keydown', { key: 'Escape', target: yesBtn });
    expect(ev.stopped).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(root.isConnected).toBe(false);
    expect(yes).toBe(0);
    expect(beneath).toEqual([]);
  });

  test('Space and letters are stopped at the backdrop while the confirm is open', () => {
    const { root, cancel, beneath } = mk();
    expect(root.fire('keydown', { key: ' ', target: cancel }).stopped).toBe(true);
    expect(root.fire('keydown', { key: 'p', target: cancel }).stopped).toBe(true);
    expect(root.fire('keyup', { key: ' ', target: cancel }).stopped).toBe(true);
    expect(root.isConnected).toBe(true);
    expect(beneath).toEqual([]);
  });

  test('Tab cycles between Cancel and the danger button', () => {
    const { root, cancel, yes } = mk();
    root.fire('keydown', { key: 'Tab', target: cancel });
    expect(document.activeElement).toBe(yes);
    root.fire('keydown', { key: 'Tab', target: yes });
    expect(document.activeElement).toBe(cancel);
  });

  test('focus pulled back when it lands outside; detach removes every listener', () => {
    const { root, cancel } = mk();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    // the fake DOM has no focus events: dispatch the focusin a browser would fire for the move
    for (const fn of [...(docListeners.focusin || [])]) fn({ target: outside });
    expect(document.activeElement).toBe(cancel);
    expect(count('focusin')).toBe(1);
    expect(bodyCount(root, 'keydown')).toBe(1);
    root.fire('keydown', { key: 'Escape', target: cancel });
    expect(count('focusin')).toBe(0);
    expect(bodyCount(root, 'keydown')).toBe(0);
    expect(bodyCount(root, 'keyup')).toBe(0);
    expect(bodyCount(root, 'mousedown')).toBe(0);
  });

  test('Yes runs onYes once after closing; Cancel closes without onYes', () => {
    let yes = 0;
    const a = mk(() => { yes++; });
    a.yes._listeners.click.forEach((f) => f({}));
    expect(yes).toBe(1);
    expect(a.root.isConnected).toBe(false);
    const b = mk(() => { yes++; });
    b.cancel._listeners.click.forEach((f) => f({}));
    expect(yes).toBe(1);
    expect(b.root.isConnected).toBe(false);
  });
});

describe('trapModalKeys', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; });

  test('detach stops the containment: keys reach the window again', () => {
    const backdrop = document.createElement('div');
    document.body.appendChild(backdrop);
    const a = document.createElement('button');
    backdrop.appendChild(a);
    let closes = 0;
    const detach = trapModalKeys(backdrop, { focusables: [a], close: () => closes++ });
    expect(backdrop.fire('keydown', { key: 'Escape', target: a }).stopped).toBe(true);
    expect(closes).toBe(1);
    detach();
    expect(bodyCount(backdrop, 'keydown')).toBe(0);
    expect(count('focusin')).toBe(0);
  });
});

describe('join picker keyboard', () => {
  beforeEach(() => installDom());
  afterEach(() => { delete globalThis.document; delete globalThis.window; });

  const tick = () => new Promise((r) => setTimeout(r, 5));

  test('Escape closes only the picker: propagation stopped, no pick, listeners removed', async () => {
    let picked = 'unset';
    const p = openJoinPicker(null, { x: 1, y: 2, choices: [{ id: 7, name: 'A' }], onPick: (id) => { picked = id; } });
    await tick();
    const beneath = [];
    window.addEventListener('keydown', (e) => beneath.push(e.key));
    const ev = docKey('Escape', document.body);
    expect(ev.stopped).toBe(true);
    expect(ev.prevented).toBe(true);
    expect(picked).toBe('unset');
    expect(count('keydown')).toBe(0);
    expect(count('pointerdown')).toBe(0);
    expect(beneath).toEqual([]);
    p.close(); // idempotent
    expect(count('keydown')).toBe(0);
  });

  test('a non-Escape key is ignored and not stopped', async () => {
    openJoinPicker(null, { x: 0, y: 0, choices: [], onPick: () => {} });
    await tick();
    const ev = docKey('a', document.body);
    expect(ev.stopped).toBe(false);
    expect(count('keydown')).toBe(1);
  });

  test('close() before the deferred arm does not leave a pointerdown listener behind', async () => {
    const p = openJoinPicker(null, { x: 0, y: 0, choices: [], onPick: () => {} });
    p.close();
    await tick();
    expect(count('pointerdown')).toBe(0);
    expect(count('keydown')).toBe(0);
  });

  test('a click outside closes and removes both listeners', async () => {
    openJoinPicker(null, { x: 0, y: 0, choices: [], onPick: () => {} });
    await tick();
    expect(count('pointerdown')).toBe(1);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    for (const fn of [...(docListeners.pointerdown || [])]) fn({ target: outside });
    expect(count('pointerdown')).toBe(0);
    expect(count('keydown')).toBe(0);
  });
});
