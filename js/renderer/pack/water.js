/**
 * OpenGFX water and shore ground (OpenTTD water_cmd.cpp DrawShoreTile, water_land.h,
 * SPR_SHORE_BASE = 4062.. in the OpenGFX original set, see sprites.h).
 * The temperate set ships 8 original shore sprites, measured against the pixels:
 *   4062 water on the bottom-left edge (our S neighbour), 4063 bottom-right (our E neighbour),
 *   4065 water on both bottom edges.
 * The top edges (our N and W neighbours) use the same sprites rotated by 180 degrees, which maps the
 * bottom edges onto the top edges of the diamond exactly.
 */
import { packState } from './state.js';
import { HALF_H, HEIGHT_STEP as S } from '../iso.js';

/** Edge bits: our N=1 (top-right edge), E=2 (bottom-right), S=4 (bottom-left), W=8 (top-left). */
export const EDGE_N = 1;
export const EDGE_E = 2;
export const EDGE_S = 4;
export const EDGE_W = 8;

/** Rotated-sprite cache: key "id|rot" -> canvas (64x31 image, origin at the sprite's own offset). */
const cache = new Map();
/** Drop cached shore sprites (the shared pack changed, e.g. toyland view swap). */
export function clearShoreCache() { cache.clear(); }

/**
 * Canvas of one OpenGFX sprite, optionally rotated 180 degrees (rot = 1).
 * @param {number} id
 * @param {number} rot
 * @returns {HTMLCanvasElement|null}
 */
function spriteCanvas(id, rot) {
  const key = id + '|' + rot;
  if (cache.has(key)) return cache.get(key);
  const pack = packState.pack;
  const s = pack && pack.sprites[id];
  if (!s) return null;
  const [ai, x, y, w, h] = s;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (rot) { g.translate(w, h); g.rotate(Math.PI); }
  g.drawImage(pack.atlases[ai], x, y, w, h, 0, 0, w, h);
  cache.set(key, c);
  return c;
}

/**
 * Draw the shore ground of a land tile with water on some edges. Replaces the land ground sprite.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} mask EDGE_* bits of neighbouring water tiles
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number[]} c corner heights [hN,hE,hS,hW]
 * @returns {boolean} false when no shore sprite applies
 */
export function drawOgfxShore(ctx, mask, sx, sy, c) {
  if (!packState.pack || !mask) return false;
  const min = Math.min(c[0], c[1], c[2], c[3]);
  const top = sy - HALF_H - S * min;
  const ids = [];
  if ((mask & (EDGE_S | EDGE_E)) === (EDGE_S | EDGE_E)) ids.push([4065, 0]);
  else {
    if (mask & EDGE_S) ids.push([4062, 0]);
    if (mask & EDGE_E) ids.push([4063, 0]);
  }
  if (mask & EDGE_N) ids.push([4062, 1]);
  if (mask & EDGE_W) ids.push([4063, 1]);
  let drawn = false;
  for (const [id, rot] of ids) {
    const cv = spriteCanvas(id, rot);
    if (!cv) continue;
    const s = packState.pack.sprites[id];
    ctx.drawImage(cv, sx + s[5], top + s[6]);
    drawn = true;
  }
  return drawn;
}
