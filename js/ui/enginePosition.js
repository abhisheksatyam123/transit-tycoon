/**
 * D17 depot UI (pure, no DOM): the "Position" input for adding an extra engine.
 * Shown only when BOTH multiheadInterleave and multiEngineConsists are on; otherwise the add-engine UI is unchanged.
 */
import { getSetting } from '../simulation/settings.js';

/**
 * True only when both opt-in settings are on.
 * @param {any} state game state (reads state.settings through getSetting)
 * @returns {boolean}
 */
export function enginePositionUiOn(state) {
  return getSetting(state, 'multiheadInterleave') === true && getSetting(state, 'multiEngineConsists') === true;
}

/**
 * Valid range and value for the Position input. Positions run 0..extra (extra = current extra-engine count);
 * the default (and the append position) is `extra`. Non-numeric or missing requests fall back to the default;
 * fractions are floored, out-of-range values are clamped.
 * @param {number} extra current extra-engine count (>= 0)
 * @param {number|string|null|undefined} requested
 * @returns {{min:number,max:number,value:number}}
 */
export function enginePositionRange(extra, requested) {
  const max = Math.max(0, Math.floor(Number(extra) || 0));
  const n = requested == null || requested === '' ? NaN : Math.floor(Number(requested));
  const value = Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : max;
  return { min: 0, max, value };
}
