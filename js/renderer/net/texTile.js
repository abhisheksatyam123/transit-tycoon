/**
 * OpenGFX-textured net tiles: for one map tile, every pixel near a smooth road/rail centreline (net/index.js)
 * is sampled from the OpenGFX STRAIGHT road/rail sprite at (cross distance, arc length), i.e. the straight
 * sprite is bent along the Locomotion-style curve. Result: a tile-top sprite (transparent where no ribbon)
 * drawn with drawSloped so it follows the terrain. Ground chunks are cached, so this runs once per chunk build.
 */
import { makeSprite } from '../sprites/canvas.js';
import { TILE_W, TILE_H } from '../iso.js';
import { packState } from '../pack/state.js';
import { roadSprite } from '../pack/road.js';
import { getNet } from './index.js';

const RAIL_X = 1012; // OpenGFX straight rail along our y (N|S)
const pixCache = new Map();
let tmp = null, tmpCtx = null, img = null;

function spritePixels(id) {
  if (pixCache.has(id)) return pixCache.get(id);
  const pack = packState.pack;
  const s = pack && pack.sprites[id];
  let r = null;
  if (s) {
    const [ai, x, y, w, h] = s;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(pack.atlases[ai], x, y, w, h, 0, 0, w, h);
    r = { w, h, d: g.getImageData(0, 0, w, h).data };
  }
  pixCache.set(id, r);
  return r;
}

/** Drop sampled sprites (pack reload). */
export function clearNetTex() { pixCache.clear(); }

/** Whether OpenGFX sprites needed for textured net tiles are available. */
export function netTexReady() {
  return !!(packState.pack && spritePixels(RAIL_X) && spritePixels(roadSprite(5, true)) && spritePixels(roadSprite(5, false)));
}


/** Procedural (non-OpenGFX) straight road/rail sources in the same 64x31 straight-sprite layout. */
const procCache = new Map();
function procSprite(kind, paved) {
  const key = kind + (paved ? 'p' : 'g');
  if (procCache.has(key)) return procCache.get(key);
  const w = 64, h = 31, d = new Uint8ClampedArray(w * h * 4);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const a = (px + 0.5 - w / 2) / (w / 2), b = (py + 0.5 - h / 2) / (h / 2);
    const uu = (a + b) / 2, vv = (b - a) / 2, au = Math.abs(uu);
    let c = [70, 140, 52];
    const g = (rnd() - 0.5) * 5;
    if (kind === 'road') {
      let f = ((vv + 0.5) * 4) % 1; if (f < 0) f += 1;
      if (au < 0.25) c = au < 0.022 && f < 0.5 ? [236, 236, 228] : [62 + g, 65 + g, 70 + g];
      else if (au < 0.29) c = [188, 186, 178];
      else if (paved) c = [176 + g, 172 + g, 164 + g];
    } else {
      let f = ((vv + 0.5) * 8) % 1; if (f < 0) f += 1;
      if (au < 0.22) c = [138 + g, 129 + g, 114 + g];
      if (au < 0.17 && f < 0.42) c = [92 + g * 0.5, 70, 50];
      if (au > 0.065 && au < 0.1) c = au < 0.08 ? [214, 214, 214] : [96, 96, 100];
    }
    const o = (py * w + px) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  const r = { w, h, d };
  procCache.set(key, r);
  return r;
}

const isGreen = (r, g, b) => g > r + 12 && g > b + 8;

/**
 * Fill `out` (RGBA, W x H) with the ribbons of one kind touching tile i. Returns true if any pixel was set.
 */
