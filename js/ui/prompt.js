/**
 * Text prompt dialog (OpenLoco TextInputWindow / OpenTTD QueryString): a small modal with one
 * input, OK / Cancel. Enter submits, Escape cancels. `onSubmit(text)` returns a command result
 * ({ok, error}); on error the message is shown inline and the dialog stays open.
 * Game shortcuts do not fire while typing: input.js ignores keydown events whose target is an INPUT.
 */
import { el, setText } from './dom.js';

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

  const close = () => {
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
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // never let typing reach the game's shortcuts
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  input.addEventListener('input', () => setText(err, ''));
  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);
  backdrop.addEventListener('pointerdown', (e) => { if (e.target === backdrop) close(); });
  input.focus();
  input.select();
  return { close, root: backdrop };
}
