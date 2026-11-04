/**
 * OpenGFX bridge drawing for road/rail over water. Ported from OpenTTD src/tunnelbridge_cmd.cpp
 * (DrawTile_TunnelBridge middle deck: sprite anchored at the tile's top corner, lifted by the bridge
 * height) and src/table/bridge_land.h (GPL-2.0). We draw the plain deck (OpenGFX 2437 X / 2441 Y
 * rail, 2445 X / 2449 Y road) over flat water (4061). We have no bridge ramps, so the deck is lifted
 * to the highest corner of the tile, which meets the land road/rail on the adjacent banks.
 * Non-straight masks (corners, junctions) on water draw the matching road/rail ground sprite on the
 * water top instead, so no procedural bridge railing is ever drawn in pack mode.
 */
import { packTop } from './ground.js';
import { drawSloped } from '../slope.js';
import { blitPack } from './draw.js';
import { packState } from './state.js';
import { HALF_H, HEIGHT_STEP } from '../iso.js';
import { roadSprite } from './road.js';
import { railIds } from './rail.js';

/** Flat water top (OpenGFX 4061). */
export const WATER_SPRITE = 4061;
/** Deck sprite per [kind][axis]: axis 'x' = our N|S (mask 5), 'y' = our E|W (mask 10). */
export const BRIDGE_DECK = {
  rail: { x: 2441, y: 2437 },
  road: { x: 2449, y: 2445 },
};

/** Sprite ids in the pack (for tests). */
export function bridgeSprites(kind, axis) { return [WATER_SPRITE, BRIDGE_DECK[kind][axis]]; }

/** True when the water top and the deck exist in the loaded pack. */
function have(ids) {
  const s = packState.pack && packState.pack.sprites;
  return !!s && ids.every((id) => s[id]);
}

/**
 * Draw a road or rail tile on water: water top, then the deck (straight) or ground piece (other).
 * @param {CanvasRenderingContext2D} ctx
 * @param {'rail'|'road'} kind
 * @param {number} mask road mask or rail mask (N=1,E=2,S=4,W=8)
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number[]} c corner heights [hN,hE,hS,hW]
 * @returns {boolean} false only when the pack is missing the water top
 */
export function drawBridgeTile(ctx, kind, mask, sx, sy, c) {
  if (!have([WATER_SPRITE])) return false;
  const top = packTop([WATER_SPRITE]);
  if (!top) return false;
  drawSloped(ctx, top, sx, sy, c);
  const axis = mask === 5 ? 'x' : mask === 10 ? 'y' : null;
  if (axis && have([BRIDGE_DECK[kind][axis]])) {
    // Deck anchored at the tile's top corner at the highest corner height (sprite origin = top corner).
    const h = Math.max(...c);
    blitPack(ctx, BRIDGE_DECK[kind][axis], sx, sy - HALF_H - HEIGHT_STEP * h);
    return true;
  }
  // Corners and junctions: ground piece on the water top, no railings.
  const ids = kind === 'road' ? [roadSprite(mask, true)] : railIds(mask, false);
  if (!ids.length || ids[0] < 0 || !have(ids)) return true;
  const piece = packTop(ids);
  if (piece) drawSloped(ctx, piece, sx, sy, c);
  return true;
}
