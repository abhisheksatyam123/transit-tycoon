/**
 * Floating window manager: draggable, closable, z-ordered windows with periodic refresh.
 * A window is created from a spec whose `build(body, win)` returns an optional `update()`
 * function; update() is called on every refresh tick and must patch the DOM in place
 * (so scroll positions and focused inputs survive).
 */
import { el } from './dom.js';
import { logger } from './logger.js';

/**
 * @typedef {Object} WindowSpec
 * @property {string} title
 * @property {number} [width]
 * @property {string} [className]
 * @property {(body:HTMLElement, win:FloatingWindow)=>(void|(()=>void))} build
 * @property {()=>void} [onClose]
 */

/**
 * @typedef {Object} FloatingWindow
 * @property {string} id
 * @property {HTMLElement} root
 * @property {HTMLElement} body
 * @property {HTMLElement} titleEl
 * @property {(()=>void)|null} update
 * @property {boolean} shaded rolled up to the title bar (UI-only; not saved)
 * @property {boolean} sticky kept open by closeTop/closeAll (UI-only; not saved)
 * @property {HTMLElement} shadeBtn
 * @property {HTMLElement} stickBtn
 * @property {(on:boolean)=>void} setShaded
 * @property {(on:boolean)=>void} setSticky
 * @property {(t:string)=>void} setTitle
 * @property {()=>void} close
 * @property {WindowSpec} spec
 */

/** Counter for unique window title ids (aria-labelledby). */
let winSeq = 0;

