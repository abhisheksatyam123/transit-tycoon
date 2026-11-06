/**
 * OpenGFX vehicle sprite lookup: trains, road vehicles and aircraft in 8 directions.
 * Ported from OpenTTD train_cmd.cpp (GetDefaultTrainSprite), table/train_sprites.h, roadveh_cmd.cpp
 * (_roadveh_images, _roadveh_full_adder, GetRoadVehImage), aircraft_cmd.cpp (_aircraft_sprite) and
 * table/engines.h (image_index per engine). Ported from OpenTTD (GPL-2.0).
 *
 * OpenTTD direction numbers: N=0, NE=1, E=2, SE=3, S=4, SW=5, W=6, NW=7. Our tile axis headings map
 * onto the screen compass: N (y-1) = NE, E (x+1) = SE, S (y+1) = SW, W (x-1) = NW.
 */
import { blitPack, DEFAULT_CC } from './draw.js';
import { packState } from './state.js';
import { HALF_H } from '../iso.js';

/** Engine sprite base per rail image index (table/train_sprites.h _engine_sprite_base). */
export const RAIL_BASE = [
  2905, 2913, 2921, 3041, 2929, 2933, 2941, 2941, 2949, 2949, 2957, 2957,
  3017, 3025, 3033, 3049, 3053, 3053, 3061, 3065, 2937, 2973, 2973, 2965,
  2965, 2981, 2985, 2985, 3009, 3013, 2993, 3001, 3001, 2733, 2737, 2741,
  2745, 2749, 2753, 2761, 2765, 2773, 2769, 2777, 2757, 2769, 2773, 2809,
  2813, 2821, 2745, 2753, 2761, 2769, 2777, 2785, 2789, 2793, 2801, 2809,
  2829, 2833, 2837, 2841, 2845, 2849, 2857, 2861, 2869, 2865, 2873, 2853,
  2865, 2869,
];
/** Direction mask per rail image index (_engine_sprite_and). */
export const RAIL_AND = [
  7, 7, 7, 7, 3, 3, 7, 7, 7, 7, 7, 7,
  7, 7, 7, 3, 7, 7, 3, 7, 3, 7, 7, 7,
  7, 3, 7, 7, 3, 3, 7, 7, 7, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
  3, 3,
];
/** Direction add per rail image index (_engine_sprite_add). */
export const RAIL_ADD = [
  0, 0, 0, 0, 0, 0, 0, 4, 0, 4, 0, 4,
  0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 4, 0,
  4, 0, 0, 4, 0, 0, 0, 0, 4, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0,
];
/** Sprite add when a wagon is loaded (_wagon_full_adder). */
export const WAGON_FULL = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 44, 0,
  0, 0, 0, 24, 24, 24, 24, 0, 0, 32, 32, 0,
  4, 4, 4, 4, 4, 4, 4, 0, 0, 4, 4, 4,
  0, 44, 0, 0, 0, 0, 24, 24, 24, 24, 0, 0,
  32, 32,
];
/** Road vehicle base sprite per image index (roadveh_cmd.cpp _roadveh_images). */
export const ROADVEH_IMAGES = [
  3284, 3292, 3300, 3308, 3316, 3324, 3340, 3348, 3364, 3356, 3372, 3332,
  3356, 3364, 3436, 3444, 3452, 3092, 3100, 3108, 3116, 3124, 3132, 3148,
  3156, 3172, 3164, 3180, 3140, 3164, 3172, 3244, 3252, 3260, 3476, 3484,
  3492, 3500, 3508, 3516, 3532, 3540, 3556, 3548, 3564, 3524, 3548, 3556,
  3628, 3636, 3644, 3092, 3100, 3116, 3132, 3148, 3164, 3172, 3180, 3188,
  3204, 3220, 3236,
];
/** Road vehicle loaded adder per image index (_roadveh_full_adder). */
export const ROADVEH_FULL = [
  0, 88, 0, 0, 0, 0, 48, 48, 48, 48, 0, 0,
  64, 64, 0, 16, 16, 0, 88, 0, 0, 0, 0, 48,
  48, 48, 48, 0, 0, 64, 64, 0, 16, 16, 0, 88,
  0, 0, 0, 0, 48, 48, 48, 48, 0, 0, 64, 64,
  0, 16, 16, 0, 8, 8, 8, 8, 0, 0, 0, 8,
  8, 8, 8,
];
/** Aircraft base sprite per image index (aircraft_cmd.cpp _aircraft_sprite). */
export const AIRCRAFT_SPRITES = [
  3765, 3773, 3781, 3789, 3797, 3805, 3741, 3749, 3757, 3813, 3845, 3853,
  3861, 3869, 3877, 3885, 3821, 3829, 3837, 3893, 3741, 3749, 3757, 3765,
  3773, 3781,
];

