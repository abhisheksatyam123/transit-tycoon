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
export function cargoAmounts(container, amounts, emptyText = 'None', suffix) {
  const items = Object.keys(amounts || {}).filter((k) => amounts[k] > 0).map((k) => ({ id: k, n: amounts[k] }));
  listOrEmpty(container, items, (i) => i.id,
    (i) => el('div.cargo-row', null, cargoChip(i.id), el('span.mono.num')),
    (row, i) => setText(row.lastChild, num(i.n) + (suffix ? suffix(i.id) : '')), emptyText);
}

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
