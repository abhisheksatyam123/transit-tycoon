/**
 * OpenGFX ground sprites for OpenTTD-style tiles (no warping).
 * Ported from OpenTTD src/clear_land.h + landscape.cpp (GPL-2.0): flat base sprite per ground type,
 * slope sprite = base + SlopeToSpriteOffset. Our slope bits are OpenTTD's (W=1,S=2,E=4,N=8).
 */
import { blitPack } from './draw.js';
import { HALF_H, HEIGHT_STEP as S } from '../iso.js';
import { slopeBits } from './slope.js';
import { packState } from './state.js';

/**
 * Ground base per terrain kind (clear_land.h). Temperate only: grass uses the full-grass base
 * (SPR_FLAT_GRASS_TILE 3981) for nearly all tiles and rough land (SPR_FLAT_ROUGH_LAND 4000) for a
 * deterministic ~3%. Rock uses SPR_FLAT_ROCKY_LAND_1 (4023). Snow/desert have no temperate sprite
 * and fall back to rough land.
 */
const ROUGH_BASE = 4000;
const GRASS_BASE = 3981;
const ROCK_BASE = 4023;

/**
 * Sprite id for a tile's ground (flat or sloped). Slope sprite = base + SlopeToSpriteOffset
 * (bits W=1,S=2,E=4,N=8 relative to the minimum corner; landscape.cpp).
 * @param {string} kind terrain kind
 * @param {number} hash tile hash (deterministic)
 * @param {number[]} c corner heights [hN,hE,hS,hW]
 * @returns {number}
 */
function groundSpriteId(kind, hash, c) {
  let base;
  switch (kind) {
    case 'grass': case 'forest': base = (hash % 33) === 0 ? ROUGH_BASE : GRASS_BASE; break;
    case 'rock': base = ROCK_BASE; break;
    case 'water': return 4061; // SPR_FLAT_WATER_TILE (water corners are all at sea level, so flat)
    case 'desert': case 'snow': base = ROUGH_BASE; break;
    default: return -1;
  }
  return base + slopeBits(c);
}

/**
 * Draw OpenGFX ground for a tile. Anchor = tile top corner at the MIN corner height
 * (OpenTTD draws at TileHeight = min), so the flat base sprite sits on the lowest corner.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} kind
 * @param {number} hash
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y (height 0)
 * @param {number[]} c corner heights
 * @returns {boolean} false if the pack lacks this ground (caller falls back)
 */
export function drawOgfxGround(ctx, kind, hash, sx, sy, c) {
  if (!packState.pack) return false;
  const id = groundSpriteId(kind, hash, c);
  if (id < 0 || !packState.pack.sprites[id]) return false;
  const min = Math.min(c[0], c[1], c[2], c[3]);
  // OpenGFX has slope sprites only for corners one level apart. A two-level spread would be drawn
  // one level short, leaving a black wedge at the shared edge, so let the caller draw the true
  // planes (drawSloped) instead.
  if (Math.max(c[0], c[1], c[2], c[3]) - min > 1) return false;
  blitPack(ctx, id, sx, sy - HALF_H - S * min);
  return true;
}

/* ---- compatibility exports used by pack/transport.js (flat tops via packTop) ---- */
import { makeSprite } from '../sprites/canvas.js';
import { TILE_W, TILE_H } from '../iso.js';
const tops = new Map();
/** Tile-top sprite composed of OpenGFX sprites (first = ground, rest overlays), anchored at tile centre. */
export function packTop(ids) {
  const key = ids.join(',');
  let t = tops.get(key);
  if (t !== undefined) return t;
  const pack = packState.pack;
  if (!pack || ids.some((id) => !pack.sprites[id])) { tops.set(key, null); return null; }
  t = makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    const [ai0, x0, y0, w0, h0] = pack.sprites[ids[0]];
    ctx.drawImage(pack.atlases[ai0], x0, y0, w0, h0, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
    const sy = TILE_H / h0;
    for (let i = 1; i < ids.length; i++) {
      const [ai, x, y, w, h, xo, yo] = pack.sprites[ids[i]];
      ctx.drawImage(pack.atlases[ai], x, y, w, h, xo - 1, -TILE_H / 2 + yo * sy, w, h * sy);
    }
  });
  tops.set(key, t);
  return t;
}
/** Drop cached tops (pack reload). */
export function clearPackTops() { tops.clear(); }
/** Flat OpenGFX ground sprite for a terrain kind, or -1. */
export function flatGroundId(kind) {
  switch (kind) {
    case 'grass': case 'forest': return 3981;
    case 'desert': return 3924;
    case 'rock': return 4023;
    default: return -1;
  }
}

