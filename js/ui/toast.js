/**
 * Transient toast messages (errors, confirmations) shown near the cursor or above the status bar.
 */
import { el } from './dom.js';

export class Toasts {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;
    this.lastX = -1;
    this.lastY = -1;
  }

  /**
   * Remember the last pointer position (viewport CSS px relative to container).
   * @param {number} x
   * @param {number} y
   */
  setCursor(x, y) {
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Show a toast.
   * @param {string} text
   * @param {'error'|'info'|'good'} [kind]
   * @param {{nearCursor?:boolean, ms?:number}} [opts]
   * @returns {HTMLElement} the toast element (remove() it to hide early)
   */
  show(text, kind = 'error', opts = {}) {
    const t = el('div.toast.' + kind, { role: 'status', text });
    if (opts.nearCursor && this.lastX >= 0) {
      t.classList.add('at-cursor');
      t.style.left = Math.min(this.container.clientWidth - 220, this.lastX + 16) + 'px';
      t.style.top = Math.max(4, this.lastY - 36) + 'px';
    }
    this.container.appendChild(t);
    const stack = this.container.querySelectorAll('.toast:not(.at-cursor)');
    if (stack.length > 4) stack[0].remove();
    setTimeout(() => t.classList.add('fade'), (opts.ms || 2200) - 400);
    setTimeout(() => t.remove(), opts.ms || 2200);
    return t;
  }
}
