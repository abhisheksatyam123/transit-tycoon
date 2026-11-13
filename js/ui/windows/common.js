/**
 * Shared building blocks for windows: key/value grids, small tables, cargo amount lists.
 */
import { el, setText, patchList } from '../dom.js';
import { cargoChip } from '../cargo.js';
import { num } from '../format.js';

/**
 * Key/value grid whose values can be updated in place.
 * @param {HTMLElement} parent
 * @param {string[]} labels
 * @returns {Record<string,(v:string|number)=>void>} setters keyed by label
 */
export function kvGrid(parent, labels) {
  const grid = el('div.kv-grid');
  /** @type {Record<string,(v:any)=>void>} */
  const set = {};
  for (const l of labels) {
    const v = el('span.kv-value.mono');
    grid.append(el('span.kv-label', { text: l }), v);
    set[l] = (x) => setText(v, x);
  }
  parent.appendChild(grid);
  return set;
}

/**
 * Wrap a click handler so the second click of a double-click does not fire it again.
 * Browsers dispatch click twice before dblclick; `detail > 1` marks the second one.
 * @param {(e?:MouseEvent)=>void} fn
 * @returns {(e?:MouseEvent)=>void}
 */
export function singleClick(fn) {
  return (e) => { if (e && Number(e.detail) > 1) return; fn(e); };
}

/**
 * Section heading.
 * @param {string} text
 * @returns {HTMLElement}
 */
export function heading(text) {
  return el('h4.win-h', { text });
}

/**
 * Patch a list of cargo amounts: rows of [chip, amount].
 * @param {HTMLElement} container
 * @param {Record<string,number>} amounts
 * @param {string} [emptyText]
 * @param {(id:string)=>string} [suffix]
 */

/**
 * Sum a station waiting-cargo packet list.
 * @param {{amount:number}[]|number|undefined} packets
 * @returns {number}
 */
export function packetTotal(packets) {
  if (typeof packets === 'number') return packets;
  if (!Array.isArray(packets)) return 0;
  let s = 0;
  for (const p of packets) s += p.amount || 0;
  return s;
}

/**
 * patchList with an "empty" placeholder when there are no items.
 * @template T
 * @param {HTMLElement} container
 * @param {T[]} items
 * @param {(i:T)=>string|number} keyFn
 * @param {(i:T)=>HTMLElement} create
 * @param {(row:HTMLElement,i:T)=>void} update
 * @param {string} [emptyText]
 */
export function listOrEmpty(container, items, keyFn, create, update, emptyText = 'None') {
  const empty = container.querySelector(':scope > .empty');
  if (!items.length) {
    if (!empty) {
      container.textContent = '';
      container.appendChild(el('div.empty', { text: emptyText }));
    }
    return;
  }
  if (empty) empty.remove();
  patchList(container, items, keyFn, create, update);
}
