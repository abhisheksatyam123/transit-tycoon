/**
 * Vehicle list "Group by" buckets (OpenTTD vehicle_gui.cpp GB_NONE / GB_SHARED_ORDERS / GB_GROUP and the
 * VehicleGroupLengthSorter / VehicleGroupTotalProfitThisYearSorter / VehicleGroupAverageProfit sorters).
 * Pure: no DOM, no game state. Input vehicles are expected already filtered and sorted; bucket members keep that order,
 * so the first member is the label vehicle.
 */

/** Group-by modes: [value, label]. */
export const GROUP_BY = [['none', 'None'], ['shared', 'Shared orders'], ['group', 'Group']];

/** Bucket sort keys: [key, label]. */
export const BUCKET_SORTS = [['count', 'Count'], ['total', 'Total profit this year'], ['avg', 'Average profit this year']];

/** Bucket key of a vehicle for a group-by mode (null for 'none': no buckets). */
function bucketKeyOf(v, by) {
  if (by === 'shared') return v.orderGroup != null ? `o:${v.orderGroup}` : `v:${v.id}`;
  if (by === 'group') return v.groupId == null ? 'none' : `g:${v.groupId}`;
  return null;
}

/**
 * Buckets for a group-by mode, in first-seen order. O(n): one Map pass.
 * shared: vehicles on the same order group (solo vehicles form a bucket of one); label = first member name + "(+N)".
 * group: one bucket per group; label = group name, 'Ungrouped' for no group (groups must be the company group list).
 * @param {any[]} vehicles
 * @param {{by?: string, groups?: {id:number,name:string}[]}} [opts]
 * @returns {{key:string, label:string, vehicles:any[], count:number, total:number, avg:number}[]}
 */
export function bucketVehicles(vehicles, opts = {}) {
  const { by = 'none', groups = [] } = opts;
  if (by !== 'shared' && by !== 'group') return [];
  const names = new Map();
  if (by === 'group') for (const g of groups) names.set(`g:${g.id}`, g.name);
  const map = new Map();
  for (const v of vehicles) {
    const key = bucketKeyOf(v, by);
    let b = map.get(key);
    if (!b) {
      b = { key, label: '', vehicles: [], count: 0, total: 0, avg: 0 };
      map.set(key, b);
    }
    b.vehicles.push(v);
    b.count++;
    b.total += Number(v.profitThisYear) || 0;
  }
  for (const b of map.values()) {
    if (by === 'shared') {
      const first = b.vehicles[0];
      const n = b.count - 1;
      b.label = (first.name || `#${first.id}`) + (n > 0 ? ` (+${n})` : '');
    } else {
      b.label = b.key === 'none' ? 'Ungrouped' : (names.get(b.key) ?? 'Group');
    }
    b.avg = b.count ? b.total / b.count : 0;
  }
  return [...map.values()];
}

/**
 * Sort buckets by count / total / avg profit (dir 1 ascending, -1 descending). Ties keep first-seen order.
 * Returns a new array.
 * @param {ReturnType<typeof bucketVehicles>} buckets
 * @param {{sort?: string, dir?: number}} [opts]
 */
export function sortBuckets(buckets, opts = {}) {
  const { sort = 'total', dir = 1 } = opts;
  const sign = dir < 0 ? -1 : 1;
  const k = sort === 'count' ? 'count' : sort === 'avg' ? 'avg' : 'total';
  return buckets
    .map((b, i) => ({ b, i }))
    .sort((x, y) => ((x.b[k] - y.b[k]) * sign) || (x.i - y.i))
    .map((r) => r.b);
}
