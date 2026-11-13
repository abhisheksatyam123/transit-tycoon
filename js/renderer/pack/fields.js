/**
 * OpenGFX farm fields (T-IA). OpenTTD DrawClearLandFence + _clear_land_sprites_farmland (src/clear_cmd.cpp,
 * src/table/clear_land.h): a field tile is one flat farmland sprite (SPR_FARMLAND_BARE 4126, states 4145..4259 in
 * steps of 19, hay packs SPR_FARMLAND_HAYPACKS 4278) plus a hedge fence on each edge that borders a non-field tile.
 * Fence sprite base = SPR_HEDGE_FENCE 4102; flat-tile modifiers NE=0, NW=1, SW=0, SE=1 (_fence_mod_by_tileh_*).
 * Field state is a deterministic function of the tile position (no simulation state).
 */
import { blitPack } from './draw.js';
import { HALF_H } from '../iso.js';

const SPR_FARMLAND_BARE = 4126;
const SPR_FARMLAND_STATE_STEP = 19;
const SPR_FARMLAND_HAYPACKS = 4278;
const SPR_HEDGE_FENCE = 4102;

/** Farmland sprite for a field tile at (x, y): bare soil, one of the 7 growth states, or hay packs. */
function fieldGroundSprite(x, y) {
  const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const k = h % 16;
  if (k === 15) return SPR_FARMLAND_HAYPACKS;
  if (k >= 8) return SPR_FARMLAND_BARE + SPR_FARMLAND_STATE_STEP * (1 + (k % 7));
  return SPR_FARMLAND_BARE;
}

/**
 * Draw one farm field tile (ground + hedge fences on the edges facing non-field tiles).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x tile x
 * @param {number} y tile y
 * @param {number} sx tile centre screen x
 * @param {number} sy tile centre screen y
 * @param {(dx:number, dy:number)=>boolean} isField true when the tile at (x+dx, y+dy) is a field
 * @returns {boolean} false when the pack has no farmland sprite (caller draws procedurally)
 */
export function drawOgfxField(ctx, x, y, sx, sy, isField) {
  const topX = sx, topY = sy - HALF_H;
  if (!blitPack(ctx, fieldGroundSprite(x, y), topX, topY)) return false;
  // Diamond edges (tileToScreen: +x is down-right, +y down-left): NW faces (x-1,y), NE faces (x,y-1),
  // SW faces (x,y+1), SE faces (x+1,y). OpenTTD _fence_mod_by_tileh flat values: NW 1, NE 0, SW 0, SE 1.
  if (!isField(-1, 0)) blitPack(ctx, SPR_HEDGE_FENCE + 1, topX, topY);
  if (!isField(0, -1)) blitPack(ctx, SPR_HEDGE_FENCE, topX, topY);
  if (!isField(0, 1)) blitPack(ctx, SPR_HEDGE_FENCE, topX, topY);
  if (!isField(1, 0)) blitPack(ctx, SPR_HEDGE_FENCE + 1, topX, topY);
  return true;
}
