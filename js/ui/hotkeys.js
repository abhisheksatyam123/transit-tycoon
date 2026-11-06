/**
 * Keyboard shortcut table (OpenTTD-style hotkeys). Pure data + helpers so the defaults, overrides and
 * conflicts can be unit-tested. Overrides live in this browser (localStorage 'tt.hotkeys'), never in the save.
 * Keys are stored lower-cased (input.js lower-cases e.key); ' ' is Space.
 *
 * Rebindable actions (`id`) are dispatched by main.js through `applyHotkeys`. Tool-internal keys
 * (rotate, cycle, length...) are listed in READ_ONLY_HOTKEYS: they stay in the tools and cannot be rebound.
 */

export const HOTKEYS_STORAGE_KEY = 'tt.hotkeys';

/** Keys that are never bindable (pan, zoom, cancel), so they keep working. */
export const RESERVED_KEYS = ['escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'r', '+', '=', '-', '_', '[', ']'];

/** @typedef {{id:string, label:string, group:string, key:string}} HotkeyAction */

/** Rebindable actions with their default keys (the defaults of the old hard-coded shortcuts). */
export const HOTKEY_ACTIONS = [
  { id: 'pause', label: 'Pause / resume', group: 'Game', key: ' ' },
  { id: 'win:vehicles', label: 'Vehicles', group: 'Windows', key: 'v' },
  { id: 'win:finances', label: 'Finances', group: 'Windows', key: 'f' },
  { id: 'win:towns', label: 'Towns', group: 'Windows', key: 't' },
  { id: 'win:stations', label: 'Stations', group: 'Windows', key: 'b' },
  { id: 'win:map', label: 'Map', group: 'Windows', key: 'p' },
  { id: 'win:graphs', label: 'Graphs', group: 'Windows', key: 'e' },
  { id: 'win:industries', label: 'Industries', group: 'Windows', key: 'i' },
  { id: 'win:news', label: 'News', group: 'Windows', key: 'n' },
  { id: 'win:traffic', label: 'Traffic', group: 'Windows', key: 'x' },
  { id: 'win:issues', label: 'Issues', group: 'Windows', key: 'g' },
  { id: 'win:metro', label: 'Metro', group: 'Windows', key: 'u' },
  { id: 'win:goals', label: 'Goals', group: 'Windows', key: 'o' },
  { id: 'win:load', label: 'Load game', group: 'Windows', key: 'l' },
  { id: 'win:help', label: 'Help', group: 'Windows', key: 'h' },
  { id: 'win:hotkeys', label: 'Keyboard shortcuts', group: 'Windows', key: '?' },
  { id: 'metroOverlay', label: 'Metro overlay on/off', group: 'View', key: 'j' },
  { id: 'screenshot', label: 'Screenshot (map view as PNG)', group: 'View', key: '.' },
  { id: 'graphics', label: 'Graphics: OpenGFX / procedural', group: 'View', key: 'k' },
  { id: 'sound', label: 'Mute / unmute sound', group: 'View', key: 'm' },
  { id: 'tool:rail', label: 'Rail', group: 'Build tools', key: '1' },
  { id: 'tool:road', label: 'Road', group: 'Build tools', key: '2' },
  { id: 'tool:station', label: 'Station', group: 'Build tools', key: '3' },
  { id: 'tool:busStop', label: 'Bus Stop', group: 'Build tools', key: '4' },
  { id: 'tool:truckStop', label: 'Truck Stop', group: 'Build tools', key: '5' },
  { id: 'tool:railDepot', label: 'Rail Depot', group: 'Build tools', key: '6' },
  { id: 'tool:roadDepot', label: 'Road Depot', group: 'Build tools', key: '7' },
  { id: 'tool:demolish', label: 'Demolish', group: 'Build tools', key: '8' },
  { id: 'tool:query', label: 'Query', group: 'Build tools', key: '9' },
  { id: 'alt:query', label: 'Query (alternative key)', group: 'Build tools', key: 'q' },
  { id: 'tool:airport', label: 'Airport', group: 'Build tools', key: '0' },
  { id: 'tool:terraform', label: 'Terraform', group: 'Build tools', key: 'z' },
  { id: 'tool:plant', label: 'Plant trees', group: 'Build tools', key: 'y' },
];

/** Fixed keys: shown in the list, not rebindable (the tool or the camera owns them). */
export const READ_ONLY_HOTKEYS = [
  { label: 'Pan camera', group: 'Camera', keys: 'Right/middle drag, W A S D, arrow keys' },
  { label: 'Zoom in / out', group: 'Camera', keys: '+ / -, mouse wheel' },
  { label: 'Cancel tool / close window', group: 'Camera', keys: 'Esc' },
  { label: 'Smooth roads and rails on/off', group: 'View', keys: 'R (when no tool uses R)' },
  { label: 'Rotate station / depot', group: 'Build tools', keys: 'R' },
  { label: 'Station length', group: 'Build tools', keys: '[ and ]' },
  { label: 'Station: cycle style', group: 'Build tools', keys: 'S' },
  { label: 'Signal: cycle type', group: 'Build tools', keys: 'S' },
  { label: 'Electrify: toggle', group: 'Build tools', keys: 'X' },
  { label: 'Terraform: cycle mode', group: 'Build tools', keys: 'C' },
  { label: 'Objects: cycle', group: 'Build tools', keys: 'J' },
  { label: 'Line drag: cycle shape', group: 'Build tools', keys: 'C' },
  { label: 'Line drag: tunnel / bridge (rail, road)', group: 'Build tools', keys: 'U' },
  { label: 'Line drag: highway class (road)', group: 'Build tools', keys: 'H' },
];

/**
 * Normalise a KeyboardEvent.key into a stored key, or null for modifier-only / unusable keys.
 * @param {string} k
 */
export function normalizeKey(k) {
  if (typeof k !== 'string' || k === '') return null;
  if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified', 'OS'].includes(k)) return null;
  if (k === 'Spacebar') return ' ';
  return k.toLowerCase();
}

/** Human label for a stored key: ' ' -> Space, single letters upper-case. */
export function keyLabel(k) {
  if (!k) return '';
  if (k === ' ') return 'Space';
  if (k.length === 1) return k.toUpperCase();
  return k.charAt(0).toUpperCase() + k.slice(1);
}

/** Default key map: id -> key. */
export function defaultKeys() {
  return Object.fromEntries(HOTKEY_ACTIONS.map((a) => [a.id, a.key]));
}

/** Default storage: localStorage when present, else null. */
function defaultStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/**
 * Read the saved overrides ({id: key}); invalid entries are dropped.
 * @param {{getItem:(k:string)=>string|null}|null} [storage]
 * @returns {Record<string,string>}
 */
export function loadOverrides(storage = defaultStorage()) {
  if (!storage) return {};
  let raw = null;
  try { raw = storage.getItem(HOTKEYS_STORAGE_KEY); } catch { return {}; }
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    const known = new Set(HOTKEY_ACTIONS.map((a) => a.id));
    const out = {};
    for (const [id, key] of Object.entries(o || {})) {
      if (known.has(id) && typeof key === 'string' && key !== '') out[id] = key;
    }
    return out;
  } catch { return {}; }
}

