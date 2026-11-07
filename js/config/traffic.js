/**
 * Traffic simulation tunables (private cars driving between buildings).
 * Speeds are in tiles per tick (1 tick = 1/30 day; 50 km/h = 50 / 800 tiles per tick).
 */

/** Floor for the active private car cap. */
export const MAX_CARS = 300;
/** Ceiling for the active car cap (scales with population). */
export const MAX_CARS_LIMIT = 700;
/** Path searches allowed per tick for trip planning (rest deferred to later ticks). */
export const PLANS_PER_TICK = 6;
/** One active car allowed per this many inhabitants. */
export const POP_PER_CAR_CAP = 20;
/** Expected trips generated per town inhabitant per day. */
export const TRIPS_PER_POP_PER_DAY = 1 / 120;
/** Free-flow car speed in tiles per tick (50 km/h). */
export const CAR_SPEED = 50 / 800;
/** Cars per tile per travel direction before a lane is full. */
export const LANE_CAPACITY = 2;
/** Lane offset from the road centre line (tile units), right-hand traffic. */
export const LANE_OFFSET = 0.2;
/**
 * Road driving side (settings roadSide): +1 = right-hand traffic (default), -1 = left-hand. Render-only:
 * the sim lane keys and occupancy are side-agnostic. Set once per frame by the renderer from the setting.
 */
export const roadSideSign = { value: 1 };
/** Highway (4-lane) lane offset (tile units), right-hand traffic. */
export const HWY_LANE_OFFSET = 0.23;
/** Highway occupancy multiplier: each highway lane key holds this many more cars. */
export const HWY_LANE_CAPACITY = 4;
/** Minimum bumper gap (tile units along the lane) kept to the car ahead. */
export const GAP_MIN = 0.35;
/** Speed change limits per tick (tiles/tick). */
export const ACCEL = 0.004;
export const DECEL = 0.012;
/** Speed factor applied while turning through a corner tile. */
export const CORNER_SLOW = 0.7;
/** Maximum fractional speed loss on a fully occupied tile. */
export const CONGESTION_SLOW = 0.35;
/** Ticks a car may stay blocked before its trip is aborted (4 days). */
export const STUCK_TICKS = 120;
/** Destination mix: same-town house 70%, nearest other town 20%, industry 10%. */
export const DEST_MIX = { sameTown: 0.7, otherTown: 0.2 };
/** Days of traffic history kept. */
export const HISTORY_DAYS = 90;
/** Load (cars per tile, EMA) at or above which a tile can count as congested (both directions). */
export const CONGESTED_LOAD = 1.0;
/** Jam (blocked share of car-ticks, EMA) at or above which a tile counts as congested. */
export const JAM_CONGESTED = 0.25;
/** Daily EMA smoothing for jam share (same as load). */
export const JAM_ALPHA = 0.3;
/** EMA smoothing factor for tile load (updated daily). */
export const LOAD_ALPHA = 0.3;
/** A* node budget for car routes. */
export const PATH_MAX_NODES = 6000;
