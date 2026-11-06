/**
 * Sub-tropical climate (opt-in 'tropic', pack/tropic.js): OpenGFX desert ground from the TROPIC pack
 * (assets/opengfx/tropic, tools/ogfx/extract_tropic.js). Ported from OpenTTD clear_cmd.cpp (DrawClearLandTile desert:
 * _clear_land_sprites_snow_desert[density] + SlopeToSpriteOffset) and tree_land.h / tree_map.h (rainforest rows 80..107,
 * cactus 108..111, sub-tropical 112..127; the tree rows are already in the base atlas). GPL-2.0 (OpenTTD).
 */
import { blitPackFrom } from './draw.js';
import { HALF_H, HEIGHT_STEP as S, TILE_W, TILE_H } from '../iso.js';
import { slopeBits } from './slope.js';
import { drawSloped } from '../slope.js';
import { makeSprite } from '../sprites/canvas.js';

/** Desert ground group bases, density 0..3 (OpenTTD SPR_FLAT_{1,2,3}_QUART_DESERT_TILE, full): 19 sprites each. */
const DESERT_BASE = [312, 331, 350, 369];
/** OpenTTD _slope_to_sprite_offset (landscape.cpp), indexed by slope bits (W=1,S=2,E=4,N=8). */
const SLOPE_OFFSET = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0];

/** Tropic pack (set by pack/index.js) and the sub-tropical flag of the attached game (set by the renderer). */
export const tropicState = { pack: null, on: false, top: [], map: null };

/** Attach the climate flag and the game map (zones are read from it). Resets the cached desert tops. */
export function setTropicClimate(on, map = null) {
  tropicState.on = !!on;
  tropicState.map = map;
  tropicState.top = [];
}

/** Active when the game is sub-tropical, the tropic pack is loaded and the OpenGFX toggle is on. */
export function tropicActive(packEnabled) { return !!(tropicState.on && tropicState.pack && packEnabled); }

/**
 * Draw the desert ground of a tile. Spread <= 1 uses the exact OpenGFX slope sprite; steeper tiles are drawn as planes
 * with the flat desert sprite (the same rule as the snow ground).
 * @returns {boolean} false when the tropic pack lacks the sprite
 */
export function drawTropicDesert(ctx, sx, sy, c, hash) {
  const pack = tropicState.pack;
  if (!pack) return false;
  const min = Math.min(c[0], c[1], c[2], c[3]);
  const max = Math.max(c[0], c[1], c[2], c[3]);
  const density = hash % 4;
  if (max - min > 1) {
    const top = desertTop(density);
    if (!top) return false;
    drawSloped(ctx, top, sx, sy, c);
    return true;
  }
  const id = String(DESERT_BASE[density] + SLOPE_OFFSET[slopeBits(c)]);
  if (!pack.sprites[id]) return false;
  return blitPackFrom(pack, ctx, id, sx, sy - HALF_H - S * min);
}

/** Flat desert sprite (anchored at the tile centre), cached per density. */
function desertTop(density) {
  if (tropicState.top[density] !== undefined) return tropicState.top[density];
  const pack = tropicState.pack;
  const s = pack && pack.sprites[String(DESERT_BASE[density])];
  if (!s) return null;
  const [ai, x0, y0, w0, h0] = s;
  const t = makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pack.atlases[ai], x0, y0, w0, h0, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
  });
  tropicState.top[density] = t;
  return t;
}

/** Tree layout rows of OpenTTD tree_land.h, 4 per tree slot (base atlas ids; the grown stage is added by the caller). */
/** Rainforest (TREE_RAINFOREST = 0x14, rows 80..107, 7 types: 28 rows / 4). */
export const TREE_LAYOUT_RAINFOREST = [
  [1835, 1842, 1835, 1849],
  [1835, 1863, 1877, 1835],
  [1835, 1835, 1898, 1926],
  [1835, 1870, 1835, 1835],
  [1842, 1842, 1835, 1849],
  [1842, 1863, 1842, 1842],
  [1842, 1842, 1877, 1940],
  [1842, 1870, 1842, 1933],
  [1863, 1842, 1863, 1856],
  [1863, 1863, 1842, 1898],
  [1863, 1835, 1877, 1863],
  [1863, 1926, 1842, 1863],
  [1870, 1870, 1835, 1940],
  [1870, 1877, 1842, 1870],
  [1870, 1835, 1926, 1863],
  [1870, 1870, 1842, 1940],
  [1898, 1898, 1870, 1870],
  [1898, 1940, 1842, 1898],
  [1898, 1842, 1926, 1898],
  [1898, 1926, 1842, 1933],
  [1933, 1933, 1870, 1940],
  [1933, 1842, 1849, 1863],
  [1933, 1842, 1926, 1898],
  [1933, 1926, 1933, 1940],
  [1926, 1926, 1856, 1842],
  [1926, 1926, 1835, 1842],
  [1926, 1842, 1926, 1926],
  [1926, 1926, 1933, 1940],
];
/** Sub-tropical (TREE_SUB_TROPICAL = 0x1C, rows 112..127, 4 types). */
export const TREE_LAYOUT_SUB_TROPICAL = [
  [1884, 1821, 1884, 1828],
  [1884, 1835, 1884, 1891],
  [1884, 1884, 1905, 1821],
  [1884, 1905, 1884, 1884],
  [1905, 1905, 1884, 1821],
  [1905, 1863, 1884, 1905],
  [1905, 1884, 1905, 1828],
  [1905, 1905, 1884, 1891],
  [1821, 1821, 1905, 1828],
  [1821, 1870, 1891, 1821],
  [1821, 1828, 1940, 1821],
  [1821, 1821, 1884, 1933],
  [1940, 1828, 1884, 1940],
  [1940, 1940, 1884, 1821],
  [1940, 1828, 1940, 1821],
  [1940, 1940, 1905, 1933],
];
/** Cactus (TREE_CACTUS = 0x1B, rows 108..111, 1 type). */
export const TREE_LAYOUT_CACTUS = [
  [1912, 1912, 1919, 1912],
  [1912, 1919, 1912, 1919],
  [1912, 1919, 1919, 1912],
  [1912, 1912, 1912, 1919],
];
