import { railIds } from './rail.js';
/**
 * Maps our tile state to OpenGFX temperate sprite ids.
 * Corner order follows heights.js: c = [hN, hE, hS, hW]. Our N is the top screen corner,
 * which is OpenTTD's N corner, so slope bits are N=8, E=4, S=2, W=1 (OpenTTD SLOPE_* corner bits).
 * Road / rail masks: N=1, E=2, S=4, W=8 (ours). Converted to OpenTTD diagonal bits (NW=1, SW=2,
 * SE=4, NE=8): N->NE(8), E->SE(4), S->SW(2), W->NW(1).
 */

/** Road sprite id for a road mask (see road.js). */
export { roadSprite } from './road.js';

/**
 * Rail tile sprite ids: flat grass ground then one overlay stub per connected edge.
 * @param {number} mask rail mask N=1,E=2,S=4,W=8
 * @returns {number[]} ids to draw in order (empty when no rail)
 */
export function railSprites(mask) {
  return railIds(mask, true);
}

/** Tree sprite id (fully grown frame) for a hash, drawn on forest tiles. */
const TREE_KEYS = [0, 1, 2, 4, 6, 8, 10, 11, 12, 13, 14];
export function treeSprite(hash) {
  return 1576 + 7 * TREE_KEYS[hash % TREE_KEYS.length] + 6;
}
