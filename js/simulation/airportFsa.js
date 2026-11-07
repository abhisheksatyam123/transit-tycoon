/**
 * Airport occupancy and holding pattern (simplified OpenTTD airport FSA, airport_movement.h).
 *  - terminals: concurrent loading aircraft per airport (OpenTTD TERMn counts). Helicopters use the helipads
 *    when the type has them, else the terminals.
 *  - runway: one plane lands at a time (RUNWAY_TICKS after a landing). Helicopters land vertically.
 *  - holding: an arriving aircraft that finds no free slot circles the airport on a square loop of
 *    HOLD_RADIUS tiles around the runway/helipad goal (v.hold = {x,y,i}, lazy) and retries at each corner.
 * Occupancy is derived from vehicle state (state 'loading' at the station), so nothing extra is saved;
 * the runway timer st.airRunwayUntil and v.hold are lazy fields that survive save/load.
 */
import { airportTypeId, isHelicopter } from './airportTypes.js';
import { airLine } from './aircraft.js';
import { HELI_PAD_TYPES, ftaTileOccupied } from './airportGround.js';

export const RUNWAY_TICKS = 6;
export const HOLD_RADIUS = 5;
/** OpenTTD counts per type: terminals (TERMn) and helipads (HELIPADn). */
export const AIRPORT_CAPACITY = {
  city: { terminals: 3, helipads: 0 },
  small: { terminals: 2, helipads: 0 },
  heliport: { terminals: 0, helipads: 1 },
  commuter: { terminals: 3, helipads: 2 },
  metropolitan: { terminals: 3, helipads: 0 },
  international: { terminals: 6, helipads: 2 },
  helidepot: { terminals: 0, helipads: 1 },
  helistation: { terminals: 0, helipads: 2 }, // layout HPAT/PAAA: two helipads
};

/** Slot pool a helicopter uses at a type: its helipads when it has any, else the terminals (planes: terminals). */
export function slotPool(typeId, heli) {
  const c = AIRPORT_CAPACITY[typeId] || AIRPORT_CAPACITY.city;
  return heli && c.helipads ? 'pad' : 'term';
}

/** Capacity of an airport type for a helicopter or plane. */
export function airCapacity(typeId, heli) {
  const c = AIRPORT_CAPACITY[typeId] || AIRPORT_CAPACITY.city;
  return slotPool(typeId, heli) === 'pad' ? c.helipads : c.terminals;
}

/** Aircraft (other than `except`) loading at station st that use the same slot pool. */
export function airOccupancy(state, st, typeId, heli, except = null) {
  const pool = slotPool(typeId, heli);
  let n = 0;
  for (const o of state.vehicles) {
    if (o === except || o.kind !== 'aircraft' || o.state !== 'loading' || o.atStationId !== st.id) continue;
    if (slotPool(typeId, isHelicopter(o)) === pool) n++;
  }
  return n;
}

/**
 * True when aircraft v can take its slot at station st now: a free terminal/helipad, and for a plane the runway
 * is clear. b is the goal building (runway centre or helipad) that identifies the airport type.
 */
export function airSlotFree(state, v, st, b) {
  const heli = isHelicopter(v);
  const typeId = airportTypeId(b);
  if (airOccupancy(state, st, typeId, heli, v) >= airCapacity(typeId, heli)) return false;
  if (!heli && (st.airRunwayUntil ?? -1) > state.tick) return false;
  // a helicopter needs its pad clear (not loading, not lifting off from it)
  if (heli && HELI_PAD_TYPES.has(typeId) && ftaTileOccupied(state, v, v.tx, v.ty)) return false;
  return true;
}

/** A plane landing uses the runway for RUNWAY_TICKS. */
export function airTookRunway(state, v, st) {
  if (!isHelicopter(v)) st.airRunwayUntil = state.tick + RUNWAY_TICKS;
}

const CORNERS = [{ dx: 0, dy: -HOLD_RADIUS }, { dx: HOLD_RADIUS, dy: 0 }, { dx: 0, dy: HOLD_RADIUS }, { dx: -HOLD_RADIUS, dy: 0 }];

/**
 * Start (or continue) a holding loop around the anchor goal (ax,ay): fly to the next corner of the square.
 * Clamped to the map; a corner equal to the current tile is skipped.
 */
export function holdFlyLeg(state, v, ax, ay) {
  if (!v.hold) v.hold = { x: ax, y: ay, i: 0 };
  const w = state.map.width, h = state.map.height;
  let path = null;
  for (let k = 0; k < CORNERS.length && !path; k++) {
    const c = CORNERS[v.hold.i++ % CORNERS.length];
    const cx = Math.max(0, Math.min(w - 1, ax + c.dx)), cy = Math.max(0, Math.min(h - 1, ay + c.dy));
    if (cx === v.tx && cy === v.ty) continue;
    path = airLine(v.tx, v.ty, cx, cy);
  }
  if (!path) path = [{ x: v.tx, y: v.ty }];
  v.path = path;
  v.pathIndex = 0;
  v.progress = 0;
}
