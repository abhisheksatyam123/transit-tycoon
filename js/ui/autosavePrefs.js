/**
 * Periodic autosave preference (OpenTTD gui.autosave_interval, NotInSave). Stored in this browser
 * (localStorage 'tt.autosave' = {"interval":N}), never in the save. N = months between timed autosaves:
 * 0 = off, 1 / 3 / 6 / 12 allowed; default 1 (monthly, the existing behaviour).
 * Timed autosaves rotate through AUTOSAVE_SLOTS (newest overwrites the oldest); the load window lists them.
 */
const AUTOSAVE_KEY = 'tt.autosave';
export const AUTOSAVE_INTERVALS = [0, 1, 3, 6, 12];
export const AUTOSAVE_DEFAULT = 1;
export const AUTOSAVE_SLOTS = ['auto-1', 'auto-2', 'auto-3'];

/** @param {any} raw @returns {number} a valid interval (default when invalid). */
export function normalizeInterval(raw) {
  const n = Number(raw);
  return AUTOSAVE_INTERVALS.includes(n) ? n : AUTOSAVE_DEFAULT;
}

/** @param {string|null|undefined} raw @returns {{interval:number}} */
export function parseAutosavePrefs(raw) {
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch { o = null; }
  return { interval: normalizeInterval(o && typeof o === 'object' ? o.interval : undefined) };
}

/** @returns {{interval:number}} */
export function loadAutosavePrefs() {
  try { return parseAutosavePrefs(typeof localStorage === 'undefined' ? null : localStorage.getItem(AUTOSAVE_KEY)); } catch { return parseAutosavePrefs(null); }
}

/** @param {number} interval */
export function setAutosaveInterval(interval) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ interval: normalizeInterval(interval) }));
  } catch { /* storage unavailable: default applies */ }
}

/**
 * Count one game month; true when a timed autosave is due (and resets the counter).
 * Off (interval 0) never fires and does not count.
 * @param {number} interval
 * @param {number} monthsSince months already counted since the last timed autosave
 * @returns {{due:boolean, months:number}}
 */
export function advanceAutosaveCounter(interval, monthsSince) {
  if (!interval) return { due: false, months: 0 };
  const months = monthsSince + 1;
  return months >= interval ? { due: true, months: 0 } : { due: false, months };
}

/**
 * Choose the ring slot to overwrite: an empty slot first, else the one with the oldest savedAt.
 * @param {Array<{slot:string, savedAt?:number}|null>} metas one entry per AUTOSAVE_SLOTS (null = empty)
 * @returns {string}
 */
export function pickAutosaveSlot(metas) {
  let best = null;
  for (const slot of AUTOSAVE_SLOTS) {
    const m = metas.find((x) => x && x.slot === slot) || null;
    if (!m) return slot;
    if (best === null || (m.savedAt || 0) < best.at) best = { slot, at: m.savedAt || 0 };
  }
  return best ? best.slot : AUTOSAVE_SLOTS[0];
}

/** Label used in the load window. @param {string} slot */
export function autosaveLabel(slot) {
  const i = AUTOSAVE_SLOTS.indexOf(slot);
  return i < 0 ? slot : `Autosave ${i + 1}`;
}

/**
 * Real-time autosave interval (OpenTTD gui.autosave_interval game setting, state.settings.autosaveInterval).
 * Maps the setting value to milliseconds, or 0 for off.
 * @param {string} v
 * @returns {number}
 */
export function autosaveIntervalMs(v) {
  if (v === '1min') return 60000;
  if (v === '5min') return 300000;
  if (v === '10min') return 600000;
  if (v === '15min') return 900000;
  return 0;
}