function paint(out, W, H, map, kind, x, y, ogfx) {
  const net = getNet(map, kind);
  const i = y * map.width + x;
  const list = net.byTile[i];
  if (!list) return false;
  const t = map.tiles[i];
  const bits = kind === 'rail' ? (t.tunnel ? 0 : t.rail | 0) : (t.road | 0);
  if (bits && !net.covered[i]) return false; // node tile: keeps its own sprite
  let any = false;
  for (let py = 0; py < H; py++) {
    const b = (py + 0.5 - H / 2) / (H / 2);
    for (let px = 0; px < W; px++) {
      const a = (px + 0.5 - W / 2) / (W / 2);
      if (Math.abs(a) + Math.abs(b) > 1) continue;
      const u = x + (a + b) / 2, v = y + (b - a) / 2;
      // nearest centreline point over the spans
      let best = 1e9, bd = 0, bt = 0, be = null;
      for (const sp of list) {
        const e = net.edges[sp.e], P = e.pts, L = e.len;
        for (let k = sp.i0; k < sp.i1; k++) {
          const x0 = P[2 * k], y0 = P[2 * k + 1], dx = P[2 * k + 2] - x0, dy = P[2 * k + 3] - y0;
          const ll = dx * dx + dy * dy || 1e-9;
          let s = ((u - x0) * dx + (v - y0) * dy) / ll;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const qx = x0 + dx * s - u, qy = y0 + dy * s - v;
          const dist = qx * qx + qy * qy;
          if (dist < best) {
            best = dist; be = e;
            const sl = Math.sqrt(ll);
            bd = ((u - x0) * dy - (v - y0) * dx) / sl; // signed cross distance
            bt = L[k] + s * sl;
          }
        }
      }
      if (!be || best > 0.27) continue; // |d| > ~0.52
      const paved = kind === 'road' && isPaved(map, be);
      const src = ogfx ? spritePixels(kind === 'rail' ? RAIL_X : roadSprite(5, paved)) : procSprite(kind, paved);
      if (!src) continue;
      let d = bd;
      const ad = Math.abs(d);
      const onWater = map.tiles[i].terrain === 'water';
      if (onWater) { // bridge deck: road/track surface + dark parapets, water beyond
        if (ad > 0.4) continue;
        if (ad > 0.32) {
          const o = (py * W + px) * 4, sh = ad > 0.37 ? 52 : 92;
          out[o] = sh; out[o + 1] = sh; out[o + 2] = sh + 4; out[o + 3] = 255; any = true;
          continue;
        }
      }
      if (kind === 'road' && paved) {
        if (ad > 0.5) continue;
        if (ad > 0.3) { const q = (ad - 0.3) % 0.28; d = Math.sign(d) * (0.3 + (q < 0.14 ? q : 0.28 - q)); }
      } else if (ad > 0.45) continue;
      let tv = bt % 1; if (tv < 0) tv += 1;
      const uu = d, vv = tv - 0.5;
      const sx = Math.round((uu - vv) * (src.w / 2) + src.w / 2 - 0.5);
      const sy = Math.round((uu + vv) * (src.h / 2) + src.h / 2 - 0.5);
      const si = (Math.max(0, Math.min(src.h - 1, sy)) * src.w + Math.max(0, Math.min(src.w - 1, sx))) * 4;
      const r = src.d[si], g = src.d[si + 1], bb = src.d[si + 2], al = src.d[si + 3];
      if (!al) continue;
      if (isGreen(r, g, bb)) { // grass verge / outside: terrain shows through (bridge: deck colour)
        if (!onWater) continue;
        const o = (py * W + px) * 4;
        out[o] = 96; out[o + 1] = 90; out[o + 2] = 84; out[o + 3] = 255; any = true;
        continue;
      }
      const o = (py * W + px) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = bb; out[o + 3] = 255;
      any = true;
    }
  }
  return any;
}

function isPaved(map, e) {
  const ti = e.tiles.length ? e.tiles[0] : e.a;
  const t = ti >= 0 ? map.tiles[ti] : null;
  return !!t && ((t.avenue | 0) > 0 || t.owner === 'town');
}

/**
 * Textured tile-top sprite for tile (x,y) (road then rail), or null when nothing to draw.
 * @returns {any|null} sprite for drawSloped
 */
export function netTileSprite(map, x, y, ogfx = true) {
  const i = y * map.width + x;
  if (!getNet(map, 'road').byTile[i] && !getNet(map, 'rail').byTile[i]) return null;
  const W = 64, H = 32;
  if (!tmp) { tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmpCtx = tmp.getContext('2d'); img = tmpCtx.createImageData(W, H); }
  img.data.fill(0);
  const a = paint(img.data, W, H, map, 'road', x, y, ogfx);
  const b = paint(img.data, W, H, map, 'rail', x, y, ogfx);
  if (!a && !b) return null;
  tmpCtx.putImageData(img, 0, 0);
  return makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
  });
}
