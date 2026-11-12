/**
 * Baked OSM 3D landmark ensembles (tools/lm3d/bake.js -> js/config/landmarks3d.js + assets/landmarks/*.png).
 * The whole ensemble is drawn once, from its front tile, at its true geographic position: level images are
 * rendered at zoom 1/2/4 and the smallest level >= the current canvas scale is used (crisp pixels when equal).
 */
import { LM3D } from '../../simulation/scenarios/moscowRegistry.js';
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
  const dx = sx - (x - y) * HALF_W, dy = sy - (x + y) * HALF_H; // terrain height offset of the front tile
  const l0 = ground ? e.levels[0].g && { ...e.levels[0].g, z: e.levels[0].z } : e.levels[0];
  // cull before picking a level so off-screen ensembles never start loading their (large) zoom-4 images
  if (rect && l0) { const X0 = l0.wx + dx, Y0 = l0.wy + dy; if (X0 - 8 > rect.x1 || Y0 > rect.y1 + 148 || X0 + l0.w / l0.z + 8 < rect.x0 || Y0 + l0.h / l0.z + 8 < rect.y0) return; }
  const p = pickLevel(e, scale, ground); if (!p) return;
  const { im, use } = p;
  const X = use.wx + dx, Y = use.wy + dy, W = use.w / use.z, H = use.h / use.z;
  if (rect && (X > rect.x1 || Y > rect.y1 + 140 || X + W < rect.x0 || Y + H < rect.y0)) return;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = scale < use.z - 1e-3;
  // PF2: draw only the part of the big level image that is on screen (9-arg form). Source px per world px
  // is use.z; the clip keeps a 4 px guard band so the edge samples match the full draw.
  if (rect && im.naturalWidth) {
    const cx0 = Math.max(X, rect.x0 - 4), cx1 = Math.min(X + W, rect.x1 + 4);
    const cy0 = Math.max(Y, rect.y0 - 4), cy1 = Math.min(Y + H, rect.y1 + 4);
    if (cx1 <= cx0 || cy1 <= cy0) { ctx.imageSmoothingEnabled = prev; return; }
    const k = im.naturalWidth / W;
    const sx0 = (cx0 - X) * k, sy0 = (cy0 - Y) * k;
    const sw = (cx1 - cx0) * k, sh = (cy1 - cy0) * k;
    ctx.drawImage(im, sx0, sy0, sw, sh, cx0, cy0, cx1 - cx0, cy1 - cy0);
  } else ctx.drawImage(im, X, Y, W, H);
  ctx.imageSmoothingEnabled = prev;
}

/**
 * Front tiles of the ensembles stamped on this map: [{id,x,y}] (rescanned every 240 calls; tiles rarely change).
 * Overlay-only ensembles (whose footprint is too congested to claim) are included so off-screen sprites can be
 * painted after the diagonal pass.
 */
export function lm3dFronts(map) {
  const c = overlayFronts(map);
  return c.list;
}

const frontCache = new WeakMap();
const overlayCache = new WeakMap();
function overlayFronts(map) {
  let c = frontCache.get(map);
  if (!c || ++c.n > 240) {
    const list = [];
    for (let i = 0; i < map.tiles.length; i++) { const b = map.tiles[i].building; if (b && b.lm3d && b.front && LM3D[b.id]) list.push({ id: b.id, x: i % map.width, y: Math.floor(i / map.width) }); }
    if (Array.isArray(map.lm3dOverlays)) for (const o of map.lm3dOverlays) if (o && LM3D[o.id] && Number.isInteger(o.x) && Number.isInteger(o.y)) list.push({ id: o.id, x: o.x, y: o.y, overlay: true });
    c = { list, n: 0 }; frontCache.set(map, c);
  }
  return c;
}

/** Overlay sprites grouped by tile so they can be drawn in painter's order. */
export function lm3dOverlayBuckets(map) {
  let c = overlayCache.get(map);
  if (!c || ++c.n > 240) {
    const buckets = new Map();
    if (Array.isArray(map.lm3dOverlays)) for (const o of map.lm3dOverlays) {
      if (!o || !LM3D[o.id] || !Number.isInteger(o.x) || !Number.isInteger(o.y)) continue;
      if (o.x < 0 || o.y < 0 || o.x >= map.width || o.y >= map.height) continue; // off-map: never drawn (and must not alias a real tile key)
      const key = o.y * map.width + o.x; // numeric tile key (no per-frame string keys)
      const bucket = buckets.get(key); if (bucket) bucket.push(o); else buckets.set(key, [o]);
    }
    c = { buckets, n: 0 }; overlayCache.set(map, c);
  }
  return c.buckets;
}

/** Ground image (plazas, parks, paths) of ensemble `id`; drawn before all objects so nothing tall is painted over. */
export function drawLm3dGround(ctx, id, x, y, sx, sy, rect) { const e = LM3D[id]; if (e) blit(ctx, e, x, y, sx, sy, true, rect); }

/** 3D objects image of ensemble `id` (from its front tile, or after the tile loop when the front tile is off-screen). */
export function drawLm3dObjects(ctx, id, x, y, sx, sy, rect) { const e = LM3D[id]; if (e) blit(ctx, e, x, y, sx, sy, false, rect); }

/** True when a landmark id is a baked 3D ensemble. */

/** Preload all level images (call once when a Moscow game starts). */

/**
 * Draw ensemble `id` from its front tile (x,y) whose world-screen centre is (sx,sy) (includes terrain height).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawLm3d(ctx, id, x, y, sx, sy) { const e = LM3D[id]; if (!e) return false; blit(ctx, e, x, y, sx, sy, false, null); return true; }