export class WindowManager {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    /** @type {Map<string, FloatingWindow>} */
    this.windows = new Map();
    /** @type {Map<string, HTMLElement|null>} element focused before each window opened */
    this.openers = new Map();
    this.z = 10;
    this.cascade = 0;
  }

  /**
   * Open (or focus, if already open) a window.
   * @param {string} id unique key (e.g. 'vehicle:12')
   * @param {WindowSpec} spec
   * @param {{x?:number,y?:number}} [pos]
   * @returns {FloatingWindow|null} null when build() threw: the window is closed (its onClose runs) and
   *   not registered, so a later open() of the same id builds it again instead of returning a broken window
   */
  open(id, spec, pos) {
    const existing = this.windows.get(id);
    if (existing) {
      this.focus(existing);
      return existing;
    }
    const titleEl = el('span.win-title', { id: 'win-title-' + (++winSeq), text: spec.title });
    // Title bar buttons, OpenTTD order (WWT_SHADEBOX, WWT_STICKYBOX, then close). Close stays last so the
    // controls keep that order and never overlap the title on narrow (phone) layouts.
    const shadeBtn = el('button.win-btn.win-shade', { type: 'button', title: 'Shade (roll up)', 'aria-label': 'Shade ' + spec.title, 'aria-pressed': 'false', text: '▾' });
    const stickBtn = el('button.win-btn.win-stick', { type: 'button', title: 'Pin (keep open on Esc / close all)', 'aria-label': 'Pin ' + spec.title, 'aria-pressed': 'false', text: '⚑' });
    const closeBtn = el('button.win-close.win-btn', { type: 'button', title: 'Close (Esc)', 'aria-label': 'Close ' + spec.title, text: '×' });
    const header = el('div.win-header', null, titleEl, el('div.win-ctrls', null, shadeBtn, stickBtn, closeBtn));
    const body = el('div.win-body');
    const root = el('section.win.hud-surface' + (spec.className ? '.' + spec.className : ''), { role: 'dialog', tabindex: '-1', 'aria-labelledby': titleEl.id }, header, body);
    if (spec.width) root.style.width = spec.width + 'px';
    /** Shade (roll up): hide the body, keep the title bar, position and width. */
    const setShaded = (on) => {
      const was = win.shaded;
      win.shaded = !!on;
      root.classList.toggle('shaded', win.shaded);
      body.hidden = win.shaded;
      shadeBtn.setAttribute('aria-pressed', win.shaded ? 'true' : 'false');
      shadeBtn.setAttribute('aria-label', (win.shaded ? 'Unshade ' : 'Shade ') + titleEl.textContent);
      shadeBtn.title = win.shaded ? 'Unshade (roll down)' : 'Shade (roll up)';
      shadeBtn.textContent = win.shaded ? '▴' : '▾';
      // Shaded windows skip periodic refreshes (body hidden); refresh once on roll-down so it is current.
      if (was && !win.shaded && win.update) this.safeUpdate(win);
    };
    /** Sticky (pin): closeTop/closeAll skip this window; the close button still closes it. */
    const setSticky = (on) => {
      win.sticky = !!on;
      root.classList.toggle('sticky', win.sticky);
      stickBtn.setAttribute('aria-pressed', win.sticky ? 'true' : 'false');
      stickBtn.setAttribute('aria-label', (win.sticky ? 'Unpin ' : 'Pin ') + titleEl.textContent);
      stickBtn.title = win.sticky ? 'Unpin (close with Esc / close all)' : 'Pin (keep open on Esc / close all)';
    };
    /** @type {FloatingWindow} */
    const win = {
      id, root, body, titleEl, spec, update: null, shaded: false, sticky: false,
      shadeBtn, stickBtn, setShaded, setSticky,
      setTitle: (t) => {
        if (titleEl.textContent !== t) titleEl.textContent = t;
        closeBtn.setAttribute('aria-label', 'Close ' + t);
        shadeBtn.setAttribute('aria-label', (win.shaded ? 'Unshade ' : 'Shade ') + t);
        stickBtn.setAttribute('aria-label', (win.sticky ? 'Unpin ' : 'Pin ') + t);
      },
      close: () => this.close(id),
    };
    closeBtn.addEventListener('click', () => this.close(id));
    shadeBtn.addEventListener('click', () => setShaded(!win.shaded));
    stickBtn.addEventListener('click', () => setSticky(!win.sticky));
    root.addEventListener('pointerdown', () => this.focus(win));
    this.makeDraggable(win, header);
    this.container.appendChild(root);
    const vw = this.container.clientWidth || window.innerWidth;
    const vh = this.container.clientHeight || window.innerHeight;
    const w = spec.width || 320;
    const x = pos && pos.x !== undefined ? pos.x : Math.max(8, Math.min(vw - w - 8, 80 + (this.cascade % 8) * 26));
    let y = pos && pos.y !== undefined ? pos.y : Math.max(8, Math.min(vh - 120, 20 + (this.cascade % 8) * 26));
    // Narrow screens: the sheet is capped at 100dvh-12px (css/windows.css), so anchor it at the top
    // edge; a cascaded top (66px) would push its bottom past the viewport.
    if (!(pos && pos.y !== undefined) && vw <= 640) y = 8;
    this.cascade++;
    root.style.left = x + 'px';
    root.style.top = y + 'px';
    this.windows.set(id, win);
    this.focus(win);
    let upd;
    try {
      upd = spec.build(body, win);
    } catch (err) {
      if (!logger.warn('window', `Window ${id} failed to build; closed`, err)) console.error(`Window ${id} failed to build; closed`, err);
      this.close(id);
      return null;
    }
    win.update = typeof upd === 'function' ? upd : null;
    if (win.update) this.safeUpdate(win);
    // keyboard/screen-reader users land inside the new dialog; remember the opener to return to on close
    if (!this.openers.has(id)) this.openers.set(id, /** @type {HTMLElement|null} */ (document.activeElement));
    root.focus({ preventScroll: true });
    return win;
  }

  /**
   * @param {FloatingWindow} win
   */
  focus(win) {
    win.root.style.zIndex = String(++this.z);
    for (const w of this.windows.values()) w.root.classList.toggle('focused', w === win);
  }

  /**
   * Close a window by id.
   * @param {string} id
   */
  close(id) {
    const win = this.windows.get(id);
    if (!win) return;
    this.windows.delete(id);
    const opener = this.openers.get(id);
    this.openers.delete(id);
    const hadFocus = win.root.contains(document.activeElement);
    win.root.remove();
    if (hadFocus && opener && opener.isConnected) opener.focus({ preventScroll: true });
    if (win.spec.onClose) win.spec.onClose();
  }

  /**
   * Close every window except sticky (pinned) ones (OpenTTD CloseNonVitalWindows, window.cpp:3382).
   * @param {{includeSticky?: boolean}} [opts] includeSticky: pinned windows too (used when the game changes,
   *   so no window keeps showing the previous game's data; pins are not saved, so nothing is lost)
   */
  closeAll(opts = {}) {
    for (const id of Array.from(this.windows.keys())) {
      const w = this.windows.get(id);
      if (w && w.sticky && !opts.includeSticky) continue;
      this.close(id);
    }
  }

  /**
   * Close the top-most window.
   * @returns {boolean} true if a window was closed
   */
  closeTop() {
    let top = null, z = -1;
    for (const w of this.windows.values()) {
      if (w.sticky) continue; // pinned windows survive Esc (OpenTTD WindowFlag::Sticky)
      const wz = Number(w.root.style.zIndex) || 0;
      if (wz > z) { z = wz; top = w; }
    }
    if (!top) return false;
    this.close(top.id);
    return true;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  isOpen(id) {
    return this.windows.has(id);
  }

  /** Refresh all windows (called periodically). Shaded (rolled up) windows are skipped. */
  updateAll() {
    for (const w of Array.from(this.windows.values())) if (w.update && !w.shaded) this.safeUpdate(w);
  }

  /**
   * Run a window's update, closing it if it throws (e.g. its object was removed).
   * @param {FloatingWindow} w
   */
  safeUpdate(w) {
    try {
      w.update();
    } catch (err) {
      if (!logger.warn('window', `Window ${w.id} update failed; closing`, err)) console.warn(`Window ${w.id} update failed; closing`, err);
      this.close(w.id);
    }
  }

  /**
   * Clamp every open window into the visible container (call after resize/orientation change).
   */
  clampAll() {
    const vw = this.container.clientWidth, vh = this.container.clientHeight;
    for (const w of this.windows.values()) {
      const maxX = Math.max(8, vw - 60), maxY = Math.max(0, vh - 30);
      const minX = -w.root.offsetWidth + 60;
      const left = Math.max(minX, Math.min(maxX, w.root.offsetLeft));
      const top = Math.max(0, Math.min(maxY, w.root.offsetTop));
      w.root.style.left = left + 'px';
      w.root.style.top = top + 'px';
    }
  }

  /**
   * Make a window draggable by its header (pointer events, clamped to the container).
   * @param {FloatingWindow} win
   * @param {HTMLElement} handle
   */
  makeDraggable(win, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = win.root.offsetLeft; oy = win.root.offsetTop;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      // .win is CSS-zoomed by the UI scale (a11yPrefs): left/top are in unzoomed px, pointer deltas in screen px
      const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
      const maxX = this.container.clientWidth / k - 60, maxY = this.container.clientHeight / k - 30;
      win.root.style.left = Math.max(-win.root.offsetWidth + 60, Math.min(maxX, ox + (e.clientX - sx) / k)) + 'px';
      win.root.style.top = Math.max(0, Math.min(maxY, oy + (e.clientY - sy) / k)) + 'px';
    });
    const end = () => { dragging = false; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
