/**
 * Timetable start date and separation (OpenTTD CmdSetTimetableStart / CmdAutofillTimetable spread, simplified).
 * Per vehicle, lazy: `ttStart` = absolute tick of the start date. Before it, the vehicle waits at its first
 * timetabled stop (order 0); lateness is measured from the first departure after it.
 * Separation (setting `timetableSeparation`, off by default): a vehicle on a complete timetable with shared
 * orders departs each stop at its scheduled slot, start + k*round + cumulative offset, so buses on one line stay
 * evenly spaced. Round = total timetable duration (sum of travel and wait days over all orders).
 */
import { TICKS_PER_DAY } from './constants.js';
import { getSetting } from './settings.js';

/** True when every order has a travel time (OpenTTD: the timetable can be spread / separated). */
export function timetableComplete(v) {
  return !!v.orders && v.orders.length > 0 && v.orders.every((o) => o.travelDays > 0);
}

/** Total timetable duration in ticks: all travel and wait days over the order list (0 when none). */
export function roundTicks(orders) {
  let d = 0;
  for (const o of orders || []) d += ((o.travelDays || 0) + (o.waitDays || 0)) * TICKS_PER_DAY;
  return d;
}

/** Tick offset of the departure from order idx within one round (travel to it, then its wait). */
export function departOffset(orders, idx) {
  let d = 0;
  for (let j = 0; j <= idx; j++) {
    if (j > 0) d += (orders[j].travelDays || 0) * TICKS_PER_DAY;
    d += (orders[j].waitDays || 0) * TICKS_PER_DAY;
  }
  return d;
}

/** Vehicles sharing v's order list (v included), by id; [v] when orders are not shared. */
export function orderGroupMembers(state, v) {
  if (v.orderGroup == null) return [v];
  return state.vehicles.filter((w) => w.orderGroup === v.orderGroup).sort((a, b) => a.id - b.id);
}

/** Separation setting (default off). */
export function timetableSeparationOn(state) {
  return !!getSetting(state, 'timetableSeparation');
}

/**
 * Next scheduled departure tick (at or after now) of v from order idx, or null when separation does not apply.
 * Slot base = its start date, or (no start date) its rank in the group times the spacing.
 */
export function scheduledDeparture(state, v, idx, since = state.tick) {
  if (!timetableSeparationOn(state) || v.orderGroup == null || !timetableComplete(v)) return null;
  const T = roundTicks(v.orders);
  if (!T) return null;
  const mem = orderGroupMembers(state, v);
  const base = v.ttStart != null ? v.ttStart : Math.round(mem.indexOf(v) * T / mem.length);
  const dep = departOffset(v.orders, idx);
  if (since < base + dep) return base + dep;
  const r = Math.ceil((since - base - dep) / T); // first slot at or after the arrival tick
  return base + r * T + dep;
}

/**
 * Tick until which v must hold at order idx (null = may depart). Start date: order 0 waits for ttStart.
 * Separation: waits for the scheduled departure slot.
 */
export function departureHoldUntil(state, v, idx) {
  // slots are measured from the arrival tick, so a bus that checks a few ticks after its slot keeps that slot
  const since = v.arriveTick != null ? v.arriveTick : state.tick;
  let until = null;
  if (v.ttStart != null && idx === 0 && state.tick < v.ttStart) until = v.ttStart;
  const s = scheduledDeparture(state, v, idx, since);
  if (s != null && state.tick < s) until = until == null ? s : Math.max(until, s);
  return until;
}
