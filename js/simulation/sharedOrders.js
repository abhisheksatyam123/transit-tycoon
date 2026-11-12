/**
 * Shared order lists (OpenTTD shared orders, simplified). Vehicles that share an order list carry the
 * same `orderGroup` id (stored only when shared, so old saves are unchanged). Each vehicle still keeps its
 * own `orderIndex`; an order edit on any member copies the list to all members (`syncSharers`).
 * Selling a member leaves the group; a group reduced to one vehicle is dissolved.
 */
import { replan } from './movement.js';
import { resetUnbunch } from './unbunch.js';
import { orderSlot } from './orders.js';

/** Other vehicles that share v's order list. */
export function sharers(state, v) {
  if (v.orderGroup == null) return [];
  return state.vehicles.filter((w) => w !== v && w.orderGroup === v.orderGroup);
}

/** True when `next` is `prev` with some orders removed (same order, possibly fewer). */
function onlyRemovals(prev, next) {
  let j = 0;
  for (let i = 0; i < prev.length && j < next.length; i++) {
    if (orderSlot(prev[i]) === orderSlot(next[j])) j++;
  }
  return j === next.length;
}

/**
 * Position of `index` in `next` when `next` is `prev` with some orders removed. Each removed order before the
 * index shifts it down; when the order at `index` itself was removed, the nearest following order is used.
 */
function remapOrderIndex(prev, next, index) {
  if (!next.length) return 0;
  if (index < 0 || index >= prev.length) return index % next.length;
  let j = 0;
  for (let i = 0; i < prev.length; i++) {
    if (j < next.length && orderSlot(prev[i]) === orderSlot(next[j])) {
      if (i === index) return j;
      j++;
    } else if (i === index) {
      return Math.min(j, next.length - 1);
    }
  }
  return Math.min(j, next.length - 1);
}

/**
 * Copy v's orders to every other member of its group (each keeps its own current order).
 * `prevOrders` (the list before the edit) lets a shrink keep each member on the same order: the index is
 * shifted down by the removed orders before it instead of wrapping with `%`. Without it the old modulo
 * clamp is kept. Running members re-route to their (possibly changed) current order.
 */
export function syncSharers(ctx, v, prevOrders) {
  // Conditional targets are renumbered before this point (deleteOrderAt on delete, normaliseOrders on edit),
  // so the copied list already carries valid targets.
  const shift = prevOrders && prevOrders !== v.orders && onlyRemovals(prevOrders, v.orders);
  for (const w of sharers(ctx.state, v)) {
    w.orders = v.orders.map((o) => ({ ...o }));
    w.orderIndex = shift ? remapOrderIndex(prevOrders, v.orders, w.orderIndex)
      : (w.orders.length ? w.orderIndex % w.orders.length : 0);
    resetUnbunch(w);
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
