/**
 * Vehicle speed -> distance per tick, acceleration and drag.
 * Ported from OpenLoco (MIT):
 *  - include/OpenLoco/Speed.hpp (Speed32 = mph * 65536; km/h shown as mph * 1.609375, Formatting.cpp)
 *  - src/Vehicles/VehicleHead.cpp VehicleHead::update (unkDistance1 = currentSpeed.raw >> 7 per tick)
 *    and Vehicle.h kMovementNibbleToDistance (straight sub-step = 0x220C, diagonal 0x3027), 32 sub-positions
 *    per 32-unit tile on a straight track/road piece  => one tile = 32 * 0x220C = 278912 distance units.
 *  - src/Vehicles/Vehicle2.cpp Vehicle2::update (power/weight/drag: ebp = power*2048/weight - mph^2,
 *    speedAdjustment = min(ebp, 0.5 mph) per tick, capped by the target speed; braking: v -= v/64 + 0.18311 mph)
 *  - VehicleHead.cpp updateAir / calculateNextPosition (aircraft: +2 mph per tick, world units/tick = raw >> 5
 *    scaled by 1/65536, i.e. mph/32 world units = mph/1024 tiles per tick; deceleration table 2/5/11/25 mph).
 *
 * Mapping to transit-tycoon: a transit-tycoon tile = one OpenLoco tile (32 units). Model speed fields are
 * already km/h (js/config/vehicles.js, aircraft.js); km/h -> OpenLoco mph divides by 1.609375, so a model of
 * X km/h covers exactly the tiles per tick an OpenLoco vehicle of X km/h does. Weight/power are not stored in
 * the models: weight = kind base + wagons + cargo, power from the model (engines) or derived for road vehicles
 * so the drag-limited top speed is ~1.25x the model speed (terminal speed sqrt(power*2048/weight) mph).
 * v.speed stays in tiles per tick (as before).
 */
export const KMH_PER_MPH = 1.609375;
/** Distance units per tick at 1 mph = 65536 >> 7. */
const UNITS_PER_MPH = 65536 / 128;
/** One tile along a straight piece: 32 sub-positions * kMovementNibbleToDistance[1]. */
export const TILE_DISTANCE = 32 * 0x220c;
/** Diagonal / straight step ratio (0x3027 / 0x220C ~ sqrt 2). */
export const DIAGONAL_STEP = 0x3027 / 0x220c;

/** tiles per tick per mph, ground vehicles (~1/544.8). */
export const MPH_TO_TILES_PER_TICK = UNITS_PER_MPH / TILE_DISTANCE;
/** tiles per tick per mph, aircraft: (raw >> 5) / 65536 world units = 1/1024 tile. */
export const AIR_MPH_TO_TILES_PER_TICK = 1 / 1024;

export const KMH_TO_TILES_PER_TICK = MPH_TO_TILES_PER_TICK / KMH_PER_MPH;
export const AIR_KMH_TO_TILES_PER_TICK = AIR_MPH_TO_TILES_PER_TICK / KMH_PER_MPH;

const TRAIN_ENGINE_WEIGHT = 60, TRAIN_WAGON_WEIGHT = 25, ROAD_WEIGHT = 12;
const MAX_ACCEL_MPH = 0.5;
const BRAKE_FLOOR_MPH = 5;
const AIR_ACCEL_MPH = 2;

/** Model-speed (km/h) of a vehicle as tiles per tick (target speed). */
export function targetSpeedTiles(model) {
  return model.speed * (model.kind === 'aircraft' ? AIR_KMH_TO_TILES_PER_TICK : KMH_TO_TILES_PER_TICK);
}

function tilesPerMph(v) { return v.kind === 'aircraft' ? AIR_MPH_TO_TILES_PER_TICK : MPH_TO_TILES_PER_TICK; }

/** Total train weight (tons): engine + wagons + 1 t per cargo unit carried. */
export function totalWeight(v) {
  const cargo = v.load ? v.load.amount || 0 : 0;
  if (v.kind === 'train') return TRAIN_ENGINE_WEIGHT + (v.wagons || 0) * TRAIN_WAGON_WEIGHT + cargo;
  return ROAD_WEIGHT + cargo * 0.5;
}

