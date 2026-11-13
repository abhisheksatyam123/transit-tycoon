/**
 * OpenGFX ship, dock, buoy and ship depot sprites. Ported from OpenTTD ship_cmd.cpp (_ship_sprites:
 * image_index 0 cargo = 0x0E5D, 1 oil tanker = 0x0E55, 2 passenger ferry = 0x0E65; GetImage adds the
 * direction), table/station_land.h (dock SPR_DOCK_FLAT_X / FLAT_Y, buoy SPR_IMG_BUOY) and
 * table/water_land.h (_shipdepot_display_*). Ported from OpenTTD (GPL-2.0).
 */
import { blitPack, DEFAULT_CC } from './draw.js';
import { packState } from './state.js';
import { HALF_W, HALF_H } from '../iso.js';
import { dirFromAng, dirFromBit, vehicleColour } from './vehicles.js';
import { playerVehicleColour } from '../palette.js';

/** First sprite of each ship model (8 consecutive directions, OpenTTD 0 = N). */
export const SHIP_BASE = { ship_cargo: 3677, ship_oiltanker: 3669, ship_ferry: 3685 };

/** Buoy world sprite (SPR_IMG_BUOY), extracted from the OpenGFX GUI sheet. */
const BUOY = 693;

/**
 * Ship sprite id for a model and OpenTTD direction.
 * @param {string} model
 * @param {number} dir 0..7
 * @returns {number|undefined}
 */
export function shipSpriteId(model, dir) {
  const base = SHIP_BASE[model];
  if (base === undefined) return undefined;
  return base + (((dir | 0) % 8) + 8) % 8;
}

/**
 * Draw one OpenGFX ship at its tile centre (sprite anchored at the tile top corner like vehicles).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} model
 * @param {number} dir 0..7 OpenTTD direction
 * @param {number} sx tile centre x
 * @param {number} sy tile centre y
 * @param {string} [colour]
 * @returns {boolean} false when the pack lacks the sprite
 */
function drawPackShip(ctx, model, dir, sx, sy, colour) {
  const id = shipSpriteId(model, dir);
  if (id === undefined || !packState.pack || !packState.pack.sprites[id]) return false;
  return blitPack(ctx, id, sx, sy - HALF_H, colour || DEFAULT_CC);
}

/**
 * Draw a ship segment from its vehicle info (objects.js drawSegment). Company colour from the livery.
 * @returns {boolean}
 */
export function drawPackShipSegment(ctx, seg, sx, sy) {
  const info = seg._info || {};
  const dir = seg.ang !== undefined ? dirFromAng(seg.ang) : dirFromBit(seg.dir);
  // same precedence as pack/vehicles.js: own livery > group/type colour (seg._gc) > player colour > palette
  const colour = vehicleColour((info.ownerId == null && info.colour) || info.livery || seg._gc || (info.ownerId == null ? playerVehicleColour() : null) || undefined, info.id | 0);
  return drawPackShip(ctx, info.modelId || '', dir, sx, sy, colour);
}

/** Blit a list of sprite ids stacked at the tile top corner. */
function stack(ctx, ids, sx, sy) {
  let ok = true;
  for (const id of ids) ok = blitPack(ctx, id, sx, sy - HALF_H) && ok;
  return ok;
}

/**
 * Dock on the shore: the quay sprite faces the water. `waterAlong` is 'x' when the water is N or S
 * of the tile (OpenTTD FLAT_X, for the NE/SW edges) and 'y' when it is E or W (FLAT_Y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} sx
 * @param {number} sy
 * @param {'x'|'y'} waterAlong
 * @returns {boolean}
 */
export function drawPackDock(ctx, sx, sy, waterAlong) {
  return stack(ctx, [waterAlong === 'x' ? 2731 : 2732], sx, sy);
}

/** OpenTTD world offset (delta_x, delta_y inside the tile, z = 0) -> screen offset (RemapCoords). */
const ottdOff = (dx, dy) => [(dy - dx) * 2, dx + dy];

/**
 * OpenTTD _shipdepot_display_data (table/water_land.h): each depot part is a sequence of
 * [sprite, delta_x, delta_y]. Our y axis is the OpenTTD x axis (screen x = (x - y) * HALF_W here,
 * (y - x) * 2 there), so N/S depots use the OpenTTD AXIS_X sprites.
 */
const DEPOT_PARTS = {
  x: { north: [[4072, 0, 15]], south: [[4074, 0, 0], [4070, 0, 15]] },
  y: { north: [[4073, 15, 0]], south: [[4075, 0, 0], [4071, 15, 0]] },
};

/**
 * Ship depot. OpenTTD depots span two water tiles (north + south part); ours occupies one tile,
 * so the south part is drawn one tile further along the axis (or the north part one tile back when
 * that neighbour is not water) so the building reads whole.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} dir 1|2|4|8
 * @param {number} sx
 * @param {number} sy
 * @param {(dx:number,dy:number)=>boolean} [waterAt]
 * @returns {boolean}
 */
export function drawPackShipDepot(ctx, dir, sx, sy, waterAt) {
  const d = dir | 0;
  if (d !== 1 && d !== 2 && d !== 4 && d !== 8) return false;
  const axis = d === 1 || d === 4 ? 'x' : 'y';
  const step = axis === 'x' ? [0, 1] : [1, 0]; // our tile delta to the OpenTTD "south" part
  const fwd = !waterAt || waterAt(step[0], step[1]) || !waterAt(-step[0], -step[1]);
  const tileOff = (k) => [(step[0] - step[1]) * HALF_W * k, (step[0] + step[1]) * HALF_H * k];
  const [n0, s0] = fwd ? [0, 1] : [-1, 0];
  let ok = true;
  for (const [part, k] of [['north', n0], ['south', s0]]) { // north part is behind: draw it first
    const [tx, ty] = tileOff(k);
    for (const [id, dx, dy] of DEPOT_PARTS[axis][part]) {
      const [ox, oy] = ottdOff(dx, dy);
      ok = blitPack(ctx, id, sx + tx + ox, sy - HALF_H + ty + oy) && ok;
    }
  }
  return ok;
}

/** Buoy: the SPR_IMG_BUOY sprite centred on the water tile. */
export function drawPackBuoy(ctx, sx, sy) {
  const s = packState.pack && packState.pack.sprites[BUOY];
  if (!s) return false;
  return blitPack(ctx, BUOY, sx - s[3] / 2, sy - HALF_H - s[4] / 2);
}

