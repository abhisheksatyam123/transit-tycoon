import { airportLayoutFor, airportTypeId, AIRPORT_TYPES } from './airportTypes.js';

/**
 * Aircraft helpers: straight-line (Bresenham) flight paths, altitude ramp and the
 * airport footprint layout. Aircraft ignore track/road connectivity entirely.
 */

/**
 * Straight tile line from (ax,ay) to (bx,by) inclusive (Bresenham, 8-connected).
 * Consecutive tiles may differ diagonally; the renderer shows the heading.
 * @returns {{x:number,y:number}[]}
 */
export function airLine(ax, ay, bx, by) {
  const out = [{ x: ax, y: ay }];
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 100000 && !(x === bx && y === by); guard++) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    out.push({ x, y });
  }
  return out;
}

/** Fraction of the path used for the takeoff and landing ramps. */
export const RAMP_FRACTION = 0.15;

/**
 * Altitude (0 ground .. 1 cruise) of an aircraft at its current path position.
 * Ramps up over the first RAMP_FRACTION of the path and down over the last one.
 * @param {{path:object[],pathIndex:number,progress:number}} v
 * @returns {number}
 */
export function altitudeAt(v, heli = false) {
  const n = v.path.length - 1;
  if (n <= 0) return 0;
  const f = (v.pathIndex + v.progress) / n;
  if (f <= 0 || f >= 1) return 0;
  // helicopters lift off vertically: the ramp is about two tiles long, not a fraction of the route
  const ramp = heli ? Math.min(RAMP_FRACTION, 2 / n) : RAMP_FRACTION;
  const up = f / ramp, down = (1 - f) / ramp;
  return Math.max(0, Math.min(1, up, down));
}

/**
 * Airport footprint layout for a type (default city: 6x4, origin top-left). See airportTypes.js.
 * @param {string} [typeId]
 * @returns {{dx:number,dy:number,part:string}[]}
 */

/**
 * True when a tile is the goal of an airport type (runway centre, or the heliport's helipad).
 * @param {object} b tile building
 */
export function isRunwayCentre(b) {
  if (!b || b.type !== 'station' || b.kind !== 'airport') return false;
  const t = AIRPORT_TYPES[airportTypeId(b)];
  return b.part === t.goal.part && b.dx === t.goal.dx && b.dy === t.goal.dy;
}
