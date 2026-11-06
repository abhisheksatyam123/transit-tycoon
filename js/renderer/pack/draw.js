/**
 * Blit OpenGFX sprites from the pack atlases. OpenTTD anchors sprites at the tile's TOP corner:
 * the sprite is drawn at (topX + xoff, topY + yoff). Our flat tile centre (sx,sy) has its top corner
 * at (sx, sy - HALF_H), so ground sprites use top = (sx, sy - 16 - S*h).
 */
import { packState } from './state.js';

/** Company colour used when a vehicle/building has no livery. */
export const DEFAULT_CC = '#1f4fa0';

/** Cache of tinted sprite canvases: key "spriteId|colour" (small per-sprite canvases, not whole atlases). */
const tints = new Map();
/** Mask pixel data per atlas, read once. */
const maskData = new Map();

/** Mask RGBA bytes of atlas `ai` (null when the pack has no cc mask). */
function maskOf(pack, ai) {
  if (maskData.has(ai)) return maskData.get(ai);
  const mask = pack.masks && pack.masks[ai];
  const d = mask ? mask.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.width, mask.height) : null;
  maskData.set(ai, d);
  return d;
}

/** Build (once) a copy of sprite `id` whose company-colour pixels take `colour` (keeps alpha/brightness). */
function tintedSprite(pack, id, s, colour) {
  const key = id + '|' + colour;
  let c = tints.get(key);
  if (c) return c;
  const [ai, sx, sy, w, h] = s;
  c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(pack.atlases[ai], sx, sy, w, h, 0, 0, w, h);
  const m = maskOf(pack, ai);
  if (m) {
    // cc pixels: palette 198-205 is a luminance ramp; keep its brightness, change hue
    const img = g.getImageData(0, 0, w, h);
    const d = img.data, md = m.data, mw = m.width;
    const rgb = parseHex(colour);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, j = ((sy + y) * mw + sx + x) * 4;
        if (md[j] < 128 || d[i + 3] === 0) continue;
        const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
        d[i] = rgb[0] * lum; d[i + 1] = rgb[1] * lum; d[i + 2] = rgb[2] * lum;
      }
    }
    g.putImageData(img, 0, 0);
  }
  tints.set(key, c);
  return c;
}

/** @param {string} hex '#RRGGBB' @returns {number[]} */
function parseHex(hex) {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex || '') ? hex.replace('#', '') : DEFAULT_CC.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Drop cached tinted sprites and mask data (on pack reload). */
export function clearTints() { tints.clear(); maskData.clear(); }

/**
 * Draw sprite `id` with its OpenTTD origin (tile top corner) at (x, y). Pixel-art look: no smoothing.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} id OpenGFX sprite id
 * @param {number} x top-corner x (world px)
 * @param {number} y top-corner y (world px)
 * @param {string} [colour] company colour '#RRGGBB' for cc pixels
 * @returns {boolean} false if the sprite is not in the pack
 */
export function blitPack(ctx, id, x, y, colour) {
  return blitPackFrom(packState.pack, ctx, id, x, y, colour);
}

/**
 * Same as blitPack but from an explicit pack (the base pack or the EXTRA pack, pack/extra.js).
 * @param {object|null} pack loaded pack (sprites, atlases, masks)
 * @returns {boolean}
 */
export function blitPackFrom(pack, ctx, id, x, y, colour) {
  if (!pack) return false;
  const s = pack.sprites[id];
  if (!s) return false;
  const [ai, sx, sy, w, h, xo, yo, cc] = s;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (cc && colour) ctx.drawImage(tintedSprite(pack, id, s, colour), x + xo, y + yo);
  else ctx.drawImage(pack.atlases[ai], sx, sy, w, h, x + xo, y + yo, w, h);
  ctx.imageSmoothingEnabled = prev;
  return true;
}
