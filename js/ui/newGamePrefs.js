/**
 * New-game preferences (OpenTTD "new game" settings), browser-only and never in the save.
 * 'tt.newGameSettings': game settings marked `newGame` in settingsGroups.js. Changing one in the Settings
 * window remembers it here; the next New Game dialog start carries them over (carryOverNewGameSettings).
 * 'tt.newGameMapgen': the New Game dialog's map-generator select choices (see below).
 */
import { SETTING_META } from './settingsGroups.js';
import { DEFAULT_SETTINGS } from '../simulation/settings.js';
import { MAPGEN_DEFAULTS } from '../simulation/game.js';

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
    // type must match the default: booleans stay booleans, numbers finite, strings only a listed choice
    // (e.g. townLayout / roadSide). A mismatched or corrupt value is dropped (the default applies).
    if (typeof v !== typeof DEFAULT_SETTINGS[k]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    const meta = SETTING_META.find((m) => m.key === k);
    if (typeof v === 'string' && meta && meta.type === 'select' && Array.isArray(meta.options)
      && !meta.options.some(([ov]) => ov === v)) continue;
    out[k] = v;
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
 * @param {boolean|number|string} value
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

/** localStorage key for the New Game map-generator select choices (not in the save). */
export const NEW_GAME_MAPGEN_KEY = 'tt.newGameMapgen';

/**
 * Allowed values for each persisted map-generator option, mirroring the New Game dialog's selects.
 * Used to reject missing or corrupt stored values (they fall back to the default).
 */
export const MAPGEN_PREF_VALUES = Object.freeze({
  terrain: ['normal', 'flat', 'hilly', 'mountainous'],
  seaLevel: ['medium', 'none', 'low', 'high'],
  rivers: ['none', 'few', 'many', 'flowing'],
  cliffs: ['off', 'on'],
  lakes: ['off', 'few', 'many'],
  mountainStyle: ['off', 'on'],
  smoothness: ['normal', 'smooth', 'rough'],
  variety: [0, 1, 2, 3, 4, 5],
  townDensity: ['normal', 'low', 'high'],
  townLayout: ['mixed', 'original', 'better', '2x2', '3x3', 'random'],
  industryDensity: ['normal', 'low', 'high'],
  climate: ['temperate', 'arctic', 'tropic', 'toyland'],
  snowLine: [3, 5, 7],
  // 'random' from the game seed (map.js waterBorderMask); per-side values are allowed by the generator, the
  // dialog offers the four single sides.
  waterBorders: ['none', 'all', 'random', 'north', 'east', 'south', 'west'],
});

/**
 * Parse the stored mapgen JSON, keeping only known options with a listed value. Invalid JSON, arrays,
 * unknown keys and out-of-range values are dropped.
 * @param {string|null|undefined} raw
 * @returns {Record<string, string|number>}
 */
export function parseNewGameMapgen(raw) {
  if (!raw) return {};
  let o;
  try { o = JSON.parse(raw); } catch { return {}; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {};
  for (const k of Object.keys(MAPGEN_PREF_VALUES)) if (MAPGEN_PREF_VALUES[k].includes(o[k])) out[k] = o[k];
  return out;
}

/** @returns {Record<string, string|number>} remembered mapgen choices merged over the defaults */
export function loadNewGameMapgen() {
  try {
    return { ...MAPGEN_DEFAULTS, ...parseNewGameMapgen(typeof localStorage === 'undefined' ? null : localStorage.getItem(NEW_GAME_MAPGEN_KEY)) };
  } catch {
    return { ...MAPGEN_DEFAULTS };
  }
}

/**
 * Remember the New Game mapgen choices. Only non-default values are stored, so a missing key means the
 * defaults; selecting a default again clears the stored choice.
 * @param {Record<string, string|number>} values
 */
export function saveNewGameMapgen(values) {
  try {
    if (typeof localStorage === 'undefined') return;
    const out = {};
    for (const k of Object.keys(MAPGEN_PREF_VALUES)) {
      const v = values ? values[k] : undefined;
      if (MAPGEN_PREF_VALUES[k].includes(v) && v !== MAPGEN_DEFAULTS[k]) out[k] = v;
    }
    if (Object.keys(out).length || localStorage.getItem(NEW_GAME_MAPGEN_KEY) !== null) {
      localStorage.setItem(NEW_GAME_MAPGEN_KEY, JSON.stringify(out));
    }
  } catch {
    // storage unavailable or full: the choices still apply to this game
  }
}

/**
 * Initial values for the New Game dialog's mapgen selects: the remembered mapgen choices, with the
 * remembered town-layout setting (Settings window -> tt.newGameSettings) winning for new games.
 * @param {Record<string, boolean|number|string>} [rememberedSettings]
 * @param {Record<string, string|number>} [storedMapgen]
 * @returns {Record<string, string|number>}
 */
export function newGameMapgenSelection(rememberedSettings = {}, storedMapgen = loadNewGameMapgen()) {
  return { ...storedMapgen, townLayout: rememberedSettings.townLayout ?? storedMapgen.townLayout ?? DEFAULT_SETTINGS.townLayout };
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
