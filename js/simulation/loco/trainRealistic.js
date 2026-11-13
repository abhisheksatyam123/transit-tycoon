/**
 * Realistic train motion (setting trainAcceleration = 'realistic'). The default 'original' keeps
 * landSpeedStep untouched. Ported from OpenTTD (GPL-2.0), speeds in km/h:
 *  - src/train_cmd.cpp Train::GetCurveSpeedLimit (lines ~318-380): 90 degree corner -> 61 km/h;
 *    45 degree corners closer than VEHICLE_LENGTH (8, vehicle_type.h:67) -> 88 km/h; a run of 45 degree
 *    corners -> 232 - (13 - avgSpacing)^2 with avgSpacing clamped to 1..12 vehicle lengths; an exact S-bend
 *    (one left + one right 45 degree corner) -> no limit.
 *  - src/ground_vehicle.cpp PowerChanged (~l.20-70): max_te = weight_t * GROUND_ACCELERATION(9800, vehicle_type.h:19)
 *    * te / 256 with te = 76 (RVI default, table/engines.h:387); air drag = 2048 / maxSpeed (min 1),
 *    cached = air + 3*air*parts/20; air drag area 14 (train.h:272).
 *  - ground_vehicle.cpp:88-94 slope resistance = weight * steepness% * 100; axle = 10 * weight.
 *  - train.h:309-316 rolling friction 15 * (512 + speed) / 512 (in 1e-4 per tonne-unit as OTTD does).
 *  - ground_vehicle.cpp GetAcceleration (~l.105-175): force = min(maxTE, power*18/(5*speed_kmh)) with
 *    power in W (746 per hp); resistance = axle + mass*rolling + area*air*speed^2/1000 + slope;
 *    accel = (force - resistance) / (mass*4); train_cmd.cpp DoUpdateSpeed adds accel/256 km/h per tick
 *    => dv = (force - resistance) / (mass * 1024) km/h per tick.
 * Per tick: O(1), no allocation. Consist mass/power/TE/drag are cached on v.motionCache (recomputed only
 * when model, wagons or cargo change); the curve limit is cached per pathIndex in v.curvePath/curveIdx/curveLimit.
 */
import { KMH_TO_TILES_PER_TICK, MPH_TO_TILES_PER_TICK, totalWeight, totalPower, landSpeedStep } from './vehicleMotion.js';
import { engineList, engineWeightById, DEFAULT_ENGINE_WEIGHT } from '../consistEngines.js';
import { MODEL_BY_ID } from '../../config/vehicles.js';

/** OpenTTD GROUND_ACCELERATION (vehicle_type.h:19), N per tonne. */
export const GROUND_ACCELERATION = 9800;
/** Tractive effort coefficient 76/256 = 0.30 (table/engines.h:387 RVI default). */
export const TRACTIVE_EFFORT = 76;
const ROLLING_BASE = 15;            // train.h:309-316, 1e-4 units
const TRAIN_AIR_DRAG_AREA = 14;     // train.h:272
const AXLE_PER_TONNE = 10;          // ground_vehicle.cpp:94
const WATTS_PER_HP = 746;
export const ENGINE_TONNES = DEFAULT_ENGINE_WEIGHT; // TT engine weight when the model has none (consistEngines.js)
/** Symbol-keyed cache stamp for the engine list: JSON.stringify ignores symbol keys, so saves are unchanged. */
const ENGINE_LIST_STAMP = Symbol('engineList');

/** OpenTTD curve constants (train_cmd.cpp). */
const CURVE_VEHICLE_LENGTH = 8;   // VEHICLE_LENGTH, vehicle_type.h:67
const CURVE_TILE_UNITS = 16;      // one tile along the path (OTTD TILE_SIZE); corner spacing is per tile, so the 88 rule (spacing <= 8) cannot fire on whole-tile paths
const CURVE_LOOKAHEAD_TILES = 6;  // corners considered ahead (constant, keeps the scan O(1))
export const CURVE_LIMIT_90 = 61;        // train_cmd.cpp: 90 degree -> 61
export const CURVE_LIMIT_45_CLOSE = 88;  // train_cmd.cpp: 45 degree corners closer than VEHICLE_LENGTH -> 88

const NO_LIMIT = Infinity;

/**
 * OpenLoco road curve speed fraction. Vehicle1::updateRoad uses
 * max(12 mph, roadMaxSpeed * curveSpeedFraction + 1 mph). The road table has
 * leftCurveVerySmall/rightCurveVerySmall = 0x0CCD/0xFFFF,
 * leftCurveSmall/rightCurveSmall = 0x199A/0xFFFF, and turnaround = 0x0CCD/0xFFFF.
 *
 * The original lookup is keyed by roadId = (res >> 3) & 0xF, where the low nibble encodes the road
 * track type: 0 straight, 1/2 very-small curve, 3/4 small curve, 5/6 slope, 7/8 steep slope, and
 * 9 turnaround. Transit Tycoon does not expose that piece ID, so the curve class is recovered
 * geometrically from the TT tile path.
 */
