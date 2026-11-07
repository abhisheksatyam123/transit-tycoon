/**
 * Unbunch depot order (OpenTTD OrderDepotActionFlag::Unbunch; vehicle.cpp LeaveUnbunchingDepot,
 * IsWaitingForUnbunching, round trip in the depot arrival; order_cmd.cpp validation rules).
 * A vehicle whose depot order has `unbunch` measures its round trip from its last departure there, then waits in
 * the depot until the next departure the shared group has spread to it. Lazy per-vehicle fields, present only on
 * vehicles that visited an unbunch order: ubLast (tick of its last departure), ubRound (smoothed round trip, ticks),
 * ubNext (tick the next shared departure is due), ubHold (waiting in the depot).
 */

/** An unbunch depot order (fixed or nearest depot). */
export function isUnbunchOrder(o) {
  return !!o && !!o.unbunch && (o.depotId != null || o.depot === 'nearest');
}

/** Per-order rule: an unbunch depot order cannot also be service-if-needed or stop-in-depot. */
export function unbunchOrderError(o) {
  if (o.serviceOnly) return 'Unbunch cannot be combined with service if needed';
  if (o.halt) return 'Unbunch cannot be combined with stop in depot';
  return null;
}

/**
 * Whole-list rules (order_cmd.cpp): one unbunch order at most; not with a full-load order or a conditional order.
 * Takes raw or normalised orders (`load`, legacy `full`, `cond`).
 * @returns {string|null} error message, or null when the list is fine
 */
export function unbunchListError(orders) {
  let n = 0, full = false, cond = false, first = null;
  for (const o of orders) {
    if (!o) continue;
    if (o.cond != null) { cond = true; continue; }
    if (isUnbunchOrder(o)) {
      n++;
      first = first || o;
      continue;
    }
    if (o.depotId != null || o.depot === 'nearest') continue;
    const load = o.load === undefined ? (o.full ? 'full' : 'normal') : o.load;
    if (load === 'full' || load === 'fullAny') full = true;
  }
  if (!n) return null;
  if (n > 1) return 'Only one unbunch order is allowed per order list';
  const own = unbunchOrderError(first);
  if (own) return own;
  if (full) return 'Unbunch cannot be combined with full load orders';
  if (cond) return 'Unbunch cannot be combined with conditional orders';
  return null;
}

/** The order before the vehicle's current one (the depot order, when the vehicle has just left a depot visit). */
export function prevIsUnbunch(v) {
  const n = v.orders.length;
  return n > 0 && isUnbunchOrder(v.orders[(v.orderIndex - 1 + n) % n]);
}

/** Round-trip measurement on arrival at an unbunch depot (vehicle.cpp: smoothed to [half, double] of the old value). */
export function unbunchArrive(state, v) {
  if (v.ubLast == null) return; // no departure recorded yet: first round trip not measurable
  const m = state.tick - v.ubLast;
  if (!v.ubRound) v.ubRound = m;
  else v.ubRound = Math.min(Math.max(m, Math.trunc(v.ubRound / 2)), v.ubRound * 2);
}

/** Still waiting in the depot: shared, more than one order, own unbunch order, next departure not yet due. */
export function unbunchWaits(state, v) {
  return v.orderGroup != null && v.orders.length > 1 && prevIsUnbunch(v) && v.ubNext != null && v.ubNext > state.tick;
}

/**
 * LeaveUnbunchingDepot: the vehicle leaves now; every non-stopped member of its shared group gets its next
 * departure at now + separation, separation = max(total round trip / n / n, 1) (OpenTTD integer arithmetic).
 */
export function unbunchDepart(state, v) {
  const now = state.tick;
  v.ubLast = now;
  const group = v.orderGroup != null ? state.vehicles.filter((w) => w.orderGroup === v.orderGroup && w.state !== 'stopped') : [v];
  const n = Math.max(group.length, 1);
  const total = group.reduce((s, w) => s + (w.ubRound || 0), 0);
  const sep = Math.max(Math.floor(total / (n * n)), 1);
  for (const w of group) w.ubNext = now + sep;
}

/** The order list changed: drop the round-trip data (OpenTTD ResetDepotUnbunching); a held vehicle is released by its tick. */
export function resetUnbunch(v) {
  if (v.ubLast === undefined && v.ubRound === undefined && v.ubNext === undefined) return;
  delete v.ubLast; delete v.ubRound; delete v.ubNext;
}

/**
 * Why row i of an order list cannot take the unbunch flag (null when it can). For the Orders window checkbox;
 * setOrders re-validates the same rules.
 */
export function unbunchBlockReason(orders, i) {
  const o = orders[i];
  if (!o || isUnbunchOrder(o)) return null; // already set: may always be cleared
  if (!(o.depotId != null || o.depot === 'nearest')) return 'Only go-to-depot orders can unbunch';
  const own = unbunchOrderError(o);
  if (own) return own;
  return unbunchListError(orders.map((x, k) => (k === i ? { ...x, unbunch: true } : x)));
}
