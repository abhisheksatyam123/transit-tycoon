/**
 * Floating window manager: draggable, closable, z-ordered windows with periodic refresh.
 * A window is created from a spec whose `build(body, win)` returns an optional `update()`
 * function; update() is called on every refresh tick and must patch the DOM in place
 * (so scroll positions and focused inputs survive).
 */
import { el } from './dom.js';

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
 * @property {(t:string)=>void} setTitle
 * @property {()=>void} close
 * @property {WindowSpec} spec
 */

export class WindowManager {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    /** @type {Map<string, FloatingWindow>} */
    this.windows = new Map();
    this.z = 10;
    this.cascade = 0;
  }

  /**
   * Open (or focus, if already open) a window.
   * @param {string} id unique key (e.g. 'vehicle:12')
   * @param {WindowSpec} spec
   * @param {{x?:number,y?:number}} [pos]
   * @returns {FloatingWindow}
   */
  open(id, spec, pos) {
    const existing = this.windows.get(id);
    if (existing) {
      this.focus(existing);
      return existing;
    }
    const titleEl = el('span.win-title', { text: spec.title });
    const closeBtn = el('button.win-close', { type: 'button', title: 'Close (Esc)', 'aria-label': 'Close', text: '×' });
    const header = el('div.win-header', null, titleEl, closeBtn);
    const body = el('div.win-body');
    const root = el('section.win.hud-surface' + (spec.className ? '.' + spec.className : ''), { role: 'dialog', 'aria-label': spec.title }, header, body);
    if (spec.width) root.style.width = spec.width + 'px';
    /** @type {FloatingWindow} */
    const win = {
      id, root, body, titleEl, spec, update: null,
      setTitle: (t) => { if (titleEl.textContent !== t) titleEl.textContent = t; },
      close: () => this.close(id),
    };
    closeBtn.addEventListener('click', () => this.close(id));
    root.addEventListener('pointerdown', () => this.focus(win));
    this.makeDraggable(win, header);
    this.container.appendChild(root);
    const vw = this.container.clientWidth || window.innerWidth;
    const vh = this.container.clientHeight || window.innerHeight;
    const w = spec.width || 320;
    const x = pos && pos.x !== undefined ? pos.x : Math.max(8, Math.min(vw - w - 8, 80 + (this.cascade % 8) * 26));
    const y = pos && pos.y !== undefined ? pos.y : Math.max(8, Math.min(vh - 120, 20 + (this.cascade % 8) * 26));
    this.cascade++;
    root.style.left = x + 'px';
    root.style.top = y + 'px';
    this.windows.set(id, win);
    this.focus(win);
    const upd = spec.build(body, win);
    win.update = typeof upd === 'function' ? upd : null;
    if (win.update) this.safeUpdate(win);
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
    win.root.remove();
    if (win.spec.onClose) win.spec.onClose();
  }

  /** Close every window. */
  closeAll() {
    for (const id of Array.from(this.windows.keys())) this.close(id);
  }

  /**
   * Close the top-most window.
   * @returns {boolean} true if a window was closed
   */
  closeTop() {
    let top = null, z = -1;
    for (const w of this.windows.values()) {
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

  /** Refresh all windows (called periodically). */
  updateAll() {
    for (const w of Array.from(this.windows.values())) if (w.update) this.safeUpdate(w);
  }

  /**
   * Run a window's update, closing it if it throws (e.g. its object was removed).
   * @param {FloatingWindow} w
   */
  safeUpdate(w) {
    try {
      w.update();
    } catch (err) {
      console.warn(`Window ${w.id} update failed; closing`, err);
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
      const maxX = this.container.clientWidth - 60, maxY = this.container.clientHeight - 30;
      win.root.style.left = Math.max(-win.root.offsetWidth + 60, Math.min(maxX, ox + e.clientX - sx)) + 'px';
      win.root.style.top = Math.max(0, Math.min(maxY, oy + e.clientY - sy)) + 'px';
    });
    const end = () => { dragging = false; };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
