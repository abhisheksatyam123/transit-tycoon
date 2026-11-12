/**
 * Browser accessibility and display preferences: UI scale (75-200%), high contrast, reduced motion.
 * Stored in localStorage 'tt.a11y' as {"uiScale":100,"highContrast":false,"reduceMotion":false}.
 * Not in the save; the simulation never reads it. Defaults = the look before this setting existed.
 * applyA11y() mirrors the values onto <html>: --ui-scale (number), class 'hc' and class 'reduce-motion'.
 */

export const UI_SCALES = [75, 100, 125, 150, 200];
export const A11Y_DEFAULTS = Object.freeze({ uiScale: 100, highContrast: false, reduceMotion: false });
const KEY = 'tt.a11y';

/**
 * Parse a raw localStorage string; invalid fields fall back to the defaults.
 * @param {string|null|undefined} raw
 * @returns {{uiScale:number, highContrast:boolean, reduceMotion:boolean}}
 */
export function parseA11y(raw) {
  let o = {};
  try { o = raw ? JSON.parse(raw) || {} : {}; } catch { o = {}; }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) o = {};
  const s = Number(o.uiScale);
  return {
    uiScale: UI_SCALES.includes(s) ? s : A11Y_DEFAULTS.uiScale,
    highContrast: o.highContrast === true,
    reduceMotion: o.reduceMotion === true,
  };
}

/** @type {ReturnType<typeof parseA11y>|null} */
let cache = null;

/** @returns {ReturnType<typeof parseA11y>} saved prefs (cached after the first read) */
export function loadA11y() {
  if (cache) return cache;
  let raw = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY); } catch { raw = null; }
  cache = parseA11y(raw);
  return cache;
}

/**
 * Save a partial patch; invalid values are normalised. Takes effect on applyA11y().
 * @param {Partial<{uiScale:number, highContrast:boolean, reduceMotion:boolean}>} patch
 */
export function setA11y(patch) {
  const next = parseA11y(JSON.stringify({ ...loadA11y(), ...patch }));
  cache = next;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  return next;
}

/** @returns {number} current UI scale as a factor (1 = 100%) */
export function uiScaleFactor() { return loadA11y().uiScale / 100; }

/** @returns {boolean} true when the setting or the OS asks for reduced motion */

/**
 * Apply the prefs to the document (idempotent; call after any change).
 * @param {{style?:any, classList?:any}} [root] default document.documentElement
 */
export function applyA11y(root) {
  const r = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (!r) return;
  const p = loadA11y();
  r.style.setProperty('--ui-scale', String(p.uiScale / 100));
  r.classList.toggle('hc', p.highContrast);
  r.classList.toggle('reduce-motion', p.reduceMotion);
}

/** Test helper: forget the cached prefs so the next read hits localStorage again. */
export function resetA11yCache() { cache = null; }
