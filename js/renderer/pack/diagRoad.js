/**
 * OpenGFX-textured diagonal road piece for staircase corners (render-only).
 * A road corner that is part of a 1:1 staircase is drawn as a straight 45° band through its two edge
 * midpoints; consecutive staircase tiles share the midpoints, so the bands join into one straight
 * diagonal road. The band is textured by resampling the OpenGFX straight road sprite (asphalt, kerbs,
 * centre dashes, pavement) rotated into the diagonal; grass outside the band comes from the tile ground.
 */
import { makeSprite } from '../sprites/canvas.js';
import { TILE_W, TILE_H } from '../iso.js';
import { packState } from './state.js';
import { roadSprite } from './road.js';
import { EDGE, CORNER } from '../sprites/roadDiag.js';

const cache = new Map();
const R2 = Math.SQRT1_2;
/** Along-line period of one staircase step (tile units): neighbour centres project 1/sqrt(2) apart. */
const PERIOD = R2;

/** RGBA pixels of an atlas sprite (w x h), or null. */
function spritePixels(id) {
  const pack = packState.pack;
  const s = pack && pack.sprites[id];
  if (!s) return null;
  const [ai, x, y, w, h] = s;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(pack.atlases[ai], x, y, w, h, 0, 0, w, h);
  return { w, h, d: g.getImageData(0, 0, w, h).data };
}

function sample(img, px, py) {
  const x = Math.max(0, Math.min(img.w - 1, Math.round(px)));
  const y = Math.max(0, Math.min(img.h - 1, Math.round(py)));
  const i = (y * img.w + x) * 4;
  return [img.d[i], img.d[i + 1], img.d[i + 2], img.d[i + 3]];
}

/**
 * Tile-top sprite (same shape as pack/ground.js packTop) for a diagonal staircase road corner.
 * @param {number} mask 2-bit corner road mask (3, 6, 12, 9)
 * @param {boolean} paved town/avenue pavement
 * @param {number} groundId flat ground sprite of the tile (grass 3981 ...)
 * @returns {any|null} sprite for drawSloped, or null when the pack lacks the sprites
 */
export function diagRoadTop(mask, paved, groundId) {
  const key = `${mask}:${paved ? 1 : 0}:${groundId}`;
  if (cache.has(key)) return cache.get(key);
  const pair = CORNER[mask];
  const road = pair && spritePixels(roadSprite(5, paved)); // straight N|S road: runs along v
  const ground = spritePixels(groundId);
  if (!road || !ground) { cache.set(key, null); return null; }
  const [m1, m2] = [EDGE[pair[0]], EDGE[pair[1]]];
  // canonical direction so neighbouring staircase tiles agree: lines u+v=c -> (1,-1), u-v=c -> (1,1)
  const plus = Math.abs((m2[0] + m2[1]) - (m1[0] + m1[1])) < 1e-6;
  const dir = plus ? [R2, -R2] : [R2, R2];
  const nrm = plus ? [R2, R2] : [R2, -R2];
  const W = ground.w, H = ground.h;
  const out = new ImageData(W, H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const gi = (py * W + px) * 4;
      if (ground.d[gi + 3] === 0) continue; // outside the tile diamond
      // screen -> tile space (origin tile centre): sx=(u-v)*32, sy=(u+v)*16
      const a = (px + 0.5 - W / 2) / (TILE_W / 2), b = (py + 0.5 - H / 2) / (TILE_H / 2);
      const u = (a + b) / 2, v = (b - a) / 2;
      const d = (u - m1[0]) * nrm[0] + (v - m1[1]) * nrm[1];
      const t = u * dir[0] + v * dir[1];
      let tv = (t / PERIOD) % 1; if (tv < 0) tv += 1;
      // beyond the kerb (|d| > 0.3) fold into the pavement strip (0.30..0.44) with a triangle wave:
      // keeps the grain, avoids smearing the sprite's outer outline into streaks
      const ad = Math.abs(d);
      let fold = ad;
      if (ad > 0.3) { const q = (ad - 0.3) % 0.28; fold = 0.3 + (q < 0.14 ? q : 0.28 - q); }
      const uu = Math.sign(d) * fold, vv = tv - 0.5;
      const rgba = sample(road, (uu - vv) * (TILE_W / 2) + road.w / 2 - 0.5, (uu + vv) * (TILE_H / 2) + road.h / 2 - 0.5);
      const green = rgba[1] > rgba[0] + 12 && rgba[1] > rgba[2] + 12;
      const src = (!paved && green) || rgba[3] === 0 ? [ground.d[gi], ground.d[gi + 1], ground.d[gi + 2], ground.d[gi + 3]] : rgba;
      out.data[gi] = src[0]; out.data[gi + 1] = src[1]; out.data[gi + 2] = src[2]; out.data[gi + 3] = src[3];
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = W; tmp.height = H;
  tmp.getContext('2d').putImageData(out, 0, 0);
  const s = makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
  });
  cache.set(key, s);
  return s;
}

/** Drop cached pieces (pack reload). */
export function clearDiagRoads() { cache.clear(); }
