/**
 * Round AD: window shade (roll up) and sticky (pin) title-bar toggles.
 * UI only: the state lives on the window object, never in the game state. Both default off.
 * WindowManager needs a DOM, so this test installs a tiny fake DOM (there is no jsdom in the repo).
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { WindowManager } from '../js/ui/windowManager.js';

/** Minimal DOM node: just enough for the window manager's title bar and open/close paths. */
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this._classes = new Set();
    this._text = '';
    this.hidden = false;
    this._listeners = {};
    this._connected = true;
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
  set textContent(v) {
    this._text = String(v);
    for (const c of this.children) c.parentNode = null;
    this.children = [];
  }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() {
    const p = this.parentNode;
    return p ? p.children[p.children.indexOf(this) + 1] || null : null;
  }
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
    c._connected = true;
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null;
    c._connected = false;
    return c;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  closest(sel) {
    for (let x = this; x; x = x.parentNode) {
      if (sel.startsWith('.')) { if (x.classList.contains(sel.slice(1))) return x; }
      else if (x.tagName === sel.toUpperCase()) return x;
    }
    return null;
  }
  focus() { globalThis.document.activeElement = this; }
  setPointerCapture() {}
  querySelector() { return null; }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  dispatchEvent(ev) {
    if (!ev.target) ev.target = this;
    for (const fn of this._listeners[ev.type] || []) fn(ev);
    return true;
  }
  click() { this.dispatchEvent({ type: 'click', target: this }); }
}

function installDom() {
  globalThis.Node = FakeNode;
  globalThis.document = {
    createElement: (t) => new FakeNode(t),
    createTextNode: (t) => { const n = new FakeNode('#text'); n._text = String(t); return n; },
    activeElement: null,
    documentElement: new FakeNode('html'),
  };
  globalThis.document.documentElement.style.getPropertyValue = () => '';
  globalThis.window = { innerWidth: 1024, innerHeight: 768 };
}

/** A window manager over a fake 1024x768 container. */
function makeWm() {
  const container = new FakeNode('div');
  container.clientWidth = 1024;
  container.clientHeight = 768;
  const wm = new WindowManager(container);
  return { wm, container };
}

const openWin = (wm, id, title = id) => wm.open(id, { title, build: () => undefined });

describe('window shade + sticky toggles (UI only)', () => {
  beforeEach(() => installDom());

  test('default: no window is shaded or sticky, and closeAll closes all windows as before', () => {
    const { wm, container } = makeWm();
    const wins = ['one', 'two', 'three'].map((id) => openWin(wm, id, 'Win ' + id));
    expect(wm.windows.size).toBe(3);
    expect(container.children.length).toBe(3);
    for (const w of wins) {
      expect(w.shaded).toBe(false);
      expect(w.sticky).toBe(false);
      expect(w.body.hidden).toBe(false);
      expect(w.root.className).not.toContain('shaded');
      expect(w.root.className).not.toContain('sticky');
      expect(w.shadeBtn.getAttribute('aria-pressed')).toBe('false');
      expect(w.stickBtn.getAttribute('aria-pressed')).toBe('false');
    }
    wm.closeAll();
    expect(wm.windows.size).toBe(0); // pinned count: all three closed
    expect(container.children.length).toBe(0);
  });

  test('shade toggle hides the body, keeps the title and position; toggling restores', () => {
    const { wm } = makeWm();
    const w = openWin(wm, 'shade-me', 'Shaded window');
    const left = w.root.style.left;
    const top = w.root.style.top;
    expect(w.shadeBtn.getAttribute('aria-label')).toBe('Shade Shaded window');
    expect(w.shadeBtn.title).toContain('Shade');

    w.shadeBtn.click();
    expect(w.shaded).toBe(true);
    expect(w.body.hidden).toBe(true);
    expect(w.root.className).toContain('shaded');
    expect(w.titleEl.textContent).toBe('Shaded window'); // title kept
    expect(w.root.style.left).toBe(left); // position kept
    expect(w.root.style.top).toBe(top);
    expect(w.shadeBtn.getAttribute('aria-pressed')).toBe('true');
    expect(w.shadeBtn.getAttribute('aria-label')).toBe('Unshade Shaded window');
    expect(w.shadeBtn.title).toContain('Unshade');
    expect(wm.isOpen('shade-me')).toBe(true);

    w.shadeBtn.click();
    expect(w.shaded).toBe(false);
    expect(w.body.hidden).toBe(false);
    expect(w.root.className).not.toContain('shaded');
    expect(w.shadeBtn.getAttribute('aria-pressed')).toBe('false');
    expect(w.shadeBtn.getAttribute('aria-label')).toBe('Shade Shaded window');
  });

  test('sticky window survives closeAll; non-sticky windows do not', () => {
    const { wm } = makeWm();
    openWin(wm, 'a');
    const pinned = openWin(wm, 'pin');
    openWin(wm, 'c');
    pinned.setSticky(true);
    expect(pinned.sticky).toBe(true);
    expect(pinned.root.className).toContain('sticky');
    wm.closeAll();
    expect(wm.isOpen('a')).toBe(false);
    expect(wm.isOpen('c')).toBe(false);
    expect(wm.isOpen('pin')).toBe(true);
    expect(wm.windows.size).toBe(1);
    wm.closeAll(); // still sticky: survives a second close-all
    expect(wm.isOpen('pin')).toBe(true);
    pinned.setSticky(false);
    wm.closeAll();
    expect(wm.windows.size).toBe(0);
  });

  test('closeTop skips the sticky (top) window and closes the next non-sticky one', () => {
    const { wm } = makeWm();
    openWin(wm, 'a');
    const pinned = openWin(wm, 'pin');
    pinned.setSticky(true); // pinned is the top-most window
    openWin(wm, 'c'); // c becomes top-most and is not sticky
    expect(wm.closeTop()).toBe(true);
    expect(wm.isOpen('c')).toBe(false);
    expect(wm.isOpen('pin')).toBe(true);
    expect(wm.closeTop()).toBe(true);
    expect(wm.isOpen('a')).toBe(false);
    expect(wm.isOpen('pin')).toBe(true);
    expect(wm.closeTop()).toBe(false); // only sticky windows left: Esc does nothing (as with no windows)
    expect(pinned.sticky).toBe(true);
  });

  test('buttons have aria-labels and titles; close stays the last control', () => {
    const { wm } = makeWm();
    const w = openWin(wm, 'controls', 'Controls');
    const ctrls = w.root.children[0].children[1]; // header > .win-ctrls
    expect(ctrls.className).toContain('win-ctrls');
    expect(ctrls.children.length).toBe(3);
    expect(ctrls.children[0]).toBe(w.shadeBtn);
    expect(ctrls.children[1]).toBe(w.stickBtn);
    expect(ctrls.children[2].className).toContain('win-close'); // close last on every layout
    for (const [btn, label] of [[w.shadeBtn, 'Shade Controls'], [w.stickBtn, 'Pin Controls'], [ctrls.children[2], 'Close Controls']]) {
      expect(btn.getAttribute('aria-label')).toBe(label);
      expect(typeof btn.title).toBe('string');
      expect(btn.title.length).toBeGreaterThan(0);
    }
    w.setTitle('Renamed');
    expect(w.shadeBtn.getAttribute('aria-label')).toBe('Shade Renamed');
    expect(w.stickBtn.getAttribute('aria-label')).toBe('Pin Renamed');
    expect(ctrls.children[2].getAttribute('aria-label')).toBe('Close Renamed');
  });
});
