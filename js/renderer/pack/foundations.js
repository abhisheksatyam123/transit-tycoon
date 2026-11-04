/**
 * Foundations (landscape.cpp DrawFoundation, sprites 989..1004). A non-flat tile carrying a building,
 * station, road or rail is levelled to its highest corner. The helper returns the level and the
 * foundation sprite (null where the sprite mapping is not measured yet; the object then floats on
 * the flat level, which is OpenTTD's behaviour for the leveled part).
 */
import { slopeBits } from './slope.js';

/**
 * @param {number[]} corners [hN,hE,hS,hW] in levels
 * @returns {{spriteId:number|null, flatHeight:number}}
 */
export function foundationFor(corners) {
  const max = Math.max(corners[0], corners[1], corners[2], corners[3]);
  const min = Math.min(corners[0], corners[1], corners[2], corners[3]);
  if (max === min) return { spriteId: null, flatHeight: min };
  return { spriteId: null, flatHeight: max, bits: slopeBits(corners) };
}
