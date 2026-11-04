/**
 * Save/load: the whole game is the JSON-serialisable `state` object.
 */
import { SAVE_VERSION } from './constants.js';
import { createTraffic } from './traffic.js';

/**
 * Serialise state to a JSON string.
 * @param {object} state
 * @returns {string}
 */
export function serializeState(state) {
  if (!state.scenario) return JSON.stringify(state);
  // real-map scenarios are large: store tiles compactly (random worlds keep the classic format)
  return JSON.stringify(state, (key, value) => (key === 'tiles' && Array.isArray(value) ? value.map(compactTile) : value));
}

/** Tile fields and their defaults (omitted from saves when equal). */
const TILE_DEFAULTS = { terrain: 'grass', height: 0, rail: 0, road: 0, building: null, owner: null };

/** Drop default-valued fields from a tile for the save (restored by expandTile on load). */
function compactTile(t) {
  const o = {};
  for (const k of Object.keys(t)) if (t[k] !== TILE_DEFAULTS[k]) o[k] = t[k];
  return o;
}

/** Restore default fields on a compact tile. */
function expandTile(t) {
  return Object.assign({}, TILE_DEFAULTS, t, { building: t.building ?? null, owner: t.owner ?? null });
}

/**
 * Parse and validate a save string (or already-parsed object).
 * @param {string|object} json
 * @returns {object} state
 */
export function parseState(json) {
  const state = typeof json === 'string' ? JSON.parse(json) : structuredClone(json);
  if (state && state.map && Array.isArray(state.map.tiles)) state.map.tiles = state.map.tiles.map(expandTile);
  if (!state || typeof state !== 'object' || !state.map || !Array.isArray(state.map.tiles)) {
    throw new Error('Invalid save data');
  }
  if (state.version !== SAVE_VERSION) throw new Error(`Unsupported save version ${state.version}`);
  return migrate(state);
}

/** Fill fields added after a save was written (keeps old saves of the same version loadable). */
function migrate(state) {
  state.news ??= [];
  state.depots ??= [];
  state.company.negativeMonths ??= 0;
  const n = state.map.width * state.map.height;
  if (!state.traffic) state.traffic = createTraffic(state);
  const tr = state.traffic;
  tr.load ??= [];
  if (tr.load.length !== n) tr.load = new Array(n).fill(0);
  tr.jam ??= [];
  if (tr.jam.length !== n) tr.jam = new Array(n).fill(0);
  tr.acc ??= { samples: new Array(n).fill(0), blocked: new Array(n).fill(0), speedSum: 0, speedN: 0 };
  if (tr.acc.samples.length !== n) tr.acc.samples = new Array(n).fill(0);
  tr.acc.blocked ??= new Array(n).fill(0);
  if (tr.acc.blocked.length !== n) tr.acc.blocked = new Array(n).fill(0);
  return state;
}
