/**
 * OpenGFX player bridge decks (valley bridges, rail/road over track or road).
 * Ported from OpenTTD src/tunnelbridge_cmd.cpp (DrawBridgeMiddle, DrawBridgePillars, DrawTile_TunnelBridge
 * head) and src/table/bridge_land.h, bridge type "Concrete" (GPL-2.0). Sprite ids are the OpenGFX ids of
 * the OTTD SPR_BTCON_* / SPR_BTGEN_* constants (checked against the manifest).
 *
 * OTTD axis X = our N|S (mask 5); axis Y = our E|W (mask 10).
 * Middle tile: deck (track) sprite, railing (front) sprite, pillar sprite. Our heads are flush with the deck
 * (both at height h, landBridges.js), so OTTD's ramp sprites (one level up) are not used; heads draw plain track.
 * Draw order per diagonal (renderer): back (deck + pillars) -> vehicles -> front (railing).
 */
import { blitPack } from './draw.js';
import { packState } from './state.js';
import { HEIGHT_STEP, HALF_H } from '../iso.js';

/** Middle sprites per kind and OTTD axis: [deck track, railing front, pillar]. */
const MIDDLE = {
  rail: { x: [2493, 2497, 2505], y: [2494, 2498, 2506] },
  road: { x: [2495, 2497, 2505], y: [2496, 2498, 2506] },
};
/** OTTD BRIDGE_Z_START: deck sprites sit 3 px below the rail level (bridge_z). */
const BRIDGE_Z_START = 3;
/**
 * OTTD world offset (ox, oy; 16 units per tile) to screen pixels. Our tile y is the OTTD x axis and our
 * tile x the OTTD y axis (see ships.js), so screen = (2*(oy-ox), ox+oy) exactly as RemapCoords.
 */
function scr(ox, oy) { return [2 * (oy - ox), ox + oy]; }
/** Railing / front pillar position (OTTD: X axis y += 12, Y axis x += 12). */
const FRONT_OFF = { x: scr(0, 12), y: scr(12, 0) };
/** Back pillar position = front - back_pillar_offset (X: y - 9, Y: x - 9), i.e. +3 from the tile origin. */
const BACK_OFF = { x: scr(0, 3), y: scr(3, 0) };

function have(id) { const s = packState.pack && packState.pack.sprites; return !!(s && s[id]); }

/** Bridge layer and OTTD axis of a deck tile, or null when the tile has no deck bits. */
function deckInfo(tile) {
  if (tile.bridgeDeck === undefined) return null;
  const kind = tile.overBridge || (tile.rail ? 'rail' : 'road');
  const mask = tile[kind] | 0;
  // OTTD X axis = our N|S (mask 5); OTTD Y axis = our E|W (mask 10) (same convention as pack/rail.js)
  const axis = mask === 5 ? 'x' : mask === 10 ? 'y' : null;
  if (!axis) return null;
  return { kind, axis };
}

/**
 * Deck back: deck sprite (track included) and the pillars from the deck down to the ground.
 * (sx,sy) is the flat tile centre (height 0); c the ground corner heights. False when sprites are missing.
 */
export function drawDeckBack(ctx, tile, sx, sy, c) {
  const info = deckInfo(tile);
  if (!info) return false;
  const [track, , pillar] = MIDDLE[info.kind][info.axis];
  if (!have(track) || !have(pillar)) return false;
  const z = tile.bridgeDeck * HEIGHT_STEP - BRIDGE_Z_START; // OTTD z = bridge_z - BRIDGE_Z_START
  const top = sy - HALF_H; // tile north corner at height 0
  const ground = Math.max(...c) * HEIGHT_STEP;
  // back pillars (skip the two parts hidden by the deck), then the deck, then the front pillars
  const [bx, by] = BACK_OFF[info.axis];
  for (let cz = z - 2 * HEIGHT_STEP; cz >= ground; cz -= HEIGHT_STEP) blitPack(ctx, pillar, sx + bx, top + by - cz);
  blitPack(ctx, track, sx, top - z);
  const [fx, fy] = FRONT_OFF[info.axis];
  for (let cz = z; cz >= ground; cz -= HEIGHT_STEP) blitPack(ctx, pillar, sx + fx, top + fy - cz);
  return true;
}

/** Deck front: the railing (roof layer), drawn after vehicles on the deck. */
export function drawDeckFront(ctx, tile, sx, sy) {
  const info = deckInfo(tile);
  if (!info) return false;
  const front = MIDDLE[info.kind][info.axis][1];
  if (!have(front)) return false;
  const [fx, fy] = FRONT_OFF[info.axis];
  const z = tile.bridgeDeck * HEIGHT_STEP - BRIDGE_Z_START;
  blitPack(ctx, front, sx + fx, sy - HALF_H + fy - z);
  return true;
}

export { deckInfo };