/** Rail engine image index per model (OpenTTD engines.h image_index). */
export const RAIL_IMG = {
  eng_puffer: 2,
  eng_comet: 0,
  eng_thunder: 4,
  eng_arrow: 20,
  eng_bolt: 18,
};
/** Rail wagon image index per model. */
export const WAGON_IMG = {
  wag_coach: 33,
  wag_mail: 35,
  wag_hopper: 34,
  wag_tanker: 36,
  wag_cattle: 37,
  wag_box: 38,
  wag_flat: 42,
};
/** Wagon image index per cargo when the model is unknown. */
export const CARGO_WAGON = {
  PASS: 33,
  MAIL: 35,
  COAL: 34,
  IORE: 34,
  GRAI: 34,
  OIL: 36,
  LVST: 37,
  GOOD: 38,
  WOOD: 42,
  STEL: 42,
};
/** Road vehicle image index per bus/truck model. */
export const ROAD_IMG = {
  bus_city: 17,
  bus_express: 34,
  bus_modern: 51,
  trk_mail: 2,
  trk_bulk: 18,
  trk_tanker: 3,
  trk_log: 7,
  trk_goods: 5,
  trk_steel: 9,
  trk_cattle: 4,
  trk_heavy: 10,
};
/** Road image indices for traffic cars: OpenTTD has no private cars, so small buses and vans are used. */
export const TRAFFIC_ROAD_IMG = [0, 17, 2, 4, 5, 1];
/** Aircraft image index per model. */
export const AIR_IMG = {
  ac_li2: 0,
  ac_il14: 1,
  ac_tu104: 2,
  ac_tu134: 4,
  ac_il86: 23,
  ac_b777: 17,
  ac_a320: 13,
  ac_ssj100: 5,
};

/** Company colour palette used for traffic cars (vehicles without a livery). */
export const VEHICLE_CC = ['#1f4fa0', '#b91c1c', '#15803d', '#f2c230', '#e5e7eb', '#7c3aed'];

/**
 * OpenTTD direction (0..7) from a tile-space vector. Screen coords: sx = dx - dy, sy = (dx + dy) / 2
 * (2:1 iso projection); the angle is quantised to 45 degrees and offset so that N gives NE (1).
 * @param {number} dx tile x delta
 * @param {number} dy tile y delta
 * @returns {number} 0..7
 */
export function dirFromVec(dx, dy) {
  const sx = dx - dy, sy = (dx + dy) / 2;
  const k = Math.round(Math.atan2(sy, sx) / (Math.PI / 4));
  return (((k + 2) % 8) + 8) % 8;
}

/**
 * OpenTTD direction from our travel-direction bit (1=N, 2=E, 4=S, 8=W).
 * @param {number} bit
 * @returns {number} 0..7
 */
export function dirFromBit(bit) {
  if (bit === 1) return 1; // N -> NE
  if (bit === 8) return 7; // W -> NW
  if (bit === 4) return 5; // S -> SW
  return 3; // E -> SE
}

/**
 * OpenTTD direction from a tile heading angle (radians; 0 = +x, PI/2 = +y).
 * @param {number} ang
 * @returns {number} 0..7
 */
export function dirFromAng(ang) {
  return dirFromVec(Math.cos(ang), Math.sin(ang));
}

/**
 * Rail engine/wagon sprite id (GetDefaultTrainSprite; loaded wagons add _wagon_full_adder).
 * @param {number} img rail image index
 * @param {number} dir 0..7
 * @param {boolean} loaded
 * @returns {number}
 */
