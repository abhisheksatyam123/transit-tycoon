/**
 * Vehicle list "Group by" buckets (OpenTTD vehicle_gui.cpp GB_NONE / GB_SHARED_ORDERS / GB_GROUP and the
 * VehicleGroupLengthSorter / VehicleGroupTotalProfitThisYearSorter / VehicleGroupAverageProfit sorters).
 * Pure: no DOM, no game state. Input vehicles are expected already filtered and sorted; bucket members keep that order,
 * so the first member is the label vehicle.
 */

/** Group-by modes: [value, label]. */
export const GROUP_BY = [['none', 'None'], ['shared', 'Shared orders'], ['group', 'Group']];

/** Bucket sort keys: [key, label]. */
export const BUCKET_SORTS = [['count', 'Count'], ['total', 'Total profit this year'], ['avg', 'Average profit this year'], ['length', 'Total length']];

/**
 * Current load of a vehicle in percent, OpenTTD CalcPercentVehicleFilled (vehicle.cpp:1505-1558):
 * amount = cargo on board (sum over all parts, TT keeps it in v.load.amount for plain and mixed consists),
 * capacity = total cargo capacity (v.capacity). A vehicle without capacity returns 100 (OpenTTD: "train without capacity").
 * Below 50% the percentage is rounded up (0% means really empty), at 50% or more it is rounded down
 * (100% means really full).
 * @param {any} v
 * @returns {number} 0..100 (integer)
 */
export function loadPercent(v) {
  const amount = Math.max(0, Number(v && v.load && v.load.amount) || 0);
  const capacity = Number(v && v.capacity) || 0;
  if (!(capacity > 0)) return 100;
  return amount * 2 < capacity ? Math.ceil(amount * 100 / capacity) : Math.floor(amount * 100 / capacity);
}

/**
 * Read-only group statistics, derived from the group's vehicles (OpenTTD group_gui.cpp WID_GL_INFO, group_gui.cpp:650-679):
 * profit this year = sum of GetDisplayProfitThisYear, profit last year = sum of GetDisplayProfitLastYear
 * (TT: v.profitThisYear / v.profitLastYear), occupancy = sum of each vehicle's load percent / vehicle count
 * (integer division, OpenTTD `occupancy / vehicle_count`). Empty group: all zero.
 * @param {any[]} vehicles
 * @returns {{count:number, profitThisYear:number, profitLastYear:number, occupancy:number}}
 */
export function groupStatistics(vehicles) {
  let profitThisYear = 0, profitLastYear = 0, occupancy = 0;
  const list = Array.isArray(vehicles) ? vehicles : [];
  for (const v of list) {
    profitThisYear += Number(v.profitThisYear) || 0;
    profitLastYear += Number(v.profitLastYear) || 0;
    occupancy += loadPercent(v);
  }
  return {
    count: list.length,
    profitThisYear,
    profitLastYear,
    occupancy: list.length ? Math.floor(occupancy / list.length) : 0,
  };
}

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
 * @returns {{key:string, label:string, vehicles:any[], count:number, total:number, avg:number, length:number, last:number, usage:number}[]}
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
      b = { key, label: '', vehicles: [], count: 0, total: 0, avg: 0, length: 0, last: 0, usage: 0, loadSum: 0 };
      map.set(key, b);
    }
    b.vehicles.push(v);
    b.count++;
    b.total += Number(v.profitThisYear) || 0;
    b.last += Number(v.profitLastYear) || 0;
    b.loadSum += loadPercent(v);
    b.length += Number(v.wagons) || 0;
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
    b.usage = b.count ? Math.floor(b.loadSum / b.count) : 0;
    delete b.loadSum;
  }
  return [...map.values()];
}

/**
 * Sort buckets by count / total / avg profit / total wagon length (dir 1 ascending, -1 descending). Ties keep first-seen order.
 * Returns a new array.
 * @param {ReturnType<typeof bucketVehicles>} buckets
 * @param {{sort?: string, dir?: number}} [opts]
 */
export function sortBuckets(buckets, opts = {}) {
  const { sort = 'total', dir = 1 } = opts;
  const sign = dir < 0 ? -1 : 1;
  const k = sort === 'count' ? 'count' : sort === 'avg' ? 'avg' : sort === 'length' ? 'length' : 'total';
  return buckets
    .map((b, i) => ({ b, i }))
    .sort((x, y) => ((x.b[k] - y.b[k]) * sign) || (x.i - y.i))
    .map((r) => r.b);
}
