/**
 * Sort-key select plus ascending/descending toggle for list windows. The state object
 * ({sort, dir}) belongs to the window instance; changing it re-renders via `onChange`.
 */
import { el } from '../dom.js';

/**
 * @param {[string,string][]} sorts [key,label]
 * @param {{sort:string,dir:number}} state mutated in place
 * @param {()=>void} onChange
 * @returns {{bar: HTMLElement, select: HTMLSelectElement, dirBtn: HTMLButtonElement}}
 */
export function sortControls(sorts, state, onChange) {
  const select = /** @type {HTMLSelectElement} */ (el('select.input', { style: { width: 'auto' }, 'aria-label': 'Sort by', title: 'Sort by' },
    sorts.map(([k, l]) => el('option', { value: k, text: l }))));
  select.value = state.sort;
  const dirBtn = /** @type {HTMLButtonElement} */ (el('button.btn.sm', { type: 'button', title: 'Toggle ascending / descending' }));
  const paintDir = () => { dirBtn.textContent = state.dir < 0 ? 'Descending ▼' : 'Ascending ▲'; };
  paintDir();
  select.onchange = () => { state.sort = select.value; state.dir = 1; paintDir(); onChange(); };
  dirBtn.onclick = () => { state.dir = -state.dir; paintDir(); onChange(); };
  const bar = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' } },
    el('span.muted', { text: 'Sort' }), select, dirBtn);
  return { bar, select, dirBtn };
}