/**
 * Save the overrides; entries equal to the default are not stored.
 * @param {Record<string,string>} overrides
 * @param {{setItem:(k:string,v:string)=>void}|null} [storage]
 */
export function saveOverrides(overrides, storage = defaultStorage()) {
  const defs = defaultKeys();
  const out = {};
  for (const [id, key] of Object.entries(overrides)) if (id in defs && key !== defs[id]) out[id] = key;
  if (!storage) return;
  try {
    if (Object.keys(out).length) storage.setItem(HOTKEYS_STORAGE_KEY, JSON.stringify(out));
    else if (storage.removeItem) storage.removeItem(HOTKEYS_STORAGE_KEY);
    else storage.setItem(HOTKEYS_STORAGE_KEY, '{}');
  } catch { /* ignore */ }
}

/**
 * Effective key per action: override if present, else default.
 * @param {Record<string,string>} overrides
 * @returns {Record<string,string>} id -> key
 */
export function effectiveKeys(overrides) {
  const out = defaultKeys();
  for (const [id, key] of Object.entries(overrides || {})) if (id in out) out[id] = key;
  return out;
}

/**
 * Action (id) that already uses `key`, other than `id`; null when free.
 * @param {Record<string,string>} keys effective keys (from effectiveKeys)
 */
export function findConflict(keys, id, key) {
  for (const [other, k] of Object.entries(keys)) if (other !== id && k === key) return other;
  return null;
}

/** Label of an action id (or the id itself when unknown). */
export function actionLabel(id) {
  const a = HOTKEY_ACTIONS.find((x) => x.id === id);
  return a ? a.label : id;
}

/** Why a key cannot be bound, or null when it is allowed. */
export function bindProblem(key) {
  if (!key) return 'That key cannot be used.';
  if (RESERVED_KEYS.includes(key)) return `"${keyLabel(key)}" is reserved for camera and cancel.`;
  return null;
}

/**
 * Bind `id` to `key`. With swap, the action that held `key` takes the old key of `id`.
 * @param {Record<string,string>} overrides current overrides
 * @param {string} id
 * @param {string} key normalised key
 * @param {{swap?:boolean}} [opt]
 * @returns {{overrides: Record<string,string>, displaced: string|null}} displaced = action that lost the key (swap only)
 */
export function bindKey(overrides, id, key, opt = {}) {
  const keys = effectiveKeys(overrides);
  const other = findConflict(keys, id, key);
  const next = { ...overrides };
  let displaced = null;
  if (other && opt.swap) {
    next[other] = keys[id];
    displaced = other;
  }
  next[id] = key;
  // drop overrides that are back at their default
  const defs = defaultKeys();
  for (const k of Object.keys(next)) if (next[k] === defs[k]) delete next[k];
  return { overrides: next, displaced };
}

/** Reset everything to defaults. */
export function resetOverrides() {
  return {};
}

/** Label for a tooltip: "Rail (1)" or just the label when unbound. */
export function hotkeyTitle(label, id, keys = effectiveKeys(loadOverrides())) {
  const k = keys[id];
  return k ? `${label} (${keyLabel(k)})` : label;
}

/**
 * Turn the effective keys into a shortcut dispatch table: key -> handler.
 * @param {Record<string,string>} keys effective keys
 * @param {Record<string,()=>void>} handlers action id -> handler (missing ids are skipped)
 */
export function shortcutTable(keys, handlers) {
  const out = {};
  for (const a of HOTKEY_ACTIONS) {
    const k = keys[a.id];
    const fn = handlers[a.id];
    if (k && fn) out[k] = fn;
  }
  return out;
}

/** Change listeners (window UI, toolbar tooltips, main shortcut table). */
const listeners = new Set();
/** @param {()=>void} fn @returns {()=>void} unsubscribe */
export function onHotkeysChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emitHotkeysChanged() { for (const fn of listeners) fn(); }

/** Current overrides, cached after the first read; updated by setOverrides. */
let current = null;
export function currentOverrides() {
  if (!current) current = loadOverrides();
  return current;
}
/** Persist + broadcast a new override set. */
export function setOverrides(overrides) {
  current = { ...overrides };
  saveOverrides(current);
  emitHotkeysChanged();
}
