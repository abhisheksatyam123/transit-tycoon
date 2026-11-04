/**
 * Baked OSM 3D landmark ensembles (tools/lm3d/bake.js -> js/config/landmarks3d.js + assets/landmarks/*.png).
 * The whole ensemble is drawn once, from its front tile, at its true geographic position: level images are
 * rendered at zoom 1/2/4 and the smallest level >= the current canvas scale is used (crisp pixels when equal).
 */
import { LM3D } from '../../config/landmarks3d.js';
import { HALF_W, HALF_H } from '../iso.js';

const images = new Map();
function levelImage(lv) {
  let im = images.get(lv.file);
  if (!im) {
    im = typeof Image !== 'undefined' ? new Image() : null;
    if (im) { im.decoding = 'async'; im.src = lv.file; }
    images.set(lv.file, im);
  }
  return im && im.complete && im.naturalWidth ? im : null;
}

/** True when a landmark id is a baked 3D ensemble. */
export function isLm3d(id) { return !!LM3D[id]; }

/** Preload all level images (call once when a Moscow game starts). */
export function preloadLm3d() { for (const e of Object.values(LM3D)) for (const lv of e.levels) levelImage(lv); }

/**
 * Draw ensemble `id` from its front tile (x,y) whose world-screen centre is (sx,sy) (includes terrain height).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawLm3d(ctx, id, x, y, sx, sy) {
  const e = LM3D[id]; if (!e) return false;
  const scale = ctx.getTransform ? Math.abs(ctx.getTransform().a) : 1;
  const lv = e.levels.find((l) => l.z >= scale - 1e-3) || e.levels[e.levels.length - 1];
  let im = levelImage(lv), use = lv;
  if (!im) { for (const l of e.levels) { const i = levelImage(l); if (i) { im = i; use = l; break; } } }
  if (!im) return true;
  const dx = sx - (x - y) * HALF_W, dy = sy - (x + y) * HALF_H; // terrain height offset of the front tile
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = scale < use.z - 1e-3;
  ctx.drawImage(im, use.wx + dx, use.wy + dy, use.w / use.z, use.h / use.z);
  ctx.imageSmoothingEnabled = prev;
  return true;
}
