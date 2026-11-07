/**
 * Registry for the Moscow-only data (baked map, 3D landmark ensembles, scenario builder).
 * Nothing in the static import graph of a random game reaches the big Moscow files: the browser
 * awaits loadMoscowData() before a Moscow game is created, deserialized or drawn. Node tools and
 * tests load the same data with a static side-effect import of moscowData.js (registration).
 */

/** Filled by moscowData.js: LM3D ensembles by id (empty until loaded, so drawing is a no-op). */
export const LM3D = {};
/** Filled by moscowData.js: the baked map and the scenario builder. */
export const MOSCOW_DATA = { map: null, build: null };

/** @returns {boolean} true once moscowData.js has registered the Moscow data. */
export function moscowLoaded() { return MOSCOW_DATA.build !== null; }

/** Register the Moscow data (called once by moscowData.js). */
export function registerMoscowData({ map, lm3d, build }) {
  MOSCOW_DATA.map = map;
  MOSCOW_DATA.build = build;
  Object.assign(LM3D, lm3d);
}

/** Load the Moscow data chunk (browser: dynamic import, a separate bundle chunk). */
export async function loadMoscowData() {
  if (!moscowLoaded()) await import('./moscowData.js');
  return MOSCOW_DATA;
}

/**
 * Load the Moscow data when a save string (or the requested scenario) needs it.
 * @param {string|object} data
 */
export async function loadMoscowDataFor(data) {
  const isMoscow = typeof data === 'string' ? data.includes('"scenario":"moscow"') : data && data.scenario === 'moscow';
  return isMoscow ? loadMoscowData() : null;
}
