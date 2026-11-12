/**
 * Text prompt dialog (OpenLoco TextInputWindow / OpenTTD QueryString): a small modal with one
 * input, OK / Cancel. Enter submits, Escape cancels. `onSubmit(text)` returns a command result
 * ({ok, error}); on error the message is shown inline and the dialog stays open.
 * While open the prompt is modal: every key stops at the backdrop (so Escape never closes the window
 * underneath and plain shortcuts such as Space do not fire, whichever control has focus), Tab cycles
 * inside the dialog, and focus that leaves the dialog is pulled back.
 * Game shortcuts do not fire while typing: input.js ignores keydown events whose target is an INPUT.
 */
import { el, setText } from './dom.js';

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
 * @param {{title:string, label?:string, value?:string, maxLength?:number, okText?:string,
 *          onSubmit:(text:string)=>({ok:boolean,error?:string}|undefined)}} o
 * @returns {{close:()=>void, root:HTMLElement}}
 */
export function openPrompt(o) {
  const backdrop = el('div.prompt-backdrop');
  const err = el('div.prompt-error', { role: 'alert' });
  const input = el('input.input.prompt-input', {
    type: 'text', value: o.value || '', maxLength: o.maxLength || 32,
    'aria-label': o.label || o.title, autocomplete: 'off', spellcheck: false,
  });
  const okBtn = el('button.btn.primary', { type: 'button', text: o.okText || 'OK' });
  const cancelBtn = el('button.btn', { type: 'button', text: 'Cancel' });
  const dialog = el('section.prompt', { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
    el('div.win-header', null, el('span.win-title', { text: o.title })),
    el('div.prompt-body', null,
      el('label.prompt-label', null, el('span.muted', { text: o.label || 'Name' }), input),
      err,
      el('div.btn-row', null, cancelBtn, okBtn)));
  backdrop.appendChild(dialog);
  const prev = typeof document !== 'undefined' ? document.activeElement : null;
  document.body.appendChild(backdrop);
  /** Tab order inside the dialog (the focus trap cycles through these). */
  const focusables = [input, cancelBtn, okBtn];

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('focusin', onFocusIn, true);
    backdrop.remove();
    if (prev && typeof prev.focus === 'function') prev.focus();
  };
  const submit = () => {
    const r = o.onSubmit(input.value);
    if (r && r.ok === false) {
      setText(err, r.error || 'Not possible');
      input.focus();
      input.select();
      return;
    }
    close();
  };
  /**
   * Capture phase on the backdrop: every key stops here, so neither the window beneath nor the game's
   * shortcuts (window keydown listeners, input.js) see it, whichever control has focus.
   */
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const i = focusables.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      const next = focusables[nextFocusIndex(focusables.length, i, !!e.shiftKey)];
      if (next) next.focus();
      return;
    }
    // Enter on the input submits; Enter on OK/Cancel is left to the browser (it clicks the button).
    if (e.key === 'Enter' && e.target === input) { e.preventDefault(); submit(); }
  };
  const onKeyUp = (e) => e.stopPropagation();
  /** Focus that leaves the dialog (e.g. a click on the page behind) is pulled back to the input. */
  const onFocusIn = (e) => { if (!backdrop.contains(/** @type {Node} */ (e.target))) input.focus(); };

  backdrop.addEventListener('keydown', onKey, true);
  backdrop.addEventListener('keyup', onKeyUp, true);
  document.addEventListener('focusin', onFocusIn, true);
  input.addEventListener('input', () => setText(err, ''));
  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  input.focus();
  input.select();
  return { close, root: backdrop };
}
