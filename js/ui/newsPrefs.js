/**
 * Message settings (OpenTTD style) per news category: 'off' | 'summary' | 'full'.
 *  - off: no ticker flash, no sound, no toast (the item is still kept in the news history)
 *  - summary: ticker flash + sound (the default, = the behaviour before this setting existed)
 *  - full: summary plus a toast
 * Stored in this browser (localStorage 'tt.news'), not in the save and not in the simulation.
 */
import { NEWS_CATEGORY_IDS } from '../simulation/news.js';

export const NEWS_LEVELS = ['off', 'summary', 'full'];
export const NEWS_LEVEL_LABEL = { off: 'Off', summary: 'Summary', full: 'Full' };
const KEY = 'tt.news';

/** @type {Record<string,string>|null} cache of the saved overrides (null = not read yet) */
let cache = null;

/** @returns {Record<string,string>} saved overrides (only valid entries); cached after the first read */
export function loadNewsPrefs() {
  if (cache) return cache;
  cache = readPrefs();
  return cache;
}

function readPrefs() {
  let raw = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); } catch { return {}; }
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(o || {})) if (NEWS_CATEGORY_IDS.includes(k) && NEWS_LEVELS.includes(v)) out[k] = v;
    return out;
  } catch { return {}; }
}

/** Save the overrides; a category at 'summary' (the default) is stored as absent. */
export function saveNewsPrefs(prefs) {
  const out = {};
  for (const [k, v] of Object.entries(prefs)) if (NEWS_CATEGORY_IDS.includes(k) && NEWS_LEVELS.includes(v) && v !== 'summary') out[k] = v;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
  cache = out;
}

/** Level of one category given the saved prefs. */
export function newsLevel(prefs, cat) {
  return (prefs && NEWS_LEVELS.includes(prefs[cat])) ? prefs[cat] : 'summary';
}

/**
 * What a news event does on screen.
 * @returns {{sound:boolean, flash:boolean, toast:boolean}}
 */
export function newsDisplay(level) {
  if (level === 'off') return { sound: false, flash: false, toast: false };
  if (level === 'full') return { sound: true, flash: true, toast: true };
  return { sound: true, flash: true, toast: false };
}
