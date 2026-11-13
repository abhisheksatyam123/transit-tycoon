/**
 * OpenGFX pack controller: loads the pack once, remembers the user's choice in localStorage
 * ('tt.gfx' = 'ogfx' | 'procedural'; default OpenGFX = the OpenTTD look; procedural is the
 * alternative with smooth diagonals and avenue classes) and exposes the toggle used by key K.
 */
import { loadOpenGfx, loadExtraPack, loadArcticPack, loadTropicPack, loadToylandPack } from './loader.js';
import { toylandState, applyToylandView } from './toyland.js';
import { tropicState } from './tropic.js';
import { arcticState } from './arctic.js';
import { packState } from './state.js';
import { clearTints } from './draw.js';

const KEY = 'tt.gfx';

/** @returns {string} 'ogfx' or 'procedural' */
export function savedGfxMode() {
  try { return localStorage.getItem(KEY) === 'procedural' ? 'procedural' : 'ogfx'; } catch { return 'ogfx'; }
}

/** Climate packs by climate id: loader, and where the loaded pack goes. Loaded on demand (ensureClimatePack). */
const CLIMATE_PACKS = {
  arctic: { load: loadArcticPack, apply: (pack) => { arcticState.pack = pack; } },
  tropic: { load: loadTropicPack, apply: (pack) => { tropicState.pack = pack; } },
  toyland: { load: loadToylandPack, apply: (pack) => { toylandState.pack = pack; applyToylandView(); } },
};

/** Renderer to refresh once a climate pack arrives (set by initPack). */
let climateRenderer = null;
/** True once the base OpenGFX pack is loaded (climate packs are built on top of it). */
let basePackReady = false;
/** Climate of the latest attached game ('arctic' | 'tropic' | 'toyland' | null = temperate). */
let requestedClimate = null;
/** @type {Map<string, Promise<object|null>>} one load per climate, memoised (null = missing pack). */
const climateLoads = new Map();

/**
 * Load the climate pack the game needs (arctic, tropic or toyland), once. Temperate (null) loads nothing.
 * Called from renderer.setGame, so it covers boot, New Game, scenario and load. Before the base pack is
 * ready the request is remembered and served by initPack. A missing pack resolves to null: the procedural
 * ground stays in use, as it did before the packs were lazy.
 * @param {string|null} climate
 * @returns {Promise<object|null>|null} the load (null when nothing is loaded now)
 */
export function ensureClimatePack(climate) {
  requestedClimate = climate || null;
  if (!basePackReady || !requestedClimate) return null;
  const def = CLIMATE_PACKS[requestedClimate];
  if (!def) return null;
  const id = requestedClimate;
  if (!climateLoads.has(id)) {
    climateLoads.set(id, def.load().then((pack) => {
      def.apply(pack);
      if (climateRenderer) climateRenderer.setPackEnabled(packState.enabled && !!packState.pack);
      // A missing pack is often transient (first fetch race): drop the memoised null so a later
      // ensureClimatePack retries instead of keeping procedural graphics for the whole session.
      if (!pack) climateLoads.delete(id);
      return pack;
    }).catch(() => {
      climateLoads.delete(id);
      return null;
    }));
  }
  return climateLoads.get(id);
}

/**
 * Start loading the pack. `onReady` is called when the pack is active (or not) so the renderer can
 * invalidate its ground cache. Returns the promise.
 * @param {{invalidate?:()=>void}} renderer
 */
export async function initPack(renderer) {
  climateRenderer = renderer;
  const pack = await loadOpenGfx();
  packState.pack = pack;
  toylandState.base = pack;
  packState.enabled = savedGfxMode() === 'ogfx';
  renderer.setPackEnabled(packState.enabled && !!pack);
  // the extra pack (canals, locks, river slopes, tram overlays) loads in the background: the first frame
  // is drawn without it, and the ground cache is rebuilt once it arrives
  if (pack) {
    loadExtraPack().then((extra) => {
      packState.extra = extra;
      renderer.setPackEnabled(packState.enabled && !!pack);
    });
  }
  // the climate pack (arctic / tropic / toyland) is loaded only when the attached game needs it
  basePackReady = !!pack;
  ensureClimatePack(requestedClimate);
  return pack;
}

/**
 * Toggle OpenGFX / procedural graphics and persist the choice.
 * @param {{setPackEnabled:(on:boolean)=>void}} renderer
 * @returns {boolean} the new state (true = OpenGFX)
 */
export function togglePack(renderer) {
  packState.enabled = !packState.enabled;
  try { localStorage.setItem(KEY, packState.enabled ? 'ogfx' : 'procedural'); } catch { /* private mode */ }
  clearTints();
  renderer.setPackEnabled(packState.enabled && !!packState.pack);
  return packState.enabled;
}
