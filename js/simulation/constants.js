/**
 * Shared constants for the simulation core.
 * Direction bits: N=1 (y-1), E=2 (x+1), S=4 (y+1), W=8 (x-1).
 */

/** @type {{bit:number,dx:number,dy:number,name:string}[]} */
export const DIRS = [
  { bit: 1, dx: 0, dy: -1, name: 'N' },
  { bit: 2, dx: 1, dy: 0, name: 'E' },
  { bit: 4, dx: 0, dy: 1, name: 'S' },
  { bit: 8, dx: -1, dy: 0, name: 'W' },
];

/** Opposite direction bit. */
export const OPPOSITE = { 1: 4, 2: 8, 4: 1, 8: 2 };

/** Direction record by bit. */
export const DIR_BY_BIT = { 1: DIRS[0], 2: DIRS[1], 4: DIRS[2], 8: DIRS[3] };

/** Bits of a straight piece along an axis. */
export const AXIS_BITS = { x: 2 | 8, y: 1 | 4 };

/** Ticks per game day: OpenLoco day counter (loco/gameLoop.js DAY_INCREMENT 682 -> 65536/682 = 96.09 ticks). */
export const TICKS_PER_DAY = 96;

/** Catchment radius per station kind. */
export const CATCHMENT = { rail: 4, bus: 3, truck: 3, airport: 6 };

/** Airport footprint (tiles). Local layout: see cmdAirport.js. */
export const AIRPORT_W = 6;
export const AIRPORT_H = 4;

/** Acceptance (in eighths) needed for a station to accept a cargo. */
export const ACCEPT_THRESHOLD = 8;

export const MAP_DEFAULTS = { width: 96, height: 96, seed: 1234, startYear: 1950, townCount: 8, industryCount: 18 };

export const START_MONEY = 100000;
export const START_LOAN = 100000;
export const MAX_LOAN = 300000;
export const LOAN_STEP = 10000;
/** Yearly interest rate on the loan (charged monthly). */
export const INTEREST_RATE = 0.05;

/** km/h -> tiles per tick: OpenLoco motion units (R13a, loco/vehicleMotion.js). */
export { KMH_TO_TILES_PER_TICK, AIR_KMH_TO_TILES_PER_TICK } from './loco/vehicleMotion.js';

/** Spacing (in tiles) between consecutive train segments. */
export const SEGMENT_SPACING = 0.5;

/** Max waiting cargo per cargo type at a station. */
export const MAX_WAITING = 4000;

export const MAX_NEWS = 60;
export const MAX_ORDERS = 16;
export const MAX_WAGONS = 12;
export const SAVE_VERSION = 1;

/** Direction bit from tile a to adjacent tile b (0 if not adjacent). */
export function dirBetween(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === -1) return 1;
  if (dx === 1 && dy === 0) return 2;
  if (dx === 0 && dy === 1) return 4;
  if (dx === -1 && dy === 0) return 8;
  return 0;
}