const ROAD_CURVE_FRACTION_VERY_SMALL = 0x0CCD / 0xFFFF; // ~0.05
/** OpenLoco small road curve speed fraction (0x199A/0xFFFF, ~0.10). */
const ROAD_CURVE_FRACTION_SMALL = 0x199A / 0xFFFF;
/** OpenLoco minimum road curve speed, in mph. */
const ROAD_CURVE_MIN_MPH = 12;

/**
 * OpenLoco road curve speed fraction for a road path. The look-ahead must stay O(1), so only the
 * first <=CURVE_LOOKAHEAD_TILES vertices are inspected. TT paths use cardinal and diagonal steps;
 * a 45-degree turn is the small curve, and 90/270-degree turns are the very-small curve. A straight
 * through-move and transitions between diagonals are 0 degrees and therefore uncapped. A U-turn
 * has nearest=4 and is also classified as the very-small curve, matching roadId 9.
 */
export function roadCurveFraction(v) {
  const pth = v?.path;
  if (!pth || v.pathIndex < 0 || v.pathIndex + 2 >= pth.length) return 1;
  let min = 1;
  const end = Math.min(pth.length - 2, v.pathIndex + CURVE_LOOKAHEAD_TILES);
  for (let i = v.pathIndex + 1; i <= end; i++) {
    const a = pth[i - 1], b = pth[i], c = pth[i + 1];
    const d1x = b.x - a.x, d1y = b.y - a.y;
    const d2x = c.x - b.x, d2y = c.y - b.y;
    const dot = d1x * d2x + d1y * d2y;
    if (dot > 0 && (d1x * d2y - d1y * d2x) === 0) continue;
    const nearest = Math.round(Math.atan2(Math.abs(d1x * d2y - d1y * d2x), dot) / (Math.PI / 4));
    if (nearest === 0) continue;
    min = Math.min(min, nearest >= 2 ? ROAD_CURVE_FRACTION_VERY_SMALL : ROAD_CURVE_FRACTION_SMALL);
  }
  return min;
}

/**
 * Road curve target in tiles per tick (OpenLoco Vehicle1::updateRoad):
 *   max(fraction * roadMaxSpeed, 12 mph) + 1 mph
 * Current movement.js applies this through Math.min(maxTiles, roadCurveTargetTiles(...)), so earlier
 * order/bridge/breakdown caps are preserved.
 */
/**
 * Tram corner speed limit (km/h) behind the `tramCurveCap` setting, from OpenTTD
 * GetCurveSpeedLimit. In OpenTTD a tram (RoadVeh::TramSpeed) never reaches its model top speed in
 * a corner: a 90 degree corner caps it at 61 km/h (CURVE_LIMIT_90) and consecutive 45 degree
 * corners at the spacing formula (curveSpeedLimitKmh), while the default road fraction would
 * allow effectively uncapped speed on a tram (buses/trucks keep the OpenLoco road fraction).
 * Returns NO_LIMIT (Infinity) on a straight path or an S-bend. Pure apart from the curve cache.
 */
export function tramCurveLimitKmh(v) {
  return curveSpeedLimitKmh(v);
}

/** Tram corner target in tiles per tick: min(road curve target, tram curve limit). */
export function tramCurveTargetTiles(v, roadMaxTiles) {
  const road = roadCurveTargetTiles(v, roadMaxTiles);
  const lim = curveSpeedLimitKmh(v) * KMH_TO_TILES_PER_TICK;
  return lim < road ? lim : road;
}

export function roadCurveTargetTiles(v, roadMaxTiles) {
  return Math.max(roadMaxTiles * roadCurveFraction(v), ROAD_CURVE_MIN_MPH * MPH_TO_TILES_PER_TICK) + 1 * MPH_TO_TILES_PER_TICK;
}

/**
 * Corner speed limit (km/h) from the path ahead (OpenTTD GetCurveSpeedLimit, path form). Pure apart from
 * filling v.curveCache (keyed by pathIndex and path identity). Returns NO_LIMIT when no corner applies.
 */
