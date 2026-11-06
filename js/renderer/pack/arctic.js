/**
 * Arctic (sub-arctic climate) snowy ground from the ARCTIC pack (assets/opengfx/arctic, tools/ogfx/extract_arctic.js).
 * Snow density 0..3 = 1/4..full (OpenTTD _clear_land_sprites_snow_desert, clear_cmd.cpp DrawClearLandTile); the slope
 * sprite is snow.<density>.<slopeBits>. Same anchoring as pack/ground.js: the sprite sits on the lowest corner.
 * Returns false when the pack or sprite is missing, so the caller keeps the temperate ground.
 */
import { packState } from './state.js';
import { blitPackFrom } from './draw.js';
import { HALF_H, HEIGHT_STEP as S, TILE_W, TILE_H } from '../iso.js';
import { slopeBits } from './slope.js';
import { makeSprite } from '../sprites/canvas.js';
import { drawSloped } from '../slope.js';
import { snowDensity } from '../../simulation/climate.js';

/** Snow density group base ids (OpenTTD table/sprites.h SPR_FLAT_*_SNOW_DESERT_TILE) and the 19-sprite group stride. */
const SNOW_BASE = 4493, SNOW_STRIDE = 19;
/** OpenTTD _slope_to_sprite_offset (landscape.cpp), indexed by slope bits (W=1,S=2,E=4,N=8). 0 = flat / not a 1-level slope. */
const SLOPE_OFFSET = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0];

/** Sprite id of the snow ground for a density (0..3) and corner heights (OpenTTD: base + SlopeToSpriteOffset). */
export function snowSpriteId(density, c) {
  return SNOW_BASE + SNOW_STRIDE * density + SLOPE_OFFSET[slopeBits(c)];
}

/**
 * Arctic pack (set by pack/index.js), climate of the attached game (set by renderer.setGame via setArcticClimate),
 * and cached flat tops. `on` is false for temperate games, so their drawing is unchanged.
 */
export const arcticState = { pack: null, top: [], on: false, line: 5 };

/** Attach the climate of the game: arctic flag and snow line height (levels). Resets cached tops. */
export function setArcticClimate(on, line) {
  arcticState.on = !!on;
  arcticState.line = line;
  arcticState.top = [];
}

/**
 * Draw snowy ground for a tile. Spread <= 1 uses the exact OpenGFX slope sprite; steeper tiles are drawn as planes
 * with the flat snow sprite (drawSloped), as the temperate path does.
 * @returns {boolean} false when the arctic pack lacks the sprite
 */
export function drawArcticSnow(ctx, sx, sy, c) {
  const pack = arcticState.pack;
  const min = Math.min(c[0], c[1], c[2], c[3]);
  const max = Math.max(c[0], c[1], c[2], c[3]);
  const density = snowDensity(min, arcticState.line);
  if (!pack || density < 0) return false;
  if (max - min > 1) {
    const top = arcticTop(density);
    if (!top) return false;
    drawSloped(ctx, top, sx, sy, c);
    return true;
  }
  const id = String(snowSpriteId(density, c));
  if (!pack.sprites[id]) return false;
  return blitPackFrom(pack, ctx, id, sx, sy - HALF_H - S * min);
}

/** Flat snow tile sprite (anchored at the tile centre, like pack/ground.js packTop), cached per density. */
function arcticTop(density) {
  if (arcticState.top[density] !== undefined) return arcticState.top[density];
  const pack = arcticState.pack;
  const s = pack && pack.sprites[String(snowSpriteId(density, [0, 0, 0, 0]))];
  if (!s) return null; // not cached: the pack may still be loading
  let t = null;
  {
    const [ai, x0, y0, w0, h0] = s;
    t = makeSprite(TILE_W, TILE_H, TILE_W / 2, TILE_H / 2, (ctx) => {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pack.atlases[ai], x0, y0, w0, h0, -TILE_W / 2, -TILE_H / 2, TILE_W, TILE_H);
    });
  }
  arcticState.top[density] = t;
  return t;
}

/** Active when the game is arctic, the arctic pack is loaded and the OpenGFX toggle is on. */
export function arcticActive() { return !!(arcticState.on && arcticState.pack && packState.enabled); }