export function railSpriteId(img, dir, loaded) {
  const sp = ((dir + RAIL_ADD[img]) & RAIL_AND[img]) + RAIL_BASE[img];
  return loaded ? sp + WAGON_FULL[img] : sp;
}

/**
 * Road vehicle sprite id (GetRoadVehImage; loaded vehicles add _roadveh_full_adder).
 * @param {number} img road image index (into ROADVEH_IMAGES)
 * @param {number} dir 0..7
 * @param {boolean} loaded
 * @returns {number}
 */
export function roadSpriteId(img, dir, loaded) {
  return ROADVEH_IMAGES[img] + dir + (loaded ? ROADVEH_FULL[img] : 0);
}

/**
 * Sprite id for one vehicle facing an OpenTTD direction.
 * @param {'loco'|'wagon'|'bus'|'truck'|'car'|'air'} kind
 * @param {string} model model id (eng_*, wag_*, bus_*, trk_*, ac_*); may be ''
 * @param {number} dir 0..7 OpenTTD direction
 * @param {{cargo?:string, loaded?:boolean, id?:number}} [opt]
 * @returns {number|undefined} sprite id, undefined when the kind is unknown
 */
export function vehicleSpriteId(kind, model, dir, opt = {}) {
  const d = ((dir | 0) % 8 + 8) % 8;
  const loaded = !!opt.loaded;
  if (kind === 'loco') return railSpriteId(RAIL_IMG[model] ?? RAIL_IMG.eng_thunder, d, false);
  if (kind === 'wagon') {
    const img = WAGON_IMG[model] ?? CARGO_WAGON[opt.cargo || ''] ?? CARGO_WAGON.PASS;
    return railSpriteId(img, d, loaded);
  }
  if (kind === 'bus' || kind === 'truck') return roadSpriteId(ROAD_IMG[model] ?? ROAD_IMG.bus_city, d, loaded);
  if (kind === 'car') {
    const n = TRAFFIC_ROAD_IMG.length;
    return roadSpriteId(TRAFFIC_ROAD_IMG[((opt.id | 0) % n + n) % n], d, false);
  }
  if (kind === 'air') return AIRCRAFT_SPRITES[AIR_IMG[model] ?? AIR_IMG.ac_a320] + d;
  return undefined;
}

/**
 * Colour for a vehicle: a '#rrggbb' livery if given, else a palette entry by index.
 * @param {string|undefined} livery
 * @param {number} [index]
 * @returns {string}
 */
export function vehicleColour(livery, index) {
  if (typeof livery === 'string' && livery[0] === '#' && livery.length === 7) return livery;
  if (index !== undefined) return VEHICLE_CC[((index | 0) % VEHICLE_CC.length + VEHICLE_CC.length) % VEHICLE_CC.length];
  return DEFAULT_CC;
}

/**
 * Draw one OpenGFX vehicle. Sprites are anchored at the tile's top corner (like ground sprites),
 * so the tile centre (sx, sy) maps to top (sx, sy - HALF_H).
 * @param {CanvasRenderingContext2D} ctx
 * @param {'loco'|'wagon'|'bus'|'truck'|'car'|'air'} kind
 * @param {string} model
 * @param {number} dir 0..7 OpenTTD direction
 * @param {number} sx tile centre screen x
 * @param {number} sy tile centre screen y
 * @param {{cargo?:string, loaded?:boolean, id?:number, colour?:string}} [opt]
 * @returns {boolean} false when the pack is missing or lacks the sprite (caller falls back)
 */
export function drawPackVehicle(ctx, kind, model, dir, sx, sy, opt = {}) {
  const pack = packState.pack;
  if (!pack) return false;
  const id = vehicleSpriteId(kind, model, dir, opt);
  if (id === undefined || !pack.sprites[id]) return false;
  const colour = opt.colour || DEFAULT_CC;
  if (kind === 'air') return blitPack(ctx, id, sx, sy - HALF_H, colour);
  return drawScaled(ctx, pack, id, colour, sx, sy - HALF_H);
}

