/**
 * Tiny DOM helpers used by all UI modules.
 */

/**
 * Create an element.
 * @param {string} tag  tag name, optionally with `.class` suffixes (e.g. 'div.row.big')
 * @param {Object<string,any>} [props] attributes / properties; `on*` functions become listeners,
 *   `style` may be an object, `dataset` an object, `text` sets textContent, `html` sets innerHTML.
 * @param {...(Node|string|number|null|undefined|false|Array)} children
 * @returns {HTMLElement}
 */
export function el(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  if (props) {
    for (const key in props) {
      const val = props[key];
      if (val === undefined || val === null || val === false) continue;
      if (key === 'class') node.className += (node.className ? ' ' : '') + val;
      else if (key === 'text') node.textContent = String(val);
      else if (key === 'html') node.innerHTML = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(node.style, val);
      else if (key === 'dataset') Object.assign(node.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') node.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key in node && typeof val !== 'string') node[key] = val;
      else node.setAttribute(key, val === true ? '' : String(val));
    }
  }
  appendChildren(node, children);
  return node;
}

/**
 * Append children (flattening arrays, skipping falsy, converting primitives to text).
 * @param {Node} node
 * @param {Array} children
 */
export function appendChildren(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) appendChildren(node, c);
    else node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/**
 * Set textContent only when changed (avoids layout churn during periodic refreshes).
 * @param {Node} node
 * @param {string|number} text
 */
export function setText(node, text) {
  const s = String(text);
  if (node.textContent !== s) node.textContent = s;
}

/**
 * Remove all children of a node.
 * @param {Node} node
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Keyed list reconciliation: keeps existing row elements (and therefore focus/scroll)
 * and only creates/removes rows whose keys appeared/disappeared.
 * @template T
 * @param {HTMLElement} container
 * @param {T[]} items
 * @param {(item:T)=>string|number} keyFn
 * @param {(item:T)=>HTMLElement} create  builds a row (called once per key)
 * @param {(row:HTMLElement,item:T)=>void} update  refreshes a row's dynamic content
 */
export function patchList(container, items, keyFn, create, update) {
  /** @type {Map<string,HTMLElement>} */
  const existing = new Map();
  for (const child of Array.from(container.children)) {
    if (child.dataset && child.dataset.key !== undefined) existing.set(child.dataset.key, child);
  }
  let prev = null;
  for (const item of items) {
    const key = String(keyFn(item));
    let row = existing.get(key);
    if (row) existing.delete(key);
    else {
      row = create(item);
      row.dataset.key = key;
    }
    update(row, item);
    const expected = prev ? prev.nextSibling : container.firstChild;
    if (row !== expected) container.insertBefore(row, expected);
    prev = row;
  }
  for (const row of existing.values()) row.remove();
}

/**
 * Build a simple button.
 * @param {string} label
 * @param {()=>void} onClick
 * @param {string} [cls] extra classes
 * @returns {HTMLButtonElement}
 */
export function button(label, onClick, cls = '') {
  return /** @type {HTMLButtonElement} */ (el('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { type: 'button', onclick: onClick, text: label }));
}

/**
 * A label/value row for key-value tables.
 * @param {string} label
 * @param {string|Node} [value]
 * @returns {{row:HTMLElement, value:HTMLElement}}
 */
export function kvRow(label, value = '') {
  const v = el('span.kv-value.mono', null, value);
  const row = el('div.kv', null, el('span.kv-label', { text: label }), v);
  return { row, value: v };
}

/**
 * Horizontal bar (0..1) element with fill colour.
 * @param {number} frac
 * @param {string} [color]
 * @returns {HTMLElement}
 */
export function bar(frac, color) {
  const fill = el('div.bar-fill');
  const b = el('div.bar', null, fill);
  setBar(b, frac, color);
  return b;
}

/**
 * Update a bar created by {@link bar}.
 * @param {HTMLElement} b
 * @param {number} frac
 * @param {string} [color]
 */
export function setBar(b, frac, color) {
  const fill = /** @type {HTMLElement} */ (b.firstChild);
  const w = Math.max(0, Math.min(1, frac || 0)) * 100 + '%';
  if (fill.style.width !== w) fill.style.width = w;
  if (color && fill.style.background !== color) fill.style.background = color;
}
