/**
 * New-game settings (OpenTTD "new game" settings): game settings marked `newGame` in settingsGroups.js.
 * Changing one in the Settings window remembers it here (localStorage 'tt.newGameSettings', a JSON object
 * of key -> value); the next New Game dialog start carries them over (carryOverNewGameSettings). Not in the save.
 */
import { SETTING_META } from './settingsGroups.js';

export const NEW_GAME_KEY = 'tt.newGameSettings';

/** Keys of the settings that apply to new games. */
export const NEW_GAME_SETTING_KEYS = SETTING_META.filter((m) => m.newGame).map((m) => m.key);

/**
 * Parse the stored JSON. Invalid JSON, arrays and unknown keys / values are dropped.
 * @param {string|null|undefined} raw
 * @returns {Record<string, boolean|number>}
 */
export function parseNewGameSettings(raw) {
  if (!raw) return {};
  let o;
  try { o = JSON.parse(raw); } catch { return {}; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const k of NEW_GAME_SETTING_KEYS) {
    const v = o[k];
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** @returns {Record<string, boolean|number>} remembered new-game settings ({} when none or storage unavailable) */
export function loadNewGameSettings() {
  try {
    return parseNewGameSettings(typeof localStorage === 'undefined' ? null : localStorage.getItem(NEW_GAME_KEY));
  } catch {
    return {};
  }
}

/**
 * Remember one new-game setting. Silently does nothing for keys that are not new-game settings or when storage is unavailable.
 * @param {string} key
 * @param {boolean|number} value
 */
export function saveNewGameSetting(key, value) {
  if (!NEW_GAME_SETTING_KEYS.includes(key)) return;
  try {
    if (typeof localStorage === 'undefined') return;
    const cur = parseNewGameSettings(localStorage.getItem(NEW_GAME_KEY));
    cur[key] = value;
    localStorage.setItem(NEW_GAME_KEY, JSON.stringify(cur));
  } catch {
    // storage unavailable or full: the setting still applies to the current game
  }
}

/**
 * Merge remembered new-game settings into New Game options. Explicit dialog choices (opts.settings) win.
 * Returns opts unchanged (same object) when nothing is remembered, or for the Moscow scenario (its day-0 snapshot
 * path must stay as it is) and editor games.
 * @template {{scenario?:string, editor?:any, settings?:Record<string, any>}} T
 * @param {T} opts
 * @param {Record<string, boolean|number>} remembered
 * @returns {T}
 */
export function carryOverNewGameSettings(opts, remembered) {
  if (!remembered || !Object.keys(remembered).length) return opts;
  if (!opts || opts.scenario === 'moscow' || opts.editor) return opts;
  const settings = { ...remembered, ...(opts.settings || {}) };
  return { ...opts, settings };
}
