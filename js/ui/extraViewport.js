/**
 * Extra viewports (OpenTTD "Extra viewport"): up to MAX_EXTRA_VIEWPORTS small live views of the map,
 * each with its own Renderer + Camera on a small canvas. The terrain heights are shared with the main
 * renderer. Rendering is throttled: an extra view draws every EXTRA_EVERY frames of the main loop.
 * Render-only: never changes game state.
 */
export const MAX_EXTRA_VIEWPORTS = 2;
/** The main loop renders an extra view once every this many frames (protects FPS). */
export const EXTRA_EVERY = 3;

/**
 * Pure: whether an extra view should draw on this main-loop frame.
 * @param {number} frame main frame counter
 * @param {number} every draw interval
 */
export function extraShouldDraw(frame, every = EXTRA_EVERY) {
  return every <= 1 || frame % every === 0;
}

/** Pure: next free slot index (0..max-1) or -1 when full. @param {Set<number>|number[]} used */
export function freeSlot(used, max = MAX_EXTRA_VIEWPORTS) {
  const s = new Set(used);
  for (let i = 0; i < max; i++) if (!s.has(i)) return i;
  return -1;
}

/** Registry of live extra viewports. Lets the main loop render them without knowing the window. */
const live = new Map();
let frameNo = 0;

/**
 * Register a viewport renderer (called by the window module).
 * @param {number} slot
 * @param {any} r Renderer
 */
export function registerExtra(slot, r) { live.set(slot, r); }
/** @param {number} slot */
export function unregisterExtra(slot) { live.delete(slot); }
/** Number of open extra viewports. */
export function extraCount() { return live.size; }

/**
 * Called once per main-loop frame AFTER the main render: draws the extra views due this frame.
 * @param {number} dt @param {any} game the current game (views of an older game are skipped)
 * @returns {number} how many extra views were drawn
 */
export function renderExtras(dt, game) {
  frameNo++;
  let n = 0;
  for (const r of live.values()) {
    if (!extraShouldDraw(frameNo)) continue;
    if (r.game !== game) continue; // the game was replaced; the window re-attaches on its next update
    r.render(dt);
    n++;
  }
  return n;
}