/** Road/rail vehicles are drawn at this fraction of OpenGFX size so they fit one lane. */
export const VEH_SCALE = 0.6;
/** Scaled sprite cache per pack: key "id|colour" -> {c: canvas, w, h} (pixel-art, nearest neighbour). */
const scaledCache = new WeakMap();

/**
 * Draw sprite `id` scaled by VEH_SCALE around its own centre. The sprite is first rendered at native
 * size (with its colour tint) into a cached canvas, then scaled once and reused.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} pack
 * @param {number} id
 * @param {string} colour
 * @param {number} tx tile top-corner x
 * @param {number} ty tile top-corner y
 * @returns {boolean}
 */
function drawScaled(ctx, pack, id, colour, tx, ty) {
  let cache = scaledCache.get(pack);
  if (!cache) { cache = new Map(); scaledCache.set(pack, cache); }
  const key = id + '|' + colour;
  let e = cache.get(key);
  if (!e) {
    const [, , , w, h, xo, yo] = pack.sprites[id];
    const nat = document.createElement('canvas');
    nat.width = w; nat.height = h;
    const ng = nat.getContext('2d', { willReadFrequently: true });
    blitPack(ng, id, -xo, -yo, colour);
    const sw = Math.max(1, Math.round(w * VEH_SCALE)), sh = Math.max(1, Math.round(h * VEH_SCALE));
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(nat, 0, 0, w, h, 0, 0, sw, sh);
    // native sprite centre (relative to the top corner) and its scaled size
    e = { c, sw, sh, cx: xo + w / 2, cy: yo + h / 2 };
    cache.set(key, e);
  }
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(e.c, Math.round(tx + e.cx - e.sw / 2), Math.round(ty + e.cy - e.sh / 2));
  ctx.imageSmoothingEnabled = prev;
  return true;
}

/** Our segment part -> vehicle kind for the pack lookup. */
const PART_KIND = { loco: 'loco', wagon: 'wagon', bus: 'bus', truck: 'truck' };

/**
 * Draw one train/bus/truck segment (objects.js drawSegment). seg.dir is our travel bit (1,2,4,8).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{part:string,dir:number,cargoId?:string,loaded?:boolean,_info?:any}} seg
 * @param {number} sx tile centre screen x
 * @param {number} sy tile centre screen y
 * @param {number} fill 0..1 load
 * @returns {boolean} true when drawn from the pack
 */
export function drawPackSegment(ctx, seg, sx, sy, fill) {
  const kind = PART_KIND[seg.part] || 'truck';
  const info = seg._info || {};
  if (info.roadType === 'tram') return false; // no OpenGFX tram sprites: procedural trams (sprites/trams.js)
  const colour = vehicleColour(info.livery, info.id | 0);
  const dir = seg.ang !== undefined ? dirFromAng(seg.ang) : dirFromBit(seg.dir);
  return drawPackVehicle(ctx, kind, info.modelId || '', dir, sx, sy, {
    cargo: seg.cargoId, loaded: fill > 0.5, id: info.id | 0, colour,
  });
}

/**
 * Draw one traffic car from its heading (traffic.js drawCar). Cars use OpenTTD small vehicles.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id?:number, dir:number, ang?:number}} car
 * @param {number} sx
 * @param {number} sy
 * @returns {boolean} true when drawn from the pack
 */
export function drawPackCar(ctx, car, sx, sy) {
  const dir = car.ang !== undefined ? dirFromAng(car.ang) : dirFromBit(car.dir);
  return drawPackVehicle(ctx, 'car', '', dir, sx, sy, { id: car.id | 0, colour: vehicleColour(undefined, car.id | 0) });
}

/**
 * Draw one aircraft body at altitude (air.js). h is the aircraft heading index (0 = +x, 45 deg steps).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} model aircraft model id (ac_*)
 * @param {number} h heading index 0..7
 * @param {number} sx ground-point screen x
 * @param {number} sy screen y (already lifted)
 * @param {string} [colour]
 * @returns {boolean} true when drawn from the pack
 */
export function drawPackAircraft(ctx, model, h, sx, sy, colour) {
  return drawPackVehicle(ctx, 'air', model, dirFromAng((h | 0) * Math.PI / 4), sx, sy, { colour });
}