export function curveSpeedLimitKmh(v) {
  const p = v.path, i0 = v.pathIndex;
  if (!p || i0 + 2 >= p.length) return NO_LIMIT;
  if (v.curvePath === p && v.curveIdx === i0) return v.curveLimit;
  let max = NO_LIMIT, curveL = 0, curveR = 0, numcurve = 0, sum = 0, lastPos = -1;
  const end = Math.min(p.length - 2, i0 + CURVE_LOOKAHEAD_TILES);
  for (let i = i0 + 1; i <= end; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1];
    let turn = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    if (turn > Math.PI) turn -= 2 * Math.PI; else if (turn < -Math.PI) turn += 2 * Math.PI;
    const k = Math.round(Math.abs(turn) / (Math.PI / 4)); // 0 straight, 1 = 45 deg, 2 = 90 deg
    if (k === 0) continue;
    const pos = (i - i0) * CURVE_TILE_UNITS;
    if (k === 1) {
      if (turn < 0) curveL++; else curveR++;
      if (lastPos !== -1) {
        numcurve++;
        sum += pos - lastPos;
        if (pos - lastPos <= CURVE_VEHICLE_LENGTH && max > CURVE_LIMIT_45_CLOSE) max = CURVE_LIMIT_45_CLOSE;
      }
      lastPos = pos;
    } else {
      max = CURVE_LIMIT_90;
    }
  }
  if (numcurve > 0 && max > CURVE_LIMIT_45_CLOSE) {
    if (curveL === 1 && curveR === 1) max = NO_LIMIT; // S-bend
    else {
      const avg = Math.min(12, Math.max(1, Math.ceil(Math.ceil(sum / CURVE_VEHICLE_LENGTH) / numcurve)));
      max = 232 - (13 - avg) * (13 - avg);
    }
  }
  v.curvePath = p; v.curveIdx = i0; v.curveLimit = max; // plain fields: no allocation per tile
  return max;
}

/**
 * Consist motion constants, cached on the vehicle. Recomputed only when the model, wagon count or cargo
 * amount change (field compare, no string keys, so no per-tick allocation).
 */
export function consistMotion(v, model) {
  const cargo = v.load ? v.load.amount || 0 : 0;
  const wagons = v.wagons || 0;
  let c = v.motionCache;
  const ids = engineList(v);
  const engines = ids.length - 1; // extra engines (phase 2); absent = none
  // Key includes the engine list itself (identity-stable frozen list), not just its length, so swapping an
  // extra engine for a different model invalidates the cache. Symbol stamp keeps the key out of saves.
  if (c && c.modelId === v.modelId && c.engines === engines && c[ENGINE_LIST_STAMP] === ids
    && c.wagons === wagons && c.cargo === cargo) return c;
  const mass = Math.max(1, totalWeight(v));
  const power = totalPower(v, model) * WATTS_PER_HP;
  let tonnes = 0;
  for (let i = 0; i < ids.length; i++) tonnes += engineWeightById(ids[i]);
  const te = tonnes * GROUND_ACCELERATION * TRACTIVE_EFFORT / 256;
  // OpenTTD train_cmd.cpp:194-199: the consist is limited by the slowest engine (wagons are skipped unless
  // wagon_speed_limits, which consist.js applies separately). One engine = the model's speed as before.
  let maxKmh = model ? model.speed : 100;
  for (let i = 1; i < ids.length; i++) {
    const m = MODEL_BY_ID[ids[i]];
    if (m && m.speed > 0 && m.speed < maxKmh) maxKmh = m.speed;
  }
  const airDrag = maxKmh <= 10 ? 192 : Math.max(Math.trunc(2048 / maxKmh), 1);
  const parts = 1 + wagons;
  const cachedAir = airDrag + Math.trunc(3 * airDrag * parts / 20);
  c = {
    modelId: v.modelId, engines, wagons, cargo,
    mass, power, te,
    airCoef: TRAIN_AIR_DRAG_AREA * cachedAir / 1000,
    axle: AXLE_PER_TONNE * mass,
  };
  c[ENGINE_LIST_STAMP] = ids;
  v.motionCache = c;
  return c;
}

/**
 * One realistic tick for a train: new speed in tiles per tick.
 * @param targetTiles target speed (tiles/tick), already min(model speed, corner limit)
 * @param grade signed gradient fraction (movement.js gradeMph); steepness% = grade * 10 (train 3% <-> 0.3)
 */
export function realisticTrainSpeedStep(v, model, targetTiles, grade = 0) {
  const kmh = v.speed / KMH_TO_TILES_PER_TICK;
  const targetKmh = targetTiles / KMH_TO_TILES_PER_TICK;
  if (kmh > targetKmh) return landSpeedStep(v, model, targetTiles, 0); // braking: OpenLoco branch
  const c = consistMotion(v, model);
  const rolling = c.mass * ROLLING_BASE * (512 + kmh) / 512;
  const slope = c.mass * (grade * 10) * 100;
  const resistance = c.axle + rolling + c.airCoef * kmh * kmh + slope;
  let force;
  if (kmh > 0) {
    force = c.power * 18 / (kmh * 5);
    if (force > c.te) force = c.te;
  } else {
    force = Math.max(Math.min(c.te, c.power), c.mass * 8 + resistance); // kickoff, ground_vehicle.cpp:163
  }
  let next = kmh + (force - resistance) / (c.mass * 1024);
  if (next < 0) next = 0;
  if (next > targetKmh) next = targetKmh;
  return next * KMH_TO_TILES_PER_TICK;
}
