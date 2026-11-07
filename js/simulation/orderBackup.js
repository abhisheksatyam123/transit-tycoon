/**
 * Order backups (OpenTTD order_backup.cpp, simplified). Selling a vehicle from the depot window keeps
 * a backup of its orders keyed by depot (`state.orderBackups[depotId]`). Buying a compatible vehicle in
 * that depot restores it: shared orders re-join the original shared list when it still exists, otherwise
 * the orders are copied with stops/depots that no longer exist dropped. Lazy field: absent unless used.
 * OpenTTD keeps only the latest backup per user (OrderBackup::Backup deletes the user's others), so the
 * latest sell replaces any older backup in other depots too. Sell-all does not back up (depot_cmd).
 */
import { findStation, findDepot } from './state.js';
import { joinSharedOrders } from './sharedOrders.js';
import { stopKindFor } from './routing.js';
import { allocId } from './state.js';

/** Vehicle kind compatibility (OpenTTD: a backup restores to vehicles of the same kind). */
function kindKey(v) {
  return `${v.kind}:${stopKindFor(v)}`;
}

/** Record the backup of sold vehicle v (in depot v.depotId). Replaces any older backup. */
export function backupVehicleOrders(state, v) {
  if (v.depotId == null) return;
  const b = {
    kind: kindKey(v),
    name: v.name,
    groupId: v.groupId ?? null,
    serviceIntervalDays: v.serviceIntervalDays || 0,
    orders: v.orders.map((o) => ({ ...o })),
    orderIndex: v.orderIndex || 0,
    // OpenTTD clone: the other member of the shared list (restored by sharing with it while it exists)
    clone: v.orderGroup != null ? (state.vehicles.find((w) => w !== v && w.orderGroup === v.orderGroup) || { id: null }).id : null,
  };
  state.orderBackups = { [v.depotId]: b };
}

/**
 * Restore the backup of depot `depot` onto new vehicle v (called right after a player purchase).
 * Compatible kind only; the backup is consumed on restore. Returns true when restored.
 */
export function restoreVehicleOrders(state, depot, v, allocIdFn = (s) => allocId(s)) {
  const all = state.orderBackups;
  if (!all || !depot) return false;
  const b = all[depot.id];
  if (!b) return false;
  if (b.kind !== kindKey(v)) return false; // incompatible: keep the backup for a later purchase
  delete all[depot.id];
  if (!Object.keys(all).length) delete state.orderBackups;

  const sharer = b.clone != null ? state.vehicles.find((w) => w !== v && w.id === b.clone) : null;
  if (sharer) {
    // OpenTTD DoRestore: CO_SHARE with the surviving member; its orders are the shared list
    joinSharedOrders(state, v, sharer, allocIdFn);
    v.orders = sharer.orders.map((o) => ({ ...o }));
    v.orderIndex = Math.min(b.orderIndex, Math.max(0, v.orders.length - 1));
  } else {
    // copy the orders; drop the ones whose station or depot is gone (OpenTTD: removed stations are dropped)
    const orders = b.orders.filter((o) => {
      if (o.depot === 'nearest' && o.cond == null) return true; // resolved when current: no fixed depot to lose
      if (o.depotId != null && o.cond == null) return !!findDepot(state, o.depotId);
      if (o.cond != null) return true;
      return !!findStation(state, o.stationId);
    });
    if (orders.length) {
      v.orders = orders;
      v.orderIndex = Math.min(b.orderIndex, orders.length - 1);
    }
  }
  if (b.name && !state.vehicles.some((w) => w !== v && w.name === b.name)) v.name = b.name;
  if (b.groupId != null && state.company && state.company.groups && state.company.groups.some((g) => g.id === b.groupId)) v.groupId = b.groupId;
  if (b.serviceIntervalDays) v.serviceIntervalDays = b.serviceIntervalDays;
  return true;
}

/** Drop the backup kept for a removed depot (OpenTTD Depot::~Depot -> OrderBackup::Reset(tile)). */
export function clearDepotBackup(state, depotId) {
  if (!state.orderBackups) return;
  delete state.orderBackups[depotId];
  if (!Object.keys(state.orderBackups).length) delete state.orderBackups;
}
