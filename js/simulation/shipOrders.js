/**
 * Ship order arrival. A ship reaches a station through a water tile beside its dock (or on its buoy), so this maps
 * the stop tile to the order's station. Docks load and unload with the normal arriveAtStation code; buoys are
 * waypoints (OpenTTD "go via"): the ship passes without stopping and moves on to the next order.
 */
import { currentOrder, advanceOrder, arriveAtStation } from './orders.js';
import { findStation } from './state.js';
import { isBuoyStation } from './cmdShip.js';
import { shipStopAt } from './shipPath.js';

/**
 * Called when a ship reaches the end of its path.
 * @returns {'stop'|'via'|'none'} 'stop': it is loading at a dock; 'via': passed a buoy, the order advanced (the caller
 * re-plans); 'none': not at the order's station (the caller re-plans as usual).
 */
export function shipArrive(ctx, v) {
  const { state } = ctx;
  const order = currentOrder(v);
  if (!order || !shipStopAt(state, v, order)) return 'none';
  const st = findStation(state, order.stationId);
  if (!st) return 'none';
  if (isBuoyStation(st)) { advanceOrder(v); return 'via'; }
  arriveAtStation(ctx, v, st);
  return 'stop';
}
