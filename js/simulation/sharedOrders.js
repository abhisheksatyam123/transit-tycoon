/**
 * Shared order lists (OpenTTD shared orders, simplified). Vehicles that share an order list carry the
 * same `orderGroup` id (stored only when shared, so old saves are unchanged). Each vehicle still keeps its
 * own `orderIndex`; an order edit on any member copies the list to all members (`syncSharers`).
 * Selling a member leaves the group; a group reduced to one vehicle is dissolved.
 */
import { replan } from './movement.js';

/** Other vehicles that share v's order list. */
export function sharers(state, v) {
  if (v.orderGroup == null) return [];
  return state.vehicles.filter((w) => w !== v && w.orderGroup === v.orderGroup);
}

/**
 * Copy v's orders to every other member of its group (each keeps its own index, clamped).
 * Running members re-route to their (possibly changed) current order.
 */
export function syncSharers(ctx, v) {
  for (const w of sharers(ctx.state, v)) {
    w.orders = v.orders.map((o) => ({ ...o }));
    w.orderIndex = w.orders.length ? w.orderIndex % w.orders.length : 0;
    if ((w.state === 'running' || w.state === 'lost') && w.goingToDepot == null) replan(ctx, w);
  }
}

/** Put v and `other` into one shared group (other keeps its orders, v copies them). */
export function joinSharedOrders(state, v, other, allocId) {
  if (other.orderGroup == null) {
    if (v.orderGroup != null) other.orderGroup = v.orderGroup;
    else { other.orderGroup = allocId(state); v.orderGroup = other.orderGroup; }
  }
  v.orderGroup = other.orderGroup;
}

/** Remove v from its group; dissolve the group when a single member remains. */
export function leaveOrderGroup(state, v) {
  if (v.orderGroup == null) return;
  const rest = sharers(state, v);
  delete v.orderGroup;
  if (rest.length === 1) delete rest[0].orderGroup;
}
