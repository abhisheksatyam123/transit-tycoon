
import { modelTractiveKn } from '../simulation/vehicleSpec.js';

/**
 * Build-vehicle window helpers (OpenTTD build_vehicle_gui.cpp: cargo filter ~:487 and the sorter list
 * ~:107). Pure (no DOM) so the filter and sorter can be unit-tested. The sort choice is a UI preference
 * only (localStorage, never the save). Default order = the model order the window already had.
 */

export const BUY_SORT_KEY = 'tt.buySort';
export const BUY_FILTER_ALL = '';

/** Sort keys offered in the window: [key, label, field-getter]. 'default' keeps the list order. */
export const BUY_SORTERS = [
  ['default', 'Default order', null],
  ['name', 'Name', (m) => String(m.name || '')],
  ['cost', 'Cost', (m) => Number(m.cost) || 0],
  ['speed', 'Speed', (m) => Number(m.speed) || 0],
  ['capacity', 'Capacity', (m) => Number(m.capacity) || 0],
  ['running', 'Running cost', (m) => Number(m.running) || 0],
  ['intro', 'Intro date', (m) => Number(m.introYear) || 0],
  // OpenTTD build_vehicle_gui.cpp:425-432: power / tractive effort (engine-only, name fallback otherwise).
  ['power', 'Power', (m) => Number(m.power) || 0, true],
  ['tractive', 'Tractive effort', (m) => modelTractiveKn(m) || 0, true],
  ['id', 'Engine ID', (m) => String(m.id || '')],
];

/** @returns {{key:string, dir:1|-1}} the remembered sort (default: list order, ascending). */
export function loadBuySort() {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(BUY_SORT_KEY);
    const o = raw ? JSON.parse(raw) : null;
    const key = o && BUY_SORTERS.some((s) => s[0] === o.key) ? o.key : 'default';
    return { key, dir: o && o.dir === -1 ? -1 : 1 };
  } catch {
    return { key: 'default', dir: 1 };
  }
}

/** Remember the sort choice in the UI (localStorage only; the save never sees it). */
export function saveBuySort(sort) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(BUY_SORT_KEY, JSON.stringify(sort));
  } catch { /* storage full or disabled: the choice just is not remembered */ }
}

/**
 * Sorted copy of `models` by a sorter key. 'default' (or an unknown key) returns the input order
 * unchanged. Ties keep the original order (stable sort), so equal costs never shuffle.
 * @param {any[]} models
 * @param {string} key
 * @param {1|-1} dir
 * @returns {any[]}
 */
export function sortModels(models, key, dir = 1) {
  const sorter = BUY_SORTERS.find((s) => s[0] === key);
  if (!sorter || !sorter[2]) return models.slice();
  // engine-only keys need engines throughout; otherwise fall back to name order (OpenTTD keeps the list usable)
  const nameFallback = !!sorter[3] && !models.every((m) => m && m.kind === 'engine');
  const get = nameFallback ? (m) => String(m.name || '') : sorter[2];
  return models
    .map((m, i) => ({ m, i, v: get(m) }))
    .sort((a, b) => {
      const c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      return c !== 0 ? c * dir : a.i - b.i;
    })
    .map((x) => x.m);
}

/**
 * Cargo ids the models can carry, sorted, for the filter dropdown.
 * @param {any[]} models
 * @returns {string[]}
 */
export function cargoFilterOptions(models) {
  const set = new Set();
  for (const m of models) for (const c of (m && m.cargos) || []) set.add(c);
  return [...set].sort();
}

/**
 * Models that can carry `cargo`. BUY_FILTER_ALL keeps every model (the same list as before).
 * @param {any[]} models
 * @param {string} cargo
 * @returns {any[]}
 */
export function filterModelsByCargo(models, cargo) {
  if (!cargo) return models.slice();
  return models.filter((m) => ((m && m.cargos) || []).includes(cargo));
}

/**
 * Default wagon count shown when buying a train (OpenTTD vehicle.freight_trains).
 * `freightTrainWagons` (game setting, 0 = automatic) pre-fills a freight consist; automatic keeps the
 * historic 4. Clamped to the current maxTrainWagons / train-length limit by the caller.
 * @param {object} state
 * @param {number} maxLimit highest wagon count the current train-length setting allows
 * @param {(s:object,key:string)=>any} getSetting settings reader (injected to keep this module pure)
 * @returns {number} wagon count, at least 1 and never above maxLimit
 */
export function defaultWagonCount(state, maxLimit, getSetting) {
  const want = Number(getSetting(state, 'freightTrainWagons')) || 0;
  const base = want > 0 ? want : 4;
  return Math.min(Math.max(1, base), Math.max(1, maxLimit));
}
