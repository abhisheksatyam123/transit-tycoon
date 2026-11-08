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

let bxBuf = new Float32Array(64);
const BBOX_M = 0.55; // > sqrt(0.27): span bbox margin for paint()
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
let _netTexReady = false, _netTexPack = undefined;
export function netTexReady() {
  if (packState.pack === _netTexPack) return _netTexReady;
  _netTexPack = packState.pack;
  _netTexReady = !!(packState.pack && spritePixels(RAIL_X) && spritePixels(roadSprite(5, true)) && spritePixels(roadSprite(5, false)));
  return _netTexReady;
}


/** Procedural (non-OpenGFX) straight road/rail sources in the same 64x31 straight-sprite layout. */
const procCache = new Map();
/** Procedural highway strip: full-tile-width dark asphalt with a grass median + dashes. */
function procHwy() {
  if (procCache.has('roadH')) return procCache.get('roadH');
  const w = 64, h = 31, d = new Uint8ClampedArray(w * h * 4);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const a = (px + 0.5 - w / 2) / (w / 2), b = (py + 0.5 - h / 2) / (h / 2);
    const uu = (a + b) / 2, vv = (b - a) / 2, au = Math.abs(uu);
    const g = (rnd() - 0.5) * 5;
    let c = [62 + g, 65 + g, 70 + g];
    let f = ((vv + 0.5) * 4) % 1; if (f < 0) f += 1;
    if (au < 0.05) c = [88 + g, 140 + g, 52 + g];          // median grass
    else if (au < 0.085) c = [150, 150, 144];                 // median kerb
    else if (au > 0.455 && au < 0.49) c = [236, 236, 228];    // solid outer edge line
    else if (au > 0.2 && au < 0.225 && f < 0.5) c = [236, 236, 228]; // dashed lane divider
    const o = (py * w + px) * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  const r = { w, h, d };
  procCache.set('roadH', r);
  return r;
}
function procSprite(kind, paved, hwy) {
  if (kind === 'road' && hwy) return procHwy();
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

/** Per-segment data of an edge (built once; edges are immutable): x0,y0,dx,dy,ll,minx,maxx,miny,maxy. */
const segCache = new WeakMap();
function segData(e) {
  let G = segCache.get(e);
  if (G) return G;
  const P = e.pts, n = P.length / 2 - 1;
  G = new Float64Array(Math.max(0, n) * 9);
  for (let k = 0; k < n; k++) {
    const x0 = P[2 * k], y0 = P[2 * k + 1], x1 = P[2 * k + 2], y1 = P[2 * k + 3];
    const dx = x1 - x0, dy = y1 - y0, o = 9 * k;
    G[o] = x0; G[o + 1] = y0; G[o + 2] = dx; G[o + 3] = dy; G[o + 4] = dx * dx + dy * dy || 1e-9;
    G[o + 5] = Math.min(x0, x1); G[o + 6] = Math.max(x0, x1);
    G[o + 7] = Math.min(y0, y1); G[o + 8] = Math.max(y0, y1);
  }
  segCache.set(e, G);
  return G;
}

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
  const ef_ = new Map(); // per-edge paved/hwy flags (constant within one paint call)
  // per-span bounding boxes (tile units): a span whose box is > BBOX_M away from the pixel has every
  // centreline point farther than the 0.27 (squared, ~0.52) cut-off, so skipping it cannot change the result
  const nb = list.length;
  if (bxBuf.length < nb * 4) bxBuf = new Float32Array(nb * 8);
  const bx = bxBuf;
  for (let q = 0; q < nb; q++) {
    const sp = list[q], P = net.edges[sp.e].pts;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = sp.i0; k <= sp.i1; k++) {
      const px = P[2 * k], py = P[2 * k + 1];
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    bx[4 * q] = x0 - BBOX_M; bx[4 * q + 1] = x1 + BBOX_M; bx[4 * q + 2] = y0 - BBOX_M; bx[4 * q + 3] = y1 + BBOX_M;
  }
  for (let py = 0; py < H; py++) {
    const b = (py + 0.5 - H / 2) / (H / 2);
    for (let px = 0; px < W; px++) {
      const a = (px + 0.5 - W / 2) / (W / 2);
      if (Math.abs(a) + Math.abs(b) > 1) continue;
      const u = x + (a + b) / 2, v = y + (b - a) / 2;
      // nearest centreline point over the spans
      let best = 1e9, bd = 0, bt = 0, be = null;
      for (let q = 0; q < nb; q++) {
        if (u < bx[4 * q] || u > bx[4 * q + 1] || v < bx[4 * q + 2] || v > bx[4 * q + 3]) continue;
        const sp = list[q];
        const e = net.edges[sp.e], L = e.len, G = segData(e);
        for (let k = sp.i0; k < sp.i1; k++) {
          const o = 9 * k;
          // skip a segment whose box is clearly farther than the current best: its nearest point cannot
          // update best (the margin keeps this exact against rounding), so the result is unchanged
          const gx = u < G[o + 5] ? G[o + 5] - u : u > G[o + 6] ? u - G[o + 6] : 0;
          const gy = v < G[o + 7] ? G[o + 7] - v : v > G[o + 8] ? v - G[o + 8] : 0;
          if (gx * gx + gy * gy > best * (1 + 1e-9) + 1e-12) continue;
          const x0 = G[o], y0 = G[o + 1], dx = G[o + 2], dy = G[o + 3], ll = G[o + 4];
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
      let ef = ef_.get(be);
      if (ef === undefined) { ef = (kind === 'road' ? (isPaved(map, be) ? 1 : 0) | (isHwy(map, be) ? 2 : 0) : 0); ef_.set(be, ef); }
      const paved = kind === 'road' && (ef & 1) !== 0;
      const hwy = kind === 'road' && (ef & 2) !== 0;
      // highway tiles sample the procedural highway strip even in OpenGFX mode (no matching pack sprite)
  const src = hwy ? procHwy()
    : (ogfx ? spritePixels(kind === 'rail' ? RAIL_X : roadSprite(5, paved)) : procSprite(kind, paved));
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
      if (kind === 'road' && hwy && ad > 0.52 && !onWater) { any = true; continue; }
      // local-road centre dashes are kept mid-tile only: near tile corners they wrapped into rings
      if (kind === 'road' && !hwy && ad < 0.03) {
        let tq = bt % 1; if (tq < 0) tq += 1;
        if (tq < 0.2 || tq > 0.8) {
          const o = (py * W + px) * 4;
          out[o] = 62; out[o + 1] = 65; out[o + 2] = 70; out[o + 3] = 255; any = true;
          continue;
        }
      }
      if (kind === 'road' && paved && !hwy) {
        if (ad > 0.5) continue;
        if (ad > 0.3) { const q = (ad - 0.3) % 0.28; d = Math.sign(d) * (0.3 + (q < 0.14 ? q : 0.28 - q)); }
      } else if (ad > 0.45 && !hwy) continue;
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

/**
 * True when the edge overlays a highway tile (tile.highway on + road).
 */
function isHwy(map, e) {
  const ti = e.tiles.length ? e.tiles[0] : e.a;
  const t = ti >= 0 ? map.tiles[ti] : null;
  return !!t && t.highway === 1 && !!t.road;
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
/**
 * Memo of netTileSprite results (W7d). Chunks are rebuilt on zoom / lowRes / invalidate and the same tile
 * was painted up to 3x in the first 10 s of Moscow. Keyed on the road+rail net objects: invalidateNet()
 * (called by every ground invalidation) replaces them, which drops the memo. Holds the sprite itself.
 */
const memo = new WeakMap(); // road net -> { rail: railNet, m: Map<key, {sig, s}> }

export function netTileSprite(map, x, y, ogfx = true) {
  const rn = getNet(map, 'road'), gn = getNet(map, 'rail');
  let mm = memo.get(rn);
  if (!mm || mm.rail !== gn) { mm = { rail: gn, m: new Map() }; memo.set(rn, mm); }
  const key = (y * map.width + x) * 2 + (ogfx ? 1 : 0);
  // tile fields paint() reads directly; they can change without a net rebuild (owner, terrain from sim)
  const t = map.tiles[y * map.width + x];
  let sig = (t.road | 0) + ',' + (t.rail | 0) + ',' + (t.tunnel | 0) + ',' + t.terrain;
  // isPaved/isHwy read the attributes of the edge's first tile: every edge listed for this tile
  for (const kind of ['road', 'rail']) {
    const list = getNet(map, kind).byTile[y * map.width + x];
    if (!list) continue;
    for (const sp of list) {
      const e = getNet(map, kind).edges[sp.e];
      const ti = e.tiles.length ? e.tiles[0] : e.a;
      const et = ti >= 0 ? map.tiles[ti] : null;
      sig += '|' + ti + ':' + (et ? (et.avenue | 0) + ',' + (et.highway | 0) + ',' + (et.road | 0) + ',' + et.owner : '-');
    }
  }
  const hit = mm.m.get(key);
  if (hit && hit.sig === sig) return hit.s;
  const s = netTileSprite0(map, x, y, ogfx);
  mm.m.set(key, { sig, s });
  return s;
}

function netTileSprite0(map, x, y, ogfx) {
  const i = y * map.width + x;
  if (!getNet(map, 'road').byTile[i] && !getNet(map, 'rail').byTile[i]) return null;
  const W = 64, H = 32;
  if (!tmp) { tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; tmpCtx = tmp.getContext('2d'); img = tmpCtx.createImageData(W, H); }
  img.data.fill(0);
  const a = paint(img.data, W, H, map, 'road', x, y, ogfx);
  const b = paint(img.data, W, H, map, 'rail', x, y, ogfx);
  if (!a && !b) return null;
  tmpCtx.putImageData(img, 0, 0);
  const sp = makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
  });
  sp.pixel = true; // nearest-scaled content; skip mip generation in blit/drawSloped
  return sp;
}
