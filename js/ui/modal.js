/**
 * Shared keyboard containment for modal dialogs (prompt, confirm boxes). While a modal is open:
 *  - every key stops at its backdrop (capture phase), so Escape never closes the window underneath
 *    and game shortcuts (Space, letters; input.js) do not fire;
 *  - Escape closes the dialog itself; Tab / Shift+Tab cycle through `focusables`;
 *  - focus that leaves the dialog (a focusin elsewhere, or a click on the bare backdrop) is pulled back.
 * Game shortcuts do not fire while typing either: input.js ignores keydown events whose target is an INPUT.
 */
import { el } from './dom.js';

/**
 * Index of the control that Tab / Shift+Tab moves to inside a modal (pure, for tests).
 * @param {number} count number of focusable controls in the dialog
 * @param {number} current index of the focused control (-1 when focus is outside)
 * @param {boolean} backwards Shift+Tab
 * @returns {number} the next index, or -1 when there is nothing to focus
 */
export function nextFocusIndex(count, current, backwards = false) {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  return (current + (backwards ? -1 : 1) + count) % count;
}

/**
 * Install the modal key containment on `backdrop`. Must be called while the dialog is in the DOM.
 * @param {HTMLElement} backdrop element that contains the whole dialog
 * @param {{focusables: HTMLElement[], close: () => void, onKey?: (e: KeyboardEvent) => void}} o
 *   `onKey` runs for keys other than Escape / Tab (e.g. Enter on an input); it sees the event after
 *   propagation was already stopped.
 * @returns {() => void} detach: removes the document focus listener (call it when the dialog closes)
 */
export function trapModalKeys(backdrop, { focusables, close, onKey }) {
  const onKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const i = focusables.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      const next = focusables[nextFocusIndex(focusables.length, i, !!e.shiftKey)];
      if (next) next.focus();
      return;
    }
    if (onKey) onKey(e);
  };
  const onKeyUp = (e) => e.stopPropagation();
  /** Focus that leaves the dialog is pulled back to its first control. */
  const onFocusIn = (e) => {
    if (!backdrop.contains(/** @type {Node} */ (e.target)) && focusables[0]) focusables[0].focus();
  };
  /** A click on the bare backdrop (no control) would drop focus to the body: keep it inside. */
  const onMouseDown = (e) => {
    if (e.target === backdrop && focusables[0]) focusables[0].focus();
  };
  backdrop.addEventListener('keydown', onKeyDown, true);
  backdrop.addEventListener('keyup', onKeyUp, true);
  backdrop.addEventListener('mousedown', onMouseDown);
  document.addEventListener('focusin', onFocusIn, true);
  return () => {
    backdrop.removeEventListener('keydown', onKeyDown, true);
    backdrop.removeEventListener('keyup', onKeyUp, true);
    backdrop.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('focusin', onFocusIn, true);
  };
}

/**
 * Yes / No confirmation (destructive actions). Cancel is focused on open (the safe default), Escape
 * and Cancel close without running `onYes`; the danger button runs `onYes` after closing.
 * @param {{question: string, yesText?: string, onYes: () => void}} o
 * @returns {{close: () => void, root: HTMLElement}}
 */
export function openConfirm({ question, yesText = 'Yes', onYes }) {
  const backdrop = el('div.prompt-backdrop');
  const prev = typeof document !== 'undefined' ? document.activeElement : null;
  let detach = () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    detach();
    backdrop.remove();
    if (prev && typeof prev.focus === 'function') prev.focus();
  };
  const cancelBtn = el('button.btn', { type: 'button', text: 'Cancel', onclick: close });
  const yesBtn = el('button.btn.danger', { type: 'button', text: yesText, onclick: () => { close(); onYes(); } });
  backdrop.appendChild(el('section.prompt', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirm' },
    el('div.win-header', null, el('span.win-title', { text: 'Confirm' })),
    el('div.prompt-body', null,
      el('p', { text: question }),
      el('div.btn-row', null, cancelBtn, yesBtn))));
  document.body.appendChild(backdrop);
  detach = trapModalKeys(backdrop, { focusables: [cancelBtn, yesBtn], close });
  cancelBtn.focus();
  return { close, root: backdrop };
}
