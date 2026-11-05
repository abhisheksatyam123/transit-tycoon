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

/** Pick the level for the current canvas scale (falls back to any loaded level). */
function pickLevel(e, scale, ground) {
  const lv = e.levels.find((l) => l.z >= scale - 1e-3) || e.levels[e.levels.length - 1];
  const part = (l) => (ground ? l.g && { ...l.g, z: l.z } : l);
  let use = part(lv); if (!use) return null;
  let im = levelImage(use);
  if (!im) for (const l of e.levels) { const u = part(l); const i = u && levelImage(u); if (i) { im = i; use = u; break; } }
  return im ? { im, use } : null;
}

function blit(ctx, e, x, y, sx, sy, ground, rect) {
  const scale = ctx.getTransform ? Math.abs(ctx.getTransform().a) : 1;
  const p = pickLevel(e, scale, ground); if (!p) return;
  const { im, use } = p;
  const dx = sx - (x - y) * HALF_W, dy = sy - (x + y) * HALF_H; // terrain height offset of the front tile
  const X = use.wx + dx, Y = use.wy + dy, W = use.w / use.z, H = use.h / use.z;
  if (rect && (X > rect.x1 || Y > rect.y1 + 140 || X + W < rect.x0 || Y + H < rect.y0)) return;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = scale < use.z - 1e-3;
  ctx.drawImage(im, X, Y, W, H);
  ctx.imageSmoothingEnabled = prev;
}

const frontCache = new WeakMap();
/** Front tiles of the ensembles stamped on this map: [{id,x,y}] (rescanned every 240 calls; tiles rarely change). */
export function lm3dFronts(map) {
  let c = frontCache.get(map);
  if (!c || ++c.n > 240) {
    const list = [];
    for (let i = 0; i < map.tiles.length; i++) { const b = map.tiles[i].building; if (b && b.lm3d && b.front && LM3D[b.id]) list.push({ id: b.id, x: i % map.width, y: Math.floor(i / map.width) }); }
    if (Array.isArray(map.lm3dOverlays)) for (const o of map.lm3dOverlays) if (o && LM3D[o.id] && Number.isInteger(o.x) && Number.isInteger(o.y)) list.push({ id: o.id, x: o.x, y: o.y });
    c = { list, n: 0 }; frontCache.set(map, c);
  }
  return c.list;
}

/** Ground image (plazas, parks, paths) of ensemble `id`; drawn before all objects so nothing tall is painted over. */
export function drawLm3dGround(ctx, id, x, y, sx, sy, rect) { const e = LM3D[id]; if (e) blit(ctx, e, x, y, sx, sy, true, rect); }

/** 3D objects image of ensemble `id` (from its front tile, or after the tile loop when the front tile is off-screen). */
export function drawLm3dObjects(ctx, id, x, y, sx, sy, rect) { const e = LM3D[id]; if (e) blit(ctx, e, x, y, sx, sy, false, rect); }

/** True when a landmark id is a baked 3D ensemble. */
export function isLm3d(id) { return !!LM3D[id]; }

/** Preload all level images (call once when a Moscow game starts). */
export function preloadLm3d() { for (const e of Object.values(LM3D)) for (const lv of e.levels) { levelImage(lv); if (lv.g) levelImage(lv.g); } }

/**
 * Draw ensemble `id` from its front tile (x,y) whose world-screen centre is (sx,sy) (includes terrain height).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawLm3d(ctx, id, x, y, sx, sy) { const e = LM3D[id]; if (!e) return false; blit(ctx, e, x, y, sx, sy, false, null); return true; }
