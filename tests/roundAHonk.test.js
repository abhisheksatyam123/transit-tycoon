/**
 * Round AD honk: the vehicle detail window has an OpenTTD-style 'Honk' button
 * (openttd/src/vehicle_gui.cpp ~3472). Clicking it plays the existing 'horn' sound and
 * must not touch the game state (no vehicle field, no simulation RNG).
 */
import { test, expect, describe, mock, afterAll } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';

/** Minimal DOM so the real window builder can run under bun (no browser in tests). */
function installFakeDom() {
  const prevDocument = /** @type {any} */ (globalThis).document;
  const prevNode = /** @type {any} */ (globalThis).Node;
  class FakeNode {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = {};
      this.style = {};
      this.dataset = {};
      this._classes = new Set();
      this._text = '';
      this.hidden = false;
      this.disabled = false;
      this.value = '';
      this.title = '';
      this._listeners = {};
    }
    get className() { return [...this._classes].join(' '); }
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get classList() {
      const s = this._classes;
      return {
        add: (...c) => { for (const x of c) s.add(x); },
        remove: (...c) => { for (const x of c) s.delete(x); },
        toggle: (x, force) => { const on = force === undefined ? !s.has(x) : !!force; if (on) s.add(x); else s.delete(x); return on; },
        contains: (x) => s.has(x),
      };
    }
    setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'title') this.title = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    removeAttribute(k) { delete this.attributes[k]; }
    appendChild(c) { this.childNodes.push(c); c.parentNode = this; return c; }
    append(...cs) { for (const c of cs) this.appendChild(c); }
    replaceChildren(...cs) { this.childNodes = []; this.append(...cs); }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; }
    get firstChild() { return this.childNodes[0] || null; }
    get textContent() { return this.childNodes.length ? this.childNodes.map((c) => c.textContent).join('') : this._text; }
    set textContent(v) { this._text = String(v); this.childNodes = []; }
    get innerHTML() { return ''; }
    set innerHTML(_v) { this._text = ''; this.childNodes = []; }
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
    dispatchEvent(ev) { for (const fn of this._listeners[ev.type] || []) fn(ev); return true; }
    click() { return this.dispatchEvent({ type: 'click', target: this }); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
  }
  /** @type {any} */ (globalThis).Node = FakeNode;
  /** @type {any} */ (globalThis).document = {
    createElement: (t) => new FakeNode(t),
    createTextNode: (t) => { const n = new FakeNode('#text'); n._text = String(t); return n; },
  };
  return () => {
    if (prevDocument === undefined) delete /** @type {any} */ (globalThis).document;
    else /** @type {any} */ (globalThis).document = prevDocument;
    if (prevNode === undefined) delete /** @type {any} */ (globalThis).Node;
    else /** @type {any} */ (globalThis).Node = prevNode;
  };
}

/** Depth-first search for a button by its visible text. */
function findButton(node, text) {
  if (!node) return null;
  if (node.tagName === 'BUTTON' && node.textContent === text) return node;
  for (const c of node.childNodes || []) {
    const hit = findButton(c, text);
    if (hit) return hit;
  }
  return null;
}

const allButtons = (node, out = []) => {
  if (node.tagName === 'BUTTON') out.push(node);
  for (const c of node.childNodes || []) allButtons(c, out);
  return out;
};

/** SHA-256 of the raw state, the same measure tools/world-hash.js pins (plus the RNG state is in state.rng). */
const stateHash = (state) => new Bun.CryptoHasher('sha256').update(JSON.stringify(state)).digest('hex');

describe('honk button (OpenTTD vehicle_gui honk)', () => {
  const restoreDom = installFakeDom();

  // Mock the sfx module before the window module (and therefore its `play` import) is loaded.
  const played = [];
  mock.module('../js/audio/sfx.js', () => ({
    play: (name) => { played.push(name); },
    playVehicle: () => {},
    unlockAudio: () => {},
    installAudioUnlock: () => {},
    isMuted: () => false,
    setMuted: () => {},
  }));

  afterAll(() => {
    mock.restore();
    restoreDom();
  });

  /** Build the real vehicle detail window for a freshly bought train; returns its body and the app. */
  async function openWindow() {
    const { openVehicleDetail } = await import('../js/ui/windows/vehicleDetail.js');
    const game = flatGame(21);
    const L = coalLine(game);
    const r = game.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    const body = new (/** @type {any} */ (globalThis).Node)('div');
    const win = { close() {}, setTitle() {} };
    const app = {
      game,
      renderer: { overlay: { selectedVehicleId: null } },
      followId: null,
      wm: {
        open(_id, spec) { spec.build(body, win); return { body, win }; },
        updateAll() {},
      },
      findVehicle: (vid) => game.state.vehicles.find((x) => x.id === vid) || null,
      findStation: (sid) => game.state.stations.find((s) => s.id === sid) || null,
      exec: () => true,
      open: () => {},
      toast: () => {},
      centerOn: () => {},
      follow: () => {},
    };
    openVehicleDetail(app, v.id);
    return { body, game, app, v };
  }

  test('the Honk button exists with an aria-label and a title', async () => {
    const { body } = await openWindow();
    const honk = findButton(body, 'Honk');
    expect(honk).toBeTruthy();
    expect(honk.getAttribute('aria-label')).toBe('Play the vehicle horn');
    expect(honk.getAttribute('title')).toContain('horn');
    // It sits in the window's main action button row next to Start/Stop and Orders.
    const texts = allButtons(body).map((b) => b.textContent);
    expect(texts).toContain('Honk');
    expect(texts).toContain('Orders');
  });

  test('clicking Honk plays the horn sound once and leaves the game state hash unchanged', async () => {
    const { body, game } = await openWindow();
    const honk = findButton(body, 'Honk');
    const before = stateHash(game.state);
    played.length = 0;
    honk.click();
    expect(played).toEqual(['horn']);
    const after = stateHash(game.state);
    expect(after).toBe(before);
    // No vehicle field was written either (belt and braces, the hash covers it).
    expect(game.state.vehicles.length).toBe(1);
  });

  test('no keyboard shortcut was added for honk (h stays Help)', async () => {
    const { HOTKEY_ACTIONS, READ_ONLY_HOTKEYS } = await import('../js/ui/hotkeys.js');
    const { FIXED_SHORTCUTS } = await import('../js/input/fixedShortcuts.js');
    expect(HOTKEY_ACTIONS.some((a) => /honk/i.test(a.label) || /honk/i.test(a.id))).toBe(false);
    expect(READ_ONLY_HOTKEYS.some((a) => /honk/i.test(a.label || ''))).toBe(false);
    expect(FIXED_SHORTCUTS.some((a) => /honk/i.test(a.label || ''))).toBe(false);
    // Binding counts are the pre-change ones: this feature added no key at all.
    expect(HOTKEY_ACTIONS.length).toBe(36);
    expect(READ_ONLY_HOTKEYS.length).toBe(25);
    expect(FIXED_SHORTCUTS.length).toBe(10);
    expect(HOTKEY_ACTIONS.find((a) => a.id === 'win:help').key).toBe('h');
  });
});
