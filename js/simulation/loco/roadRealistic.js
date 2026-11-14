/**
 * Realistic road-vehicle motion (setting roadAcceleration = 'realistic'). The default 'original' keeps
 * landSpeedStep untouched. Ported from OpenTTD (GPL-2.0), speeds in km/h:
 *  - src/ground_vehicle.cpp PowerChanged (~l.20-100): max_te = weight_t * GROUND_ACCELERATION(9800,
 *    vehicle_type.h:19) * te / 256 with road te = 76 (0x4C default, engine_type.h:160-161); when the engine's
 *    air_drag is 0 the coefficient is max(2048 / displayMaxSpeed, 1), or 192 at <= 10 km/h, and
 *    cached = air + 3*air*parts/20; road air drag area = 6 (roadveh.h:213-219).
 *  - roadveh.h:237-246 rolling friction: tram 40, other road 75, scaled (128 + speed) / 128.
 *  - ground_vehicle.cpp:88-94 slope resistance = weight * steepness% * 100, steepness =
 *    vehicle.roadveh_slope_steepness (roadveh.h:270-273, default 7).
 *  - ground_vehicle.cpp GetAcceleration (~l.105-183): force = min(max_te, power*18/(5*speed)) above 0,
 *    kickoff force = max(min(max_te, power), mass*8 + resistance) at 0; accel = (force - resistance)/(mass*4),
 *    and DoUpdateSpeed adds accel/256 internal-speed units per tick => dv = (force - resistance)/(mass*1024)
 *    km/h per tick (the same conversion trainRealistic.js uses).
 *  - roadveh_cmd.cpp:470-495 GetCurrentMaxSpeed: Realistic caps 75 % on cardinal movement and 50 % while
 *    reversing (applied through the target; see roadAccelerationCapTiles).
 *
 * Data gap: TT road models carry speed and capacity only, no power/weight/TE. Weight keeps the existing
 * derivation (vehicleMotion.totalWeight: 12 t + 0.5 t per cargo unit, cargo included). Power is derived so the
 * drag-limited terminal speed of a FULLY LOADED vehicle is ~1.25x its rated speed (the same 1.25x design target
 * the original empty-load approximation aims at, now applied to the load that matters); a model-level `power`
 * field, if one is ever added, is used as OpenTTD hp. TE 76/256 and every other constant are OpenTTD's.
 * Per tick: O(1), no allocation; mass/power/TE/drag are cached on v.roadMotionCache and recomputed only when
 * the model or the cargo amount changes.
 */
import { KMH_TO_TILES_PER_TICK, totalWeight, landSpeedStep, ROAD_WEIGHT } from './vehicleMotion.js';

/** OpenTTD GROUND_ACCELERATION (vehicle_type.h:19), N per tonne. */
const GROUND_ACCELERATION = 9800;
/** Road tractive effort coefficient 76/256 (engine_type.h:160-161, table/engines.h RVI default). */
const TRACTIVE_EFFORT = 76;
/** Road air drag area, m^2 (roadveh.h:213-219). */
const ROAD_AIR_DRAG_AREA = 6;
/** Rolling friction coefficients in 1e-4 (roadveh.h:237-246). */
export const ROLLING_ROAD = 75;
export const ROLLING_TRAM = 40;
/** Bearing friction: 0.1 % of the weight (ground_vehicle.cpp:94). */
const AXLE_PER_TONNE = 10;
const WATTS_PER_HP = 746;
/** Full-load terminal speed as a multiple of rated speed (the derivation target). */
const TERMINAL_SPEED_FACTOR = 1.25;

/** Air drag coefficient cache of one road vehicle (parts = 1: TT treats the whole bus/tram as one unit). */
function airDragCoef(ratedKmh) {
  const air = ratedKmh <= 10 ? 192 : Math.max(Math.trunc(2048 / ratedKmh), 1);
  const cached = air + Math.trunc(3 * air * 1 / 20);
  return ROAD_AIR_DRAG_AREA * cached / 1000;
}

/**
 * Cached motion constants for a road vehicle. mass/TE/axle use the CURRENT load (OpenTTD recomputes them on
 * cargo changes); power comes from the full-load derivation and is therefore constant for the model.
 */