/** Engine power (hp-like OpenLoco units): model.power for engines, derived for road vehicles. */
export function totalPower(v, model) {
  if (model && model.power) return model.power;
  const topMph = (model ? model.speed : 50) / KMH_PER_MPH;
  return Math.ceil(ROAD_WEIGHT * 1.5 * topMph * topMph / 2048);
}

/**
 * One tick of Vehicle2::update for a running land vehicle (flat ground, no rack rail / wheel slip).
 * @returns {number} new speed in tiles per tick
 */
export function landSpeedStep(v, model, targetTiles, grade = 0) {
  const k = tilesPerMph(v);
  let mph = v.speed / k;
  const target = targetTiles / k;
  if (mph > target) { // braking
    return Math.max(mph - (mph / 64 + 0.18311), Math.max(target, BRAKE_FLOOR_MPH)) * k;
  }
  const power = totalPower(v, model);
  const w = Math.max(1, totalWeight(v));
  const drag = Math.trunc(mph) * Math.trunc(mph);
  const ebp = power * 2048 / w; // available force term (ebp units, before drag)
  // grade = signed fraction of that force eaten by the slope (gradeFraction); negative = downhill assist
  let adj = Math.min(ebp * (1 - grade) - drag, MAX_ACCEL_MPH);
  mph += adj;
  if (adj < 0 && mph >= BRAKE_FLOOR_MPH) mph = Math.max(mph, BRAKE_FLOOR_MPH);
  return Math.max(0, Math.min(mph, target)) * k;
}

/** One tick of aircraft speed change (VehicleHead::updateAir): +2 mph up, table deceleration down. */
export function airSpeedStep(v, targetTiles) {
  const k = AIR_MPH_TO_TILES_PER_TICK;
  let mph = v.speed / k;
  const target = targetTiles / k;
  if (mph > target) {
    let d = 2;
    if (mph >= 130) { d = 5; if (mph >= 400) { d = 11; if (mph >= 600) d = 25; } }
    return Math.max(target, Math.max(0, mph - d)) * k;
  }
  return Math.min(target, mph + AIR_ACCEL_MPH) * k;
}

/** Gradient steepness in percent (OpenTTD slope_steepness: trains 3 %, road vehicles 7 %). */
export const STEEPNESS_PCT = { train: 3, road: 7 };
/**
 * Force eaten by a full incline, as a multiple of steepness fraction: a 3 % train climbing the whole
 * body loses 30 % of its available power term (speed ~ sqrt(0.7) of flat), a 7 % road vehicle 70 %.
 */
export const GRADE_FORCE_PER_FRACTION = 10;
/** Downhill: gravity gives back this fraction of the uphill force (never above maxSpeed). */
export const DOWNHILL_FACTOR = 0.5;

/**
 * Gradient fraction for one tick: signed share of the power term consumed by the slope.
 * Positive = uphill (slows), negative = downhill assist (small). Trains average the slope over their body
 * (v.history cells, up to 2 cells per wagon); other ground vehicles use the head segment.
 * Heavier vehicles lose more because the power term already scales with 1/weight. Pure; no allocation.
 * Heights: state.map.tiles[i].height (integer levels).
 */
export function gradeMph(state, v) {
  const tiles = state.map.tiles, W = state.map.width;
  let sum = 0, n = 0;
  if (v.kind === 'train' && v.history && v.history.length > 1) {
    const hist = v.history;
    const len = Math.min(hist.length - 1, Math.max(1, (v.wagons || 0) * 2 + 2));
    for (let i = 0; i < len; i++) {
      const a = hist[i], b = hist[i + 1]; // b is the older cell; the train moves b -> a
      const d = tiles[a.y * W + a.x].height - tiles[b.y * W + b.x].height;
      sum += d > 0 ? 1 : d < 0 ? -1 : 0;
      n++;
    }
  } else {
    const p = v.path, i = v.pathIndex;
    if (p && i + 1 < p.length) {
      const a = p[i], b = p[i + 1];
      const d = tiles[b.y * W + b.x].height - tiles[a.y * W + a.x].height;
      sum += d > 0 ? 1 : d < 0 ? -1 : 0;
      n++;
    }
  }
  if (!n) return 0;
  const pct = STEEPNESS_PCT[v.kind === 'train' ? 'train' : 'road'];
  const frac = (pct / 100) * GRADE_FORCE_PER_FRACTION * (sum / n);
  return frac > 0 ? frac : frac * DOWNHILL_FACTOR;
}
