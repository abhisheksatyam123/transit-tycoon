/**
 * Pure sort / filter helpers for the town, industry and sign lists (OpenTTD town_gui.cpp SortTownWindow,
 * industry_gui.cpp SortIndustries, signs_gui.cpp SortSigns). Sort and filter state lives on each window
 * instance only (UI state, never saved). Ties break on id so the order is stable across refreshes.
 */
import { townRating } from '../../simulation/townAuthority.js';
import { INDUSTRY_BY_ID } from '../../config/industries.js';

/** Sort keys: [key, label]. */
export const TOWN_SORTS = [['name', 'Name'], ['population', 'Population'], ['rating', 'Rating']];
export const INDUSTRY_SORTS = [['name', 'Name'], ['type', 'Type'], ['production', 'Production'], ['transported', 'Transported %']];
export const DEPOT_SORTS = [['name', 'Name'], ['kind', 'Type'], ['inside', 'Inside'], ['town', 'Town']];

/** Case-insensitive, numeric-aware name compare. */
function nameCmp(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

/** Sum of a per-cargo map. */
export function sumMap(m) {
  let s = 0;
  if (m) for (const k in m) s += m[k] || 0;
  return s;
}

/** Percent of produced cargo moved last month (0 when nothing was produced). */
export function transportedPct(ind) {
  const made = sumMap(ind.producedLastMonth);
  if (!made) return 0;
  return Math.round((sumMap(ind.transportedLastMonth) / made) * 100);
}

/** Sort an array by a comparator with a direction; stable on id. Pure: returns a new array. */
function sortBy(items, cmp, dir) {
  const s = dir < 0 ? -1 : 1;
  return items.slice().sort((a, b) => (cmp(a, b) * s) || ((a.id ?? 0) - (b.id ?? 0)));
}

/**
 * Towns sorted by name / population / rating.
 * @param {{id:number,name?:string,population?:number,companyRating?:number}[]} towns
 * @param {{sort?:string, dir?:number}} [opts] dir 1 ascending (default), -1 descending
 */
export function sortTowns(towns, opts = {}) {
  const { sort = 'population', dir = -1 } = opts;
  let cmp;
  if (sort === 'name') cmp = (a, b) => nameCmp(a.name, b.name);
  else if (sort === 'rating') cmp = (a, b) => townRating(a) - townRating(b);
  else cmp = (a, b) => (a.population || 0) - (b.population || 0);
  return sortBy(towns, cmp, dir);
}

/**
 * Industries sorted by name / type / production / transported %.
 * @param {object[]} industries
 * @param {{sort?:string, dir?:number}} [opts]
 */
export function sortIndustries(industries, opts = {}) {
  const { sort = 'name', dir = 1 } = opts;
  const typeName = (i) => (INDUSTRY_BY_ID[i.typeId] || {}).name || String(i.typeId);
  let cmp;
  if (sort === 'type') cmp = (a, b) => nameCmp(typeName(a), typeName(b)) || nameCmp(a.name, b.name);
  else if (sort === 'production') cmp = (a, b) => sumMap(a.producedLastMonth) - sumMap(b.producedLastMonth);
  else if (sort === 'transported') cmp = (a, b) => transportedPct(a) - transportedPct(b);
  else cmp = (a, b) => nameCmp(a.name, b.name);
  return sortBy(industries, cmp, dir);
}

/**
 * Depots sorted by name / kind / vehicles inside / nearest town.
 * @param {object[]} depots
 * @param {{sort?:string, dir?:number}} [opts]
 */
export function sortDepots(depots, opts = {}) {
  const { sort = 'name', dir = 1 } = opts;
  let cmp;
  if (sort === 'kind') cmp = (a, b) => nameCmp(a.kindLabel || a.kind, b.kindLabel || b.kind) || nameCmp(a.name, b.name);
  else if (sort === 'inside') cmp = (a, b) => (a.inside || 0) - (b.inside || 0);
  else if (sort === 'town') cmp = (a, b) => nameCmp(a.town, b.town) || nameCmp(a.name, b.name);
  else cmp = (a, b) => nameCmp(a.name, b.name);
  return sortBy(depots, cmp, dir);
}

/**
 * Name search (OpenTTD QueryString filter, town_gui.cpp / station_gui.cpp / industry_gui.cpp): true when the
 * trimmed, case-insensitive query is a substring of the name. An empty query matches everything.
 * Unicode-safe (Cyrillic / Latin names compare with toLowerCase).
 * @param {string} name
 * @param {string} query
 */
export function matchesName(name, query) {
  const q = String(query || '').trim().toLowerCase();
  return !q || String(name || '').toLowerCase().includes(q);
}

/**
 * Keep the items whose name matches the query, preserving order. Pure: returns a new array
 * (the input array itself when the query is empty).
 * @template T
 * @param {T[]} items
 * @param {string} query
 * @param {(item:T)=>string} nameOf
 * @returns {T[]}
 */
export function filterByName(items, query, nameOf) {
  if (!String(query || '').trim()) return items;
  return items.filter((it) => matchesName(nameOf(it), query));
}

/**
 * Signs: filtered by a case-insensitive substring of the text, then sorted by text.
 * @param {{id:number,text?:string}[]} signs
 * @param {{filter?:string, dir?:number}} [opts]
 */
export function filterSigns(signs, opts = {}) {
  const { filter = '', dir = 1 } = opts;
  const q = String(filter || '').trim().toLowerCase();
  const list = q ? signs.filter((s) => String(s.text || '').toLowerCase().includes(q)) : signs.slice();
  return sortBy(list, (a, b) => nameCmp(a.text, b.text), dir);
}

/**
 * Cache a sorted list: re-sorts only when the item list (identity and order), each item's sort keys,
 * or the window's sort/filter signature changed. A refresh with unchanged data costs one linear scan.
 * @template T
 * @param {(items:T[])=>T[]} sortFn pure sort using the window's current state
 * @param {(item:T)=>(string|number)[]} keysOf the fields the sort reads
 * @returns {(items:T[], signature:string)=>T[]}
 */
export function makeSortMemo(sortFn, keysOf) {
  let lastSig = null;
  let lastFlat = null;
  let lastOut = null;
  return (items, signature) => {
    const flat = [];
    for (const it of items) { flat.push(it); for (const k of keysOf(it)) flat.push(k); flat.push('|'); }
    if (lastOut && lastSig === signature && lastFlat.length === flat.length && flat.every((v, i) => v === lastFlat[i])) {
      return lastOut;
    }
    lastSig = signature; lastFlat = flat;
    lastOut = sortFn(items);
    return lastOut;
  };
}