export function roadMotion(v, model) {
  const cargo = v.load ? v.load.amount || 0 : 0;
  const c = v.roadMotionCache;
  if (c && c.modelId === v.modelId && c.cargo === cargo) return c;
  const rated = model ? model.speed : 50;
  const capacity = model && model.capacity ? model.capacity : 0;
  const tram = v.roadType === 'tram';
  const rolling = tram ? ROLLING_TRAM : ROLLING_ROAD;
  const mass = Math.max(1, totalWeight(v));
  const fullMass = Math.max(1, ROAD_WEIGHT + capacity * 0.5);
  const airCoef = airDragCoef(rated);
  const vTerm = rated * TERMINAL_SPEED_FACTOR;
  const resistanceFull = AXLE_PER_TONNE * fullMass + fullMass * rolling * (128 + vTerm) / 128 + airCoef * vTerm * vTerm;
  const powerHp = model && model.power ? model.power : resistanceFull * vTerm / (WATTS_PER_HP * 18 / 5);
  const m = {
    modelId: v.modelId, cargo,
    mass, rolling,
    power: powerHp * WATTS_PER_HP,
    te: mass * GROUND_ACCELERATION * TRACTIVE_EFFORT / 256,
    airCoef,
    axle: AXLE_PER_TONNE * mass,
  };
  v.roadMotionCache = m;
  return m;
}

/**
 * OpenTTD Realistic speed cap (roadveh_cmd.cpp:470-495), in tiles per tick: 50 % of the model speed while
 * reversing, 75 % on cardinal (non-diagonal) steps, the full model speed on diagonals.
 */
export function roadAccelerationCapTiles(v, reversing, cardinal) {
  if (reversing) return v.maxSpeed / 2;
  return cardinal ? v.maxSpeed * 3 / 4 : v.maxSpeed;
}

/** True when the next path step is cardinal (not a diagonal step). Direction caps use this. */
export function roadCardinalStep(v) {
  const p = v.path, i = v.pathIndex;
  if (!p || i + 1 >= p.length) return false;
  const a = p[i], b = p[i + 1];
  return a.x === b.x || a.y === b.y;
}

/**
 * True while a road vehicle is backing up over the one-tile return path turnAround() builds (movement.js):
 * path is [current tile, previous tile] and the target is exactly history[1]. No extra state is written.
 */
export function roadReversing(v) {
  const p = v.path, i = v.pathIndex;
  if (!p || i + 1 >= p.length || p.length - i > 2) return false;
  const b = p[i + 1], h = v.history && v.history[1];
  return !!h && b.x === h.x && b.y === h.y;
}

/**
 * One realistic tick for a road vehicle: new speed in tiles per tick.
 * @param targetTiles target speed (tiles/tick), already min(model speed, order/bridge/breakdown/curve/cardinal cap)
 * @param grade signed gradient fraction (movement.js gradeMph; steepness% = grade * 10, road default 7 %)
 */
export function realisticRoadSpeedStep(v, model, targetTiles, grade = 0) {
  const kmh = v.speed / KMH_TO_TILES_PER_TICK;
  const targetKmh = targetTiles / KMH_TO_TILES_PER_TICK;
  if (kmh > targetKmh) return landSpeedStep(v, model, targetTiles, 0); // braking: OpenLoco branch
  const c = roadMotion(v, model);
  const rolling = c.mass * c.rolling * (128 + kmh) / 128;
  const slope = c.mass * (grade * 10) * 100;
  const resistance = c.axle + rolling + c.airCoef * kmh * kmh + slope;
  let force;
  if (kmh > 0) {
    force = c.power * 18 / (kmh * 5);
    if (force > c.te) force = c.te;
  } else {
    force = Math.max(Math.min(c.te, c.power), c.mass * 8 + resistance); // kickoff, ground_vehicle.cpp:163-166
  }
  let next = kmh + (force - resistance) / (c.mass * 1024);
  if (next < 0) next = 0;
  if (next > targetKmh) next = targetKmh;
  return next * KMH_TO_TILES_PER_TICK;
}
