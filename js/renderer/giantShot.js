/**
 * Whole-map ("giant") screenshot plan. Pure: picks the zoom and the output size so the entire map
 * (including sprite overhang and raised terrain) fits in maxSide x maxSide pixels, and the world
 * origin of the output's top-left pixel. Used by js/ui/screenshot.js.
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from './iso.js';

/** Overhang margin (world px) for roofs and tall sprites beyond the tile diamonds. */
const GIANT_PAD = 256;
/** Largest image side in px (browser canvas limits are larger; PNG encode time grows with area). */
export const GIANT_MAX_SIDE = 8192;

/**
 * @param {{mapW:number, mapH:number, maxHeight?:number, maxSide?:number}} o
 * @returns {{zoom:number, width:number, height:number, originX:number, originY:number}}
 *   zoom: multiplier in (0,1], rounded down to 0.01 so the image fits; originX/Y: world-screen point of pixel (0,0).
 */
export function giantShotPlan(o) {
  const W = Math.max(1, o.mapW | 0), H = Math.max(1, o.mapH | 0);
  const maxH = Math.max(0, Number(o.maxHeight) || 0);
  const maxSide = Math.max(16, Math.floor(o.maxSide || GIANT_MAX_SIDE));
  const left = -H * HALF_W - GIANT_PAD;
  const right = W * HALF_W + GIANT_PAD;
  const top = -maxH * HEIGHT_STEP - GIANT_PAD;
  const bottom = (W + H) * HALF_H + GIANT_PAD;
  const extW = right - left, extH = bottom - top;
  // 1 for maps that fit, otherwise the largest 0.01 step that keeps both sides <= maxSide
  let zoom = Math.min(1, maxSide / Math.max(extW, extH));
  zoom = Math.max(0.01, Math.floor(zoom * 100) / 100);
  const width = Math.min(maxSide, Math.ceil(extW * zoom));
  const height = Math.min(maxSide, Math.ceil(extH * zoom));
  return { zoom, width, height, originX: left, originY: top };
}
