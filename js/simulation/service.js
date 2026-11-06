/**
 * Service intervals (OpenTTD vehicle service interval / CMD_CHANGE_SERVICE_INT, simplified).
 * Per vehicle (stored only when set, so old saves are unchanged):
 *   serviceIntervalDays  days between services (absent = off)
 *   lastServiceDay       absolute day number of the last service (dayNumber in date.js)
 *   serviceDue           interval elapsed; the vehicle heads to the nearest depot once it is running
 *                        (i.e. after its current stop)
 *   serviceTrip          the current depot trip is a service trip: the vehicle is serviced and leaves
 *                        again at once, without stopping in the depot (orders continue)
 *   services             number of services done (diagnostics)
 * Only active when breakdowns are enabled. Trip routing (startServiceTrip) lives in loco/vehicleManager.js.
 */
import { dayNumber } from './date.js';
import { getSetting } from './settings.js';

export const MAX_SERVICE_INTERVAL = 730;

/** Restore reliability after a service (movement.js calls this on arrival at the depot). */
export function servicePerformed(state, v) {
  v.reliability = v.baseReliability ?? v.reliability;
  v.breakdownTicks = 0;
  v.breakdownPending = false;
  v.timeoutToBreakdown = null; // re-armed by the next daily tick
  v.lastServiceDay = dayNumber(state.date);
  v.services = (v.services || 0) + 1;
  delete v.serviceDue;
  delete v.serviceTrip;
}

/** Default interval for a new vehicle (setting serviceIntervalDays; 0 = off = field absent). */
export function defaultServiceFields(state) {
  const days = getSetting(state, 'serviceIntervalDays') || 0;
  return days > 0 ? { serviceIntervalDays: days, lastServiceDay: dayNumber(state.date) } : {};
}

/** Set a vehicle's interval (0 turns servicing off). Returns the normalised value. */
export function applyServiceInterval(state, v, days) {
  if (!days) {
    delete v.serviceIntervalDays; delete v.lastServiceDay; delete v.serviceDue; delete v.serviceTrip;
    return 0;
  }
  v.serviceIntervalDays = days;
  if (v.lastServiceDay == null) v.lastServiceDay = dayNumber(state.date);
  return days;
}
