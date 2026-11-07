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

/**
 * Start loading the pack. `onReady` is called when the pack is active (or not) so the renderer can
 * invalidate its ground cache. Returns the promise.
 * @param {{invalidate?:()=>void}} renderer
 */
export async function initPack(renderer) {
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
  // the ARCTIC pack (snowy ground, assets/opengfx/arctic) loads the same way; used only by sub-arctic games
  if (pack) {
    loadArcticPack().then((arctic) => {
      arcticState.pack = arctic;
      renderer.setPackEnabled(packState.enabled && !!pack);
    });
  }
  // the TROPIC pack (desert ground, assets/opengfx/tropic) loads the same way; used only by sub-tropical games
  if (pack) {
    loadTropicPack().then((tropic) => {
      tropicState.pack = tropic;
      renderer.setPackEnabled(packState.enabled && !!pack);
    });
  }
  // the TOYLAND pack (toyland ground and houses, assets/opengfx/toyland) loads the same way; used only by toyland games
  if (pack) {
    loadToylandPack().then((toyland) => {
      toylandState.pack = toyland;
      applyToylandView();
      renderer.setPackEnabled(packState.enabled && !!pack);
    });
  }
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
