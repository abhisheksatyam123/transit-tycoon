/**
 * Order progression and station loading / unloading.
 */
import { getTile } from './map.js';
import { TICKS_PER_DAY } from './constants.js';
import { getSetting } from './settings.js';
import { servicePerformed } from './service.js';
import { isHelicopter, airportTypeId } from './airportTypes.js';
import { HELI_PAD_TYPES } from './airportGround.js';
import { earn, noteRevenueKind, revenueKindOfModel } from './economy.js';
import { calculateDeliveredCargoPayment } from './loco/economy.js';
import { recordDelivery } from './loco/company.js';
import { companyOf, ownerMismatch, RIVAL_OWNED } from './owner.js';
import { CARGO_BY_ID } from '../config/cargos.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { findStation, findDepot, findIndustry, nearestTown } from './state.js';
import { refitCargos } from './refit.js';
import { normaliseCond } from './condOrders.js';
import { catchmentTiles, markPickup, takeWaiting, waitingAmount, addWaiting, recordCarrier } from './stations.js';
import { deliverToIndustry } from './industries.js';
import { clampCargoAgeOnPickup } from './loco/station.js';
import { recordTownDelivery } from './townGrowth.js';
import { vehicleModel } from './vehicles.js';
import { notify } from './news.js';
import { noteDelivery } from './goals.js';
import { subsidyMultiplier } from './subsidies.js';
import { MAX_WAITING } from './constants.js';
import { cdApplies, loadFilter, nextHops, noteLeg } from './cargodist.js';
import { stopKindOk, stationFitsVehicle, depotGoals } from './routing.js';
import { departureHoldUntil, timetableSeparationOn, timetableLatenessOn, timetableEstimatesOn, lateTicksOf, bookLateness, latenessWaitTicks } from './ttSchedule.js';
import { unbunchListError, unbunchOrderError } from './unbunch.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { updatePlatFit, loadingTicksFor } from './platformLength.js';
import { gradualLoadingOn, loadAmountFor, gradualWaitTicks, plainParts } from './gradualLoad.js';

/** OpenTTD feeder_payment_share (economy setting default 75%): share of a transfer leg's net income credited to the feeder. */
export const FEEDER_PAYMENT_SHARE = 75;

/** Ticks spent at a station before (re)trying to load and depart. */
export const LOAD_TICKS = 40;
/** Ticks between load attempts while waiting for a full load. */
export const FULL_LOAD_RETRY = 20;

/**
 * Order flags (OpenTTD order_type.h). Stored on an order only when non-default, so
 * existing saves stay identical: `full: true` (full load), `load: 'none'`, `unload: 'all'|'transfer'|'none'`.
 * All orders behave as OpenTTD non-stop orders (its default for new orders): arrival is only checked at the end
 * of the path against the current order's station, so vehicles never stop at intermediate stations.
 */
export const LOAD_MODES = ['normal', 'full', 'none', 'fullAny'];
export const UNLOAD_MODES = ['normal', 'all', 'transfer', 'none'];
/**
 * Stop modes (OpenTTD ONSF_*): absent / 'non' = non-stop (default, arrival checked at the order's station only),
 * 'all' = stop at every intermediate station of the company on the path (trains and road vehicles),
 * 'via' = go via the destination: pass through it, the order counts as reached without stopping.
 */
export const STOP_MODES = ['non', 'all', 'via'];
/**
 * Train stop location (OpenTTD OrderStopLocation, order_type.h): 'near' = near end, 'middle', 'far' = far end.
 * Lazy: absent = 'far' (the default, OTTD FarEnd); only train station orders keep it (routing.js trainStopPath).
 */
export const STOP_LOCATIONS = ['near', 'middle', 'far'];
export const STOP_AT = STOP_LOCATIONS;

/** Stop mode of an order ('non' when absent). */
export function stopMode(order) {
  return (order && order.stop) || 'non';
}

/** Load / unload rules of an intermediate stop (stop 'all'): normal loading and unloading, no order station. */
const INTERMEDIATE_ORDER = Object.freeze({ stationId: null, load: 'normal', unload: 'normal' });

/** The order whose rules apply at the vehicle's current stop (the intermediate rules while on one). */
export function effectiveOrder(v) {
  return v.intermediate ? INTERMEDIATE_ORDER : currentOrder(v);
}

/**
 * Go-to-depot order (OpenTTD OT_GOTO_DEPOT): { depotId } (a specific depot) or { depot: 'nearest' } (the closest
 * reachable depot of the vehicle's kind, resolved when the order becomes current). Flags: serviceOnly (service if
 * needed, else skipped), halt (stop in the depot; a later start continues with the next order), refit.
 */
export function isDepotOrder(o) {
  return !!o && (o.depotId != null || o.depot === 'nearest');
}

/** A go-to-depot order that targets the nearest depot (not a fixed one). */
export function isNearestDepotOrder(o) {
  return !!o && o.depot === 'nearest';
}

/** Effective unload mode of an order ('normal' when absent). */
export function unloadMode(order) {
  return (order && order.unload) || 'normal';
}

/** Short UI suffix describing non-default flags, e.g. " (full load)"; '' for normal orders. */
export function orderFlagText(o) {
  if (!o) return '';
  const parts = [];
  if (isDepotOrder(o)) { // go-to-depot order (see movement.js depotOrderVisit)
    if (o.serviceOnly) parts.push('service if needed');
    if (o.halt) parts.push('stop in depot');
    if (o.unbunch) parts.push('unbunch');
    if (o.refit) parts.push(`refit to ${cargoName(o.refit)}`);
    return parts.length ? ` (${parts.join(', ')})` : '';
  }
  if (o.full) parts.push('full load');
  if (o.load === 'fullAny') parts.push('full load any');
  if (o.load === 'none') parts.push('no loading');
  const stopLoc = o.stopLocation ?? o.stopAt;
  if (stopLoc === 'near') parts.push('stop at near end');
  else if (stopLoc === 'middle') parts.push('stop in middle');
  if (o.stop === 'all') parts.push('stop at all stations');
  else if (o.stop === 'via') parts.push('go via');
  if (o.unload === 'all') parts.push('unload all');
  else if (o.unload === 'transfer') parts.push('transfer');
  else if (o.unload === 'none') parts.push('no unloading');
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/**
 * Timetables (OpenTTD timetable, simplified). Per order, optional `waitDays` (minimum days to hold at
 * the station after arrival) and `travelDays` (scheduled days to reach it from the previous stop).
 * Per vehicle, lazy: `departTick` (tick it left its last stop, set only when the next order needs it),
 * `arriveTick` (tick it reached its current stop, only when that order needs it), `lateDays` (actual minus
 * scheduled travel, absent = on time; negative = early) and `autofill` / `autofillLeft` (record measured
 * times on each stop; switches off after one full round of orders).
 */
export function hasTimetable(o) {
  return !!o && (o.waitDays > 0 || o.travelDays > 0);
}

/** Set (or delete when value is undefined/0) timetable fields on order idx of v and its shared group. */
export function setOrderField(state, v, idx, patch) {
  const members = [v];
  if (v.orderGroup != null) for (const w of state.vehicles) if (w !== v && w.orderGroup === v.orderGroup) members.push(w);
  for (const w of members) {
    if (!w.orders[idx]) continue;
    const o = { ...w.orders[idx] };
    for (const k of Object.keys(patch)) {
      if (patch[k] > 0) o[k] = patch[k];
      else delete o[k];
    }
    w.orders[idx] = o;
  }
}

/**
 * Number of distinct stations in a vehicle's orders. A full-load order needs at least 2 (OpenTTD-style: a
 * single-station route cannot wait for cargo that only it could deliver), so with fewer the vehicle departs.
 */
export function distinctOrderStations(v) {
  return new Set(v.orders.filter((o) => !isDepotOrder(o) && !o.cond).map((o) => o.stationId)).size;
}

/**
 * Identity of an order for "same order, changed flags" detection: kind plus target, including the full
 * conditional payload. Flags, load/unload modes and timetable fields are not part of it.
 */
export function orderIdentity(o) {
  if (!o) return null;
  if (o.cond != null) return `c:${o.cond.v}:${o.cond.cmp}:${o.cond.val}:${o.cond.to}`;
  if (o.depotId != null) return `d:${o.depotId}`;
  if (o.depot === 'nearest') return 'dn';
  return `s:${o.stationId}`;
}

/**
 * Coarse slot identity for aligning two versions of an order list: conditionals compare only as a slot
 * (their `to` target may legitimately be renumbered by an edit).
 */
export function orderSlot(o) {
  if (!o) return null;
  if (o.cond != null) return 'c';
  if (o.depotId != null) return `d:${o.depotId}`;
  if (o.depot === 'nearest') return 'dn';
  return `s:${o.stationId}`;
}

/** Current order of a vehicle or null. */
export function currentOrder(v) {
  return v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
}

/** Advance to the next order (wrapping). */
export function advanceOrder(v) {
  if (v.orders.length) v.orderIndex = (v.orderIndex + 1) % v.orders.length;
}

/**
 * Unload the vehicle's cargo at a station according to the current order's unload flag.
 * - normal: deliver and pay when the station accepts the cargo (default).
 * - all: deliver and pay when accepted; otherwise the cargo is moved to the station as waiting cargo.
 * - transfer: move the cargo to the station as waiting cargo for another vehicle; no cash payment here.
 *   The vehicle gets a virtual transfer credit (OpenTTD CargoPayment::PayTransfer, see transferCredit()); the
 *   packet keeps its origin, start tick and accumulated feeder share, so the final delivery pays the full trip.
 * - none: keep the cargo aboard.
 * Cargo that the station cannot hold (MAX_WAITING) stays aboard.
 * @returns {number} cash income earned (transfer credits are not cash)
 */
export function unload(ctx, v, st) {
  if (v.platFit != null && !v.consist) return inPlatform(v, () => unloadSlice(ctx, v, st));
  if (!v.consist) return unloadSlice(ctx, v, st);
  let income = 0;
  for (const s of cargoSlices(v)) income += inSlice(v, s.cargoId, s.capacity, () => unloadSlice(ctx, v, st));
  return income;
}

/** Mixed consists (v.consist): the wagons' cargo slices, one per cargo, with their total capacity. */
export function cargoSlices(v) {
  const out = [];
  const list = v.consist || [];
  for (const w of v.platFit != null ? list.slice(0, v.platFit) : list) { // mixed consist: wagons inside the platform only
    const s = out.find((x) => x.cargoId === w.cargoId);
    const cap = (MODEL_BY_ID[w.modelId] ? MODEL_BY_ID[w.modelId].capacity : 0);
    if (s) s.capacity += cap; else out.push({ cargoId: w.cargoId, capacity: cap });
  }
  return out;
}

/**
 * Mixed consists: run fn with v.load / v.cargoId / v.capacity set to one cargo slice (its packet is kept in
 * v.loads[cargo]), then restore the whole-train view and recount v.load.amount. Single-cargo trains never call this.
 */
function inSlice(v, cargoId, capacity, fn) {
  const whole = { load: v.load, cargoId: v.cargoId, capacity: v.capacity };
  v.loads = v.loads || {};
  const packet = v.loads[cargoId] || (v.loads[cargoId] = { amount: 0, sourceX: whole.load.sourceX, sourceY: whole.load.sourceY, sinceTick: whole.load.sinceTick, fromStationId: null });
  v.load = packet; v.cargoId = cargoId; v.capacity = capacity;
  try { return fn(); } finally {
    v.load = whole.load; v.cargoId = whole.cargoId; v.capacity = whole.capacity;
    syncLoad(v);
  }
}

/**
 * Platform length (OpenTTD): a train longer than its platform loads and unloads only the wagons inside it
 * (platformLength.js). v.platFit = wagons inside (absent = whole train). The engine carries no cargo, so the
 * inside share of a plain train is platFit / wagons of its load and capacity.
 */
function platCapacity(v) {
  return v.platFit == null || !v.wagons ? v.capacity : Math.floor(v.capacity * v.platFit / v.wagons);
}

/**
 * Run fn with only the inside share of a plain train's load visible (load.amount and load.dests cut to the
 * inside wagons, capacity to platCapacity). Afterwards the outside share is put back on the vehicle.
 */
function inPlatform(v, fn) {
  const load = v.load, whole = v.capacity;
  const total = load.amount;
  const inside = Math.min(total, platCapacity(v));
  const outside = total - inside;
  const dests = load.dests;
  let outDests = null;
  if (dests && outside > 0) {
    outDests = {};
    let left = inside;
    for (const k of Object.keys(dests)) {
      const keep = Math.min(dests[k] || 0, left);
      left -= keep;
      outDests[k] = (dests[k] || 0) - keep;
      dests[k] = keep;
    }
  }
  load.amount = inside;
  v.capacity = platCapacity(v);
  try { return fn(); } finally {
    v.capacity = whole;
    load.amount += outside;
    if (outDests) for (const k of Object.keys(outDests)) if (outDests[k] > 0) load.dests[k] = (load.dests[k] || 0) + outDests[k];
  }
}

/** Full load: a plain train is full at capacity; a mixed consist only when every cargo slice is full. */
export function isFull(v) {
  if (!v.consist) return v.load.amount >= platCapacity(v);
  return cargoSlices(v).every((s) => ((v.loads && v.loads[s.cargoId] && v.loads[s.cargoId].amount) || 0) >= s.capacity);
}

/** Full load any cargo (OpenTTD OLFB_FULL_LOAD_ANY): depart when any one cargo slice is full (single cargo = full). */
export function isFullAny(v) {
  if (!v.consist) return v.load.amount >= platCapacity(v);
  return cargoSlices(v).some((s) => s.capacity > 0 && ((v.loads && v.loads[s.cargoId] && v.loads[s.cargoId].amount) || 0) >= s.capacity);
}

/** Whole-train load amount of a mixed consist = sum of its cargo packets (drops empty packets). */
export function syncLoad(v) {
  if (!v.consist) return;
  let total = 0;
  for (const k of Object.keys(v.loads || {})) {
    const p = v.loads[k];
    if (!p || !(p.amount > 0)) { delete v.loads[k]; continue; }
    total += p.amount;
  }
  v.load.amount = total;
}

function unloadSlice(ctx, v, st) {
  const load = v.load;
  const mode = unloadMode(effectiveOrder(v));
  if (mode === 'none' || !load.amount || !v.cargoId) return 0;
  if (load.dests) return unloadDist(ctx, v, st, mode);
  const accepted = !!st.accepts[v.cargoId] && load.fromStationId !== st.id;
  if (mode === 'normal' || mode === 'all') {
    if (accepted) return deliverLoad(ctx, v, st);
    if (mode === 'normal') return 0;
  }
  if (load.fromStationId === st.id) return 0; // never dump cargo back where it was loaded
  transferUnits(ctx, v, st, Infinity, null);
  return 0;
}

/**
 * Move up to `want` units of the vehicle's load to the station as waiting cargo (optionally for a cargodist
 * destination). The packet keeps its feeder share and gains this leg's transfer credit (OpenTTD AddFeederShare).
 * @returns {number} units moved
 */
function transferUnits(ctx, v, st, want, dest) {
  const load = v.load;
  const amount = Math.min(load.amount, want, Math.max(0, MAX_WAITING - waitingAmount(st, v.cargoId)));
  if (amount <= 0) return 0;
  const held = load.feeder || 0;
  const feederOut = held && amount < load.amount ? Math.round((held * amount) / load.amount) : held;
  const credit = transferCredit(ctx.state, v, st, amount, feederOut);
  // OpenLoco VehicleHead.cpp:3202-3210: cargo transfer merge enrouteAge
  const transitDays = Math.floor((ctx.state.tick - load.sinceTick) / TICKS_PER_DAY);
  const prevWaiting = waitingAmount(st, v.cargoId);
  // the packet keeps its feeder share and gains this leg's transfer credit (OpenTTD AddFeederShare(profit))
  const moved = addWaiting(st, v.cargoId, amount, load.sourceX, load.sourceY, load.sinceTick, MAX_WAITING, feederOut + credit, dest, undefined, true);
  if (moved > 0) {
    st.cargoAge = st.cargoAge || {};
    if (prevWaiting > 0) {
      const curAge = st.cargoAge[v.cargoId] || 0;
      const totalUnits = prevWaiting + moved;
      st.cargoAge[v.cargoId] = Math.min(255, Math.round((curAge * prevWaiting + transitDays * moved) / totalUnits));
    } else {
      st.cargoAge[v.cargoId] = Math.min(255, transitDays);
    }
  }
  if (credit) {
    v.profitThisYear = (v.profitThisYear || 0) + credit;
    v.transferCredits = (v.transferCredits || 0) + credit; // lazy: shown in the vehicle window, reset yearly
    ctx.emit && ctx.emit('transfer', { amount: credit, x: st.x, y: st.y, vehicleId: v.id, cargoId: v.cargoId, units: moved });
  }
  load.amount -= moved;
  if (held) {
    load.feeder = held - feederOut;
    if (!load.feeder) delete load.feeder;
  }
  if (load.amount <= 0) { load.amount = 0; load.fromStationId = null; delete load.feeder; }
  return moved;
}

/** Stop the vehicle's next station: the pending order for an intermediate stop, else the order after the current one. */
export function vehicleNextStop(v) {
  const n = v.orders ? v.orders.length : 0;
  if (!n) return null;
  if (v.intermediate) { const o = currentOrder(v); return o ? o.stationId : null; }
  const o = v.orders[(v.orderIndex + 1) % n];
  return o ? o.stationId : null;
}

/** Remove `n` units from the cargodist destination bucket `key` ('u' = no destination). Lazy: load.dests. */
function takeDests(load, key, n) {
  if (!n || !load.dests) return;
  load.dests[key] = (load.dests[key] || 0) - n;
  if (load.dests[key] <= 0) delete load.dests[key];
  if (!Object.keys(load.dests).length) delete load.dests;
}

/**
 * Cargodist unload (setting cargodist on; the load carries destinations, load.dests):
 * - parcels destined for this station are delivered when it accepts the cargo (normal / all);
 * - parcels whose next hop from here is not the vehicle's next stop are transferred to the station;
 * - the rest (next hop = the vehicle's next stop, or no route known) stay aboard.
 * Unrouted units ('u') follow the classic rules.
 */
function unloadDist(ctx, v, st, mode) {
  const { state } = ctx;
  const load = v.load;
  const cargo = v.cargoId;
  const nxt = vehicleNextStop(v);
  const nxtId = nxt === st.id ? null : nxt;
  const hereKey = String(st.id);
  const accepted = !!st.accepts[cargo] && load.fromStationId !== st.id;
  const dropAll = mode === 'transfer' || mode === 'all';
  let income = 0;
  if (accepted && (mode === 'normal' || mode === 'all')) {
    const here = load.dests[hereKey] || 0, unrouted = load.dests.u || 0;
    if (here + unrouted > 0) income += deliverPart(ctx, v, st, here + unrouted, [[hereKey, here], ['u', unrouted]]);
  }
  if (!(load.amount > 0)) { delete load.dests; return income; }
  if (load.fromStationId === st.id) return income; // never dump cargo back where it was loaded
  for (const k of Object.keys(load.dests || {})) {
    if (!load.dests || !(load.dests[k] > 0) || !(load.amount > 0)) continue;
    if (k === 'u') {
      if (dropAll) takeDests(load, 'u', transferUnits(ctx, v, st, load.dests.u, null));
      continue;
    }
    const d = Number(k);
    if (d === st.id) { // destined here but not accepted: normal keeps it aboard; transfer / all drop it unrouted
      if (!dropAll) continue;
      takeDests(load, k, transferUnits(ctx, v, st, load.dests[k], null));
      continue;
    }
    if (!dropAll) {
      const hs = nextHops(state, cargo, st.id, d);
      if (hs === undefined || (nxtId != null && hs.includes(nxtId))) continue; // next hop is the vehicle's next stop (or unknown): stays aboard
    }
    takeDests(load, k, transferUnits(ctx, v, st, load.dests[k], d));
  }
  if (!(load.amount > 0)) delete load.dests;
  return income;
}

/**
 * Deliver `n` units of the load here, keeping the rest aboard with its feeder share and origin.
 * `keys` ([[bucket, units]]) are removed from load.dests.
 */
function deliverPart(ctx, v, st, n, keys) {
  const load = v.load;
  const whole = load.amount, feeder = load.feeder || 0, from = load.fromStationId;
  const fPart = feeder && n < whole ? Math.round((feeder * n) / whole) : feeder;
  load.amount = n;
  if (fPart) load.feeder = fPart; else delete load.feeder;
  const pay = deliverLoad(ctx, v, st); // clears amount, origin and feeder
  for (const [k, a] of keys) takeDests(load, k, a);
  const rem = whole - n;
  if (rem > 0) {
    load.amount = rem;
    load.fromStationId = from;
    if (feeder - fPart) load.feeder = feeder - fPart;
  }
  return pay;
}

/** OpenTTD Ticks::CARGO_AGING_TICKS (185) in OpenTTD day ticks (74 per day) = 2.5 days per cargo aging period. */
export const CARGO_AGE_PERIOD_DAYS = 185 / 74;

/**
 * Payment distance in whole tiles (RX2b, OpenLoco VehicleHead.cpp:3118 `Math::Vector::distance2D(stationLoc, sourceLoc) / 32`):
 * Euclidean between source and delivery station, truncated. OpenLoco's distance2D is a fastSquareRoot table
 * approximation; the exact floor(sqrt) is used. Computed only on delivery / transfer, never per tick.
 */
export function paymentDistance(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.floor(Math.sqrt(dx * dx + dy * dy));
}

/**
 * Days the packet has been in transit for payment (OpenTTD CargoList::AgeCargo + GetTransportedGoodsIncome).
 * Default: continuous days since pickup. With setting cargoAgeInVehicle (OpenTTD cargo aging): the age advances
 * only in whole 2.5-day periods, so the payment uses floor(days / 2.5) * 2.5. Computed from the pickup tick,
 * no per-tick work.
 */
export function transitDays(state, load) {
  const days = (state.tick - load.sinceTick) / TICKS_PER_DAY;
  if (!getSetting(state, 'cargoAgeInVehicle')) return days;
  return Math.floor(days / CARGO_AGE_PERIOD_DAYS) * CARGO_AGE_PERIOD_DAYS;
}

/**
 * OpenTTD CargoPayment::PayTransfer: the feeder vehicle is credited the income of its leg (source to this station,
 * distance and days so far) minus the feeder share the units already hold, times FEEDER_PAYMENT_SHARE percent.
 * The credit is virtual: it goes into the vehicle's profit and the packet's feeder share, never into company cash.
 * @returns {number} credit (integer money)
 */
export function transferCredit(state, v, st, amount, feederOfAmount) {
  const share = getSetting(state, 'feederPaymentShare');
  const load = v.load;
  const dist = paymentDistance(load.sourceX, load.sourceY, st.x, st.y);
  const days = transitDays(state, load);
  const income = calculateDeliveredCargoPayment(state, v.cargoId, amount, dist, days);
  return Math.round(((income - feederOfAmount) * share) / 100);
}

/** Pay for and deliver the vehicle's cargo to an accepting station (the original unload path). */
function deliverLoad(ctx, v, st) {
  const { state } = ctx;
  const load = v.load;
  const dist = paymentDistance(load.sourceX, load.sourceY, st.x, st.y);
  const days = transitDays(state, load);
  let pay = calculateDeliveredCargoPayment(state, v.cargoId, load.amount, dist, days);
  const mult = subsidyMultiplier(state, v.cargoId, load.sourceX, load.sourceY, st, ctx);
  if (mult !== 1) pay = Math.round(pay * mult);
  const payee = companyOf(state, v);
  recordDelivery(payee, v.cargoId, load.amount, dist);
  if (getSetting(state, 'townGrowthModel') === 'ottd') st.lastUnload = state.tick; // OTTD time_since_unload (tt: no write)
  if (st.ownerId != null) st.delivered = 1; // rival stations only (player stations never use it); OL StationFlags::flag_8 (VehicleHead.cpp:3134): lifts the rival rating override
  const acceptingInd = creditDelivery(state, st, v.cargoId, load.amount);
  noteFirstDelivery(ctx, state, st, v.cargoId, acceptingInd);
  noteDelivery(state, v.cargoId, load.amount, v.id);
  const amount = load.amount;
  load.amount = 0;
  load.fromStationId = null;
  // OpenTTD: the company is paid the full trip income; the delivering vehicle keeps income minus the feeder share
  // already credited to earlier transfer vehicles, so vehicle profits add up to the payment.
  const feeder = load.feeder || 0;
  delete load.feeder;
  if (pay > 0) {
    earn(payee, pay);
    // D7 Phase 2: attribute the full payment (not pay - feeder) to the unloading vehicle's model kind, so the
    // per-kind sums equal the month's income. Player-only (rival ledgers stay untouched); sparse: creates
    // ledger.current.byKind only on the first payment.
    if (payee === state.company) noteRevenueKind(payee, revenueKindOfModel(vehicleModel(v)), pay);
    v.profitThisYear += pay - feeder;
    ctx.emit('income', { amount: pay, x: st.x, y: st.y, vehicleId: v.id, cargoId: v.cargoId, units: amount });
  }
  return pay;
}

/** Hand delivered cargo to an accepting industry or the nearest town. */
function creditDelivery(state, st, cargoId, amount) {
  const seen = new Set();
  for (const p of catchmentTiles(state, st)) {
    const b = state.map.tiles[p.y * state.map.width + p.x].building;
    if (!b || b.type !== 'industry' || seen.has(b.industryId)) continue;
    seen.add(b.industryId);
    const ind = findIndustry(state, b.industryId);
    if (ind && INDUSTRY_BY_ID[ind.typeId].accepts.includes(cargoId)) {
      deliverToIndustry(ind, cargoId, amount);
      return ind;
    }
  }
  const town = nearestTown(state, st.x, st.y);
  if (town) recordTownDelivery(town, cargoId, amount, state);
  return null;
}

/**
 * OL VehicleHead::updateUnloadCargoComponent (VehicleHead.cpp:3145-3167): the first delivery of a cargo to an
 * industry posts workersCelebrate once per industry and cargo; the first delivery of a cargo to the station's town
 * posts citizensCelebrate once per town and cargo. Flags are per cargo (OL var_1A8 / history_min_production bits),
 * lazy on the town/industry records.
 */
export function noteFirstDelivery(ctx, state, st, cargoId, ind) {
  const cargo = CARGO_BY_ID[cargoId];
  const cargoName = cargo?.name || cargoId;
  if (ind) {
    ind.celebrated = ind.celebrated || {};
    if (!ind.celebrated[cargoId]) {
      ind.celebrated[cargoId] = true;
      notify(ctx, `Workers Celebrate! First ${cargoName} delivered to ${ind.name}!`, 'good', ind.x, ind.y, 'arrival');
    }
  }
  const town = nearestTown(state, st.x, st.y);
  if (!town) return;
  town.celebrated = town.celebrated || {};
  if (!town.celebrated[cargoId]) {
    town.celebrated[cargoId] = true;
    notify(ctx, `Citizens Celebrate! First ${cargoName} arrive in ${town.name}!`, 'good', st.x, st.y, 'arrival');
  }
}

/**
 * Load waiting cargo onto the vehicle; marks the station as picking up the cargo.
 * @returns {number} amount loaded
 */
export function loadCargo(ctx, v, st) {
  if (v.platFit != null && !v.consist) return inPlatform(v, () => loadSlice(ctx, v, st));
  if (!v.consist) return loadSlice(ctx, v, st);
  let got = 0;
  for (const s of cargoSlices(v)) got += inSlice(v, s.cargoId, s.capacity, () => loadSlice(ctx, v, st));
  return got;
}

/**
 * Run fn with only `keep` units of the packet visible: cargodist destinations and feeder credit are cut in step,
 * the rest stays aboard afterwards (as inPlatform does for the wagons outside the platform).
 * @returns {number} units fn removed from the cut (delivered or transferred)
 */
function cutLoad(v, keep, fn) {
  const load = v.load;
  const total = load.amount;
  if (keep >= total) { fn(); return total - load.amount; }
  const outside = total - keep;
  let outDests = null;
  if (load.dests) {
    outDests = {};
    let left = keep;
    for (const k of Object.keys(load.dests)) {
      const inK = Math.min(load.dests[k] || 0, left);
      left -= inK;
      outDests[k] = (load.dests[k] || 0) - inK;
      load.dests[k] = inK;
    }
  }
  const feeder = load.feeder || 0;
  const feederOut = feeder ? feeder - Math.round((feeder * keep) / total) : 0;
  if (feeder) load.feeder = feeder - feederOut;
  const from = load.fromStationId;
  let removed = 0;
  load.amount = keep;
  try { fn(); } finally {
    removed = keep - load.amount;
    load.amount += outside;
    if (outDests) {
      const cur = load.dests || {};
      for (const k of Object.keys(outDests)) if (outDests[k] > 0) cur[k] = (cur[k] || 0) + outDests[k];
      if (Object.keys(cur).length) load.dests = cur; else delete load.dests;
    }
    if (feederOut) { load.feeder = (load.feeder || 0) + feederOut; if (!load.feeder) delete load.feeder; }
    if (load.amount > 0 && !load.fromStationId) load.fromStationId = from;
  }
  return removed;
}

/** One gradual unloading cycle at st: at most the allowance (loadAmountFor x parts) is unloaded. */
function cutUnload(ctx, v, st, budget) {
  if (!(budget > 0) || !(v.load.amount > 0) || !v.cargoId) return { took: 0, filled: false };
  const took = cutLoad(v, budget, () => unloadSlice(ctx, v, st));
  // filled: the cycle used its whole allowance and cargo is still aboard (more may be unloadable)
  return { took, filled: took >= budget && v.load.amount > 0 };
}

/**
 * Gradual unloading cycle (order.gradual_loading, OpenTTD economy.cpp LoadUnloadVehicle: amount_unloaded =
 * min(count, load amount)). Each part unloads at most its allowance; each slice is delivered and paid as it goes.
 * @returns {{took:number, filled:boolean}} filled = the cycle used its whole allowance (unload again).
 */
export function unloadCargoCycle(ctx, v, st) {
  if (!v.consist) {
    const budget = loadAmountFor(v, v.cargoId) * plainParts(v);
    return v.platFit != null ? inPlatform(v, () => cutUnload(ctx, v, st, budget)) : cutUnload(ctx, v, st, budget);
  }
  const out = { took: 0, filled: false };
  for (const s of cycleSlices(v)) {
    const r = inSlice(v, s.cargoId, s.capacity, () => cutUnload(ctx, v, st, loadAmountFor(v, s.cargoId) * s.parts));
    out.took += r.took;
    out.filled = out.filled || r.filled;
  }
  return out;
}

/**
 * Gradual loading cycle (order.gradual_loading, gradualLoad.js). Each cargo-carrying part takes at most its load
 * amount: the allowance is loadAmountFor x parts (mixed consist: per cargo slice, its wagons).
 * @returns {{got:number, filled:boolean, held:boolean}} filled = a slice reached its allowance (keep cycling);
 *   held = improved load gave a slice to an earlier arrival (keep cycling while it loads).
 */
export function loadCargoCycle(ctx, v, st) {
  const cyc = { limit: 0, got: 0, filled: false, held: false };
  if (!v.consist) {
    cyc.limit = loadAmountFor(v, v.cargoId) * plainParts(v);
    cyc.got = v.platFit != null ? inPlatform(v, () => loadSlice(ctx, v, st, cyc)) : loadSlice(ctx, v, st, cyc);
    return cyc;
  }
  for (const s of cycleSlices(v)) {
    cyc.limit = loadAmountFor(v, s.cargoId) * s.parts;
    cyc.got += inSlice(v, s.cargoId, s.capacity, () => loadSlice(ctx, v, st, cyc));
  }
  return cyc;
}

/** Mixed consist: cargo slices with the number of cargo-carrying wagons of each (inside the platform when cut). */
function cycleSlices(v) {
  const out = [];
  const list = v.platFit != null ? v.consist.slice(0, v.platFit) : v.consist;
  for (const w of list) {
    const cap = MODEL_BY_ID[w.modelId] ? MODEL_BY_ID[w.modelId].capacity : 0;
    if (!(cap > 0)) continue;
    const s = out.find((x) => x.cargoId === w.cargoId);
    if (s) { s.parts++; s.capacity += cap; } else out.push({ cargoId: w.cargoId, parts: 1, capacity: cap });
  }
  return out;
}

/** typeAgeMap key of a vehicle: rail (engine), bus, tram, truck (other road), aircraft, ship. */
function pickupAgeType(v) {
  if (v.kind === 'train') return 'rail';
  if (v.kind === 'aircraft') return 'aircraft';
  if (v.kind === 'ship') return 'ship';
  return v.roadType === 'bus' ? 'bus' : v.roadType === 'tram' ? 'tram' : 'truck';
}

/**
 * OpenTTD order.improved_load (economy.cpp ReserveConsist): cargo at a station goes to the vehicles that arrived
 * first. Simplified in TT: a vehicle yields this loading step while another vehicle at the same station, loading
 * the same cargo, arrived earlier (ties by vehicle id) and still has room and wants to load. Cargodist parcels are
 * not ranked. Vehicles without an arrival stamp (saved before the setting was on) rank last.
 */
function outrankedAtStation(state, v, st) {
  const mine = v.atStationSince ?? Infinity;
  for (const w of state.vehicles) {
    if (w === v || w.state !== 'loading' || w.atStationId !== st.id || w.cargoId !== v.cargoId) continue;
    if (!(w.capacity - (w.load ? w.load.amount : 0) > 0)) continue;
    const rw = w.atStationSince ?? Infinity;
    if (!(rw < mine || (rw === mine && w.id < v.id))) continue;
    const o = effectiveOrder(w);
    const dropped = o && (o.unload === 'transfer' || o.unload === 'all');
    if (o && (o.load === 'none' || dropped)) continue; // this one does not load here
    return true;
  }
  return false;
}

/**
 * Load one cargo slice of v at st. `cyc` (gradual loading cycle, see loadCargoCycle) caps the take at
 * cyc.limit and records whether the take reached that allowance (cyc.filled) or was held back by improved
 * load (cyc.held). Absent = the whole room, as before.
 */
function loadSlice(ctx, v, st, cyc) {
  const { state } = ctx;
  if (!v.cargoId || v.capacity <= 0) return 0;
  const model = vehicleModel(v);
  markPickup(state, st, v.cargoId, model ? model.speed : 0);
  const room = v.capacity - v.load.amount;
  if (room <= 0) return 0;
  clampCargoAgeOnPickup(st, v.cargoId, pickupAgeType(v));
  if (waitingAmount(st, v.cargoId) <= 0) return 0;
  // cargodist: only parcels whose next hop is the vehicle's next stop (or with no route known)
  const cd = cdApplies(state, v.cargoId);
  if (!cd && getSetting(state, 'improvedLoad') && outrankedAtStation(state, v, st)) { // an earlier arrival is loading this cargo
    if (cyc) cyc.held = true;
    return 0;
  }
  const allowance = cyc ? Math.min(room, cyc.limit) : room;
  if (allowance <= 0) return 0;
  const pred = cd ? loadFilter(state, st, v.cargoId, vehicleNextStop(v)) : undefined;
  const got = takeWaiting(st, v.cargoId, allowance, pred, state.tick);
  if (got.amount <= 0) return 0;
  if (cyc && got.amount >= allowance) cyc.filled = true;
  if (st.ownerId != null) st.pickedUp = 1; // rival stations only (player stations never use it); OL StationFlags::flag_7 (VehicleHead.cpp:3464): lifts the rival rating override
  recordCarrier(st, v.cargoId, model ? model.speed : 0, v.age || 0);
  const l = v.load;
  if (cd || l.dests) {
    l.dests = l.dests || {};
    for (const k of Object.keys(got.dests || { u: got.amount })) l.dests[k] = (l.dests[k] || 0) + (got.dests ? got.dests[k] : got.amount);
  }
  const total = l.amount + got.amount;
  l.sourceX = Math.round((l.sourceX * l.amount + got.sourceX * got.amount) / total);
  l.sourceY = Math.round((l.sourceY * l.amount + got.sourceY * got.amount) / total);
  l.sinceTick = Math.round((l.sinceTick * l.amount + got.sinceTick * got.amount) / total);
  l.amount = total;
  if (got.feeder) l.feeder = (l.feeder || 0) + got.feeder;
  l.fromStationId = st.id;
  return got.amount;
}

/**
 * Handle arrival of a vehicle at its order's station: news, unload, start loading.
 */
export function arriveAtStation(ctx, v, st, intermediate = false) {
  const { state } = ctx;
  const key = v.kind === 'train' ? 'train' : v.kind === 'aircraft' ? 'air' : v.kind === 'ship' ? 'ship' : 'road';
  // The per-vehicle-kind 'Citizens celebrate' news was not an OpenLoco message: OL celebrates the first delivery
  // of each cargo (noteFirstDelivery). st.arrived is kept for its existing readers.
  if (!st.arrived[key]) st.arrived[key] = true;
  ctx.emit('vehicleArrived', { vehicle: v, station: st });
  v.state = 'loading';
  v.speed = 0;
  v.atStationId = st.id;
  if (getSetting(state, 'improvedLoad')) v.atStationSince = state.tick; // improved load: arrival order (absent when off)
  if (intermediate) v.intermediate = true; // stop 'all': an intermediate stop, the order does not advance on departure
  else delete v.intermediate;
  updatePlatFit(state, v, st); // platformLength setting: wagons that fit the platform (absent when all fit)
  if (getSetting(state, 'serviceAtHelipad') && onHelipad(state, v)) servicePerformed(state, v); // order.serviceathelipad
  if (gradualLoadingOn(state)) v.unloadPending = true; // gradual loading: unloaded in cycles by loadingTick
  else unload(ctx, v, st);
  v.loadingTicks = loadingTicksFor(state, v, st, LOAD_TICKS); // station_length_loading_penalty (off = LOAD_TICKS)
  if (!intermediate) recordArrival(ctx, v, currentOrder(v));
}

/** Timetable bookkeeping on arrival: arrival tick, lateness, autofill of the travel time. */
function recordArrival(ctx, v, order) {
  const { state } = ctx;
  if (!order) return;
  const latenessOn = timetableLatenessOn(state);
  const estimatesOn = timetableEstimatesOn(state);
  if (latenessOn || estimatesOn || order.waitDays > 0 || v.autofill || (v.orderGroup != null && timetableSeparationOn(state))) v.arriveTick = state.tick;
  else delete v.arriveTick;
  // Timetable start date (OpenTTD timetable_cmd.cpp:485-501): the first arrival at the first order seeds the
  // lateness counter from the start tick and consumes it. The first round does not measure (:516).
  if (latenessOn && !v.ttStarted && v.ttStart != null && v.orderIndex % v.orders.length === 0) {
    const seeded = Math.max(0, state.tick - v.ttStart);
    if (seeded) v.lateTicks = seeded; else delete v.lateTicks;
    delete v.ttStart;
    v.ttStarted = true;
    const d = Math.round(seeded / TICKS_PER_DAY);
    if (d) v.lateDays = d; else delete v.lateDays;
    return;
  }
  if (v.departTick == null || !(order.travelDays > 0 || v.autofill || estimatesOn)) return;
  const idx = v.orderIndex % v.orders.length;
  const actualTicks = state.tick - v.departTick;
  const actual = Math.round(actualTicks / TICKS_PER_DAY);
  let scheduled = order.travelDays || 0;
  if (v.autofill) {
    scheduled = Math.max(1, actual);
    setOrderField(state, v, idx, { travelDays: scheduled });
  } else if (estimatesOn && !(order.travelDays > 0)) {
    // G3: measured travel estimate, display-only (never used for holds or lateness; lazy, absent when 0)
    setOrderField(state, v, idx, { estTravelDays: actual });
  }
  // estimate-only leg: no timetabled travel, so no lateness or legacy lateDays booking (OpenTTD :554)
  if (!(order.travelDays > 0 || v.autofill)) return;
  if (latenessOn) {
    bookLateness(v, actualTicks - scheduled * TICKS_PER_DAY, v.orders);
    return;
  }
  const late = actual - scheduled;
  if (late) v.lateDays = late;
  else delete v.lateDays;
}

/**
 * One loading tick. Returns true when the vehicle is ready to depart.
 */
export function loadingTick(ctx, v) {
  const { state } = ctx;
  const st = findStation(state, v.atStationId);
  if (!st) return true;
  if (--v.loadingTicks > 0) return false;
  const order = effectiveOrder(v);
  // no loading when told so, and no reloading of cargo just dropped here (transfer / unload all)
  const dropped = order && (order.unload === 'transfer' || order.unload === 'all');
  let unl = null;
  if (v.unloadPending) {
    if (gradualLoadingOn(state)) {
      unl = unloadCargoCycle(ctx, v, st);
      if (!unl.filled) delete v.unloadPending; // this stop's unloading is done
    } else { // the setting was switched off during the stop: finish the unload in one step
      delete v.unloadPending;
      unload(ctx, v, st);
    }
  }
  let cyc = null;
  if (!order || (order.load !== 'none' && !dropped)) {
    if (gradualLoadingOn(state)) cyc = loadCargoCycle(ctx, v, st);
    else loadCargo(ctx, v, st);
  }
  // gradual loading: keep cycling while a part filled its allowance or improved load holds it back
  if ((unl && unl.filled) || (cyc && (cyc.filled || cyc.held))) {
    v.loadingTicks = gradualCycleWait(state, v, st);
    return false;
  }
  // a cycle that moved cargo waits one gradual cycle before the next try; otherwise the usual retry
  const moved = (unl && unl.took > 0) || (cyc && cyc.got > 0);
  const retry = moved ? gradualCycleWait(state, v, st) : FULL_LOAD_RETRY;
  const fullMode = order && (order.full || order.load === 'fullAny');
  if (fullMode && order.load !== 'none' && order.unload !== 'transfer' && order.unload !== 'all'
    && order.stationId === st.id && !(order.load === 'fullAny' ? isFullAny(v) : isFull(v)) && distinctOrderStations(v) >= 2) {
    v.loadingTicks = retry;
    return false;
  }
  // timetable: hold until the timetabled wait since arrival has passed (lateness reduces it: OpenTTD
  // vehicle.cpp:2458 max(timetabled wait - lateness, 0); the off path is the plain minimum wait)
  if (order && v.arriveTick != null) {
    const target = timetableLatenessOn(state) ? latenessWaitTicks(v, order)
      : (order.waitDays > 0 ? order.waitDays * TICKS_PER_DAY : 0);
    if (target > 0 && state.tick - v.arriveTick < target) {
      v.loadingTicks = retry;
      return false;
    }
  }
  // timetable start date and separation: hold until the departure slot (lazy; absent = no hold)
  if (order && !v.intermediate && (v.ttStart != null || v.orderGroup != null)) {
    const hold = departureHoldUntil(state, v, v.orderIndex % v.orders.length);
    if (hold != null && state.tick < hold) {
      v.loadingTicks = retry;
      return false;
    }
  }
  if (v.platFit !== undefined) delete v.platFit;
  if (!v.intermediate) recordDeparture(ctx, v, order); // timetable and order advance belong to the order's own stop
  noteDepartureLeg(state, v); // cargodist link graph (no-op when the setting is off)
  return true;
}

/** A helicopter standing on a helipad of a heliport-type airport (OpenTTD serviceathelipad, aircraft_cmd.cpp:1583). */
function onHelipad(state, v) {
  if (!isHelicopter(v) || v.tx == null) return false;
  const b = getTile(state.map, v.tx, v.ty).building;
  return !!b && b.type === 'station' && b.part === 'helipad' && HELI_PAD_TYPES.has(airportTypeId(b));
}

/** Wait before the next gradual cycle (OpenTTD wait per class, with the station length penalty). */
function gradualCycleWait(state, v, st) {
  return loadingTicksFor(state, v, st, gradualWaitTicks(v));
}

/** Bookkeeping when a vehicle leaves its stop: autofill waiting time, autofill round, departure tick. */
function recordDeparture(ctx, v, order) {
  const { state } = ctx;
  const n = v.orders.length;
  const idx = n ? v.orderIndex % n : 0;
  // Timetable lateness: book the completed station wait. Guard (OpenTTD timetable_cmd.cpp:554): an
  // untimetabled wait only counts while the vehicle is already late.
  if (timetableLatenessOn(state) && order && v.arriveTick != null
    && (order.waitDays > 0 || lateTicksOf(v) > 0)) {
    bookLateness(v, (state.tick - v.arriveTick) - (order.waitDays || 0) * TICKS_PER_DAY, v.orders);
  }
  if (order && v.arriveTick != null && timetableEstimatesOn(state) && !v.autofill && !(order.waitDays > 0)) {
    // G3: measured station-wait estimate, display-only (lazy, absent when 0)
    setOrderField(state, v, idx, { estWaitDays: Math.round((state.tick - v.arriveTick) / TICKS_PER_DAY) });
  }
  if (v.autofill && order && v.arriveTick != null) {
    const waited = Math.round((state.tick - v.arriveTick) / TICKS_PER_DAY);
    // G4: Ctrl-autofill "preserve wait" only lengthens an existing timetabled wait (OpenTTD :439-440)
    if (!(timetableEstimatesOn(state) && v.autofillPreserve && order.waitDays > waited)) {
      setOrderField(state, v, idx, { waitDays: waited });
    }
  }
  if (v.autofill) {
    v.autofillLeft = (v.autofillLeft || 0) - 1;
    if (v.autofillLeft <= 0) { delete v.autofill; delete v.autofillLeft; delete v.autofillPreserve; }
  }
  delete v.arriveTick;
  const next = n ? v.orders[(idx + 1) % n] : null;
  if (next && (next.travelDays > 0 || v.autofill || timetableEstimatesOn(state))) v.departTick = state.tick;
  else delete v.departTick;
}

/**
 * Validate and normalise an order list for a vehicle. Order flags are accepted as
 * `load` ('normal'|'full'|'none', or legacy `full` boolean) and `unload` (see UNLOAD_MODES);
 * only non-default flags are kept on the output orders.
 * @returns {{ok:true,orders:object[]}|{ok:false,error:string}}
 */
export function normaliseOrders(state, v, orders, kindOf) {
  if (!Array.isArray(orders)) return { ok: false, error: 'Orders must be an array' };
  if (orders.length > 16) return { ok: false, error: 'Too many orders' };
  const out = [];
  for (const o of orders) {
    if (o && o.cond != null) { // conditional order (condOrders.js): no station; target checked below
      // G7/G8: only the condition itself is kept - stray timetable times / speed limits are dropped here.
      const r = normaliseCond(o.cond);
      if (!r.ok) return r;
      out.push(r.entry);
      continue;
    }
    if (isDepotOrder(o)) { // go-to-depot order: no station; optional service-if-needed, halt and refit
      const r = normaliseDepotOrder(state, v, o);
      if (!r.ok) return r;
      out.push(r.entry);
      continue;
    }
    const st = o && findStation(state, o.stationId);
    if (!st) return { ok: false, error: 'Unknown station in orders' };
    const kind = kindOf(v);
    const waypoint = st.tiles.length > 0 && (kind === 'rail' ? st.tiles.every((t) => t.kind === 'waypoint' && !t.road)
      : (kind === 'bus' || kind === 'truck') && st.tiles.every((t) => t.kind === 'waypoint' && !!t.road));
    const hasStop = kind === 'ship' ? st.tiles.some((t) => t.kind === 'dock' || t.kind === 'buoy')
      : waypoint || st.tiles.some((t) => stopKindOk(v, t.kind));
    if (!hasStop) {
      return { ok: false, error: `${st.name} has no ${kind === 'rail' ? 'rail platform' : kind === 'ship' ? 'dock or buoy' : kind + ' stop'}` };
    }
    // a vehicle orders only its own company's stations (a rival's stop/airport is refused to the player)
    if (ownerMismatch(st, { owner: v.ownerId ?? null })) return { ok: false, error: RIVAL_OWNED };
    if (!stationFitsVehicle(state, st, v)) {
      return { ok: false, error: `${st.name} cannot take this aircraft (planes need an airport, small airports only take small planes)` };
    }
    // a rail waypoint is always a go-via order (OpenTTD: waypoints are passed, never stopped at)
    const stop = waypoint ? 'via' : (o.stop === undefined || o.stop === 'non' ? undefined : o.stop);
    if (stop !== undefined && !STOP_MODES.includes(stop)) return { ok: false, error: `Unknown stop mode ${stop}` };
    if (stop !== undefined && v.kind !== 'train' && v.kind !== 'road') return { ok: false, error: 'Only trains and road vehicles can stop at intermediate stations' };
    const load = o.load === undefined ? (o.full ? 'full' : 'normal') : o.load;
    const unload = o.unload === undefined ? 'normal' : o.unload;
    if (!LOAD_MODES.includes(load)) return { ok: false, error: `Unknown load mode ${load}` };
    if (!UNLOAD_MODES.includes(unload)) return { ok: false, error: `Unknown unload mode ${unload}` };
    const entry = { stationId: st.id, full: load === 'full' };
    if (load === 'none') entry.load = 'none';
    else if (load === 'fullAny') entry.load = 'fullAny';
    if (unload !== 'normal') entry.unload = unload;
    if (o.waitDays > 0) entry.waitDays = o.waitDays;
    if (o.travelDays > 0) entry.travelDays = o.travelDays;
    // G8: aircraft speed limits are refused (OpenTTD): do not keep one through normalisation
    if (o.maxSpeed > 0 && v.kind !== 'aircraft') entry.maxSpeed = Math.round(o.maxSpeed);
    if (stop !== undefined) entry.stop = stop;
    const stopLocation = o.stopLocation !== undefined ? o.stopLocation : o.stopAt;
    if (stopLocation !== undefined) {
      if (!STOP_LOCATIONS.includes(stopLocation)) return { ok: false, error: `Unknown stop location ${stopLocation}` };
      if (kind !== 'rail' || waypoint) return { ok: false, error: 'Only trains choose a stop location on the platform' };
      // OTTD order stop location: store non-default values; keep stopAt and stopLocation in sync
      if (stopLocation !== 'near') {
        entry.stopLocation = stopLocation;
      }
      if (stopLocation !== 'far') {
        entry.stopAt = stopLocation;
      }
    }
    out.push(entry);
  }
  for (const o of out) {
    if (o.cond && (o.cond.to < 0 || o.cond.to >= out.length)) return { ok: false, error: 'Conditional order jumps to an order that does not exist' };
  }
  const ue = unbunchListError(orders); // one unbunch order; not with full load or conditional orders
  if (ue) return { ok: false, error: ue };
  return { ok: true, orders: out };
}

/** Validate a go-to-depot order: an existing depot of the vehicle's kind, own company, optional refit cargo. */
function normaliseDepotOrder(state, v, o) {
  let entry;
  if (isNearestDepotOrder(o)) { // nearest: any depot of the vehicle's kind (resolved when the order is current)
    if (!depotGoals(state, v).length) return { ok: false, error: 'No depot this vehicle can use' };
    entry = { depot: 'nearest' };
  } else {
    const d = findDepot(state, o.depotId);
    if (!d) return { ok: false, error: 'Unknown depot in orders' };
    if (ownerMismatch(d, { owner: v.ownerId ?? null })) return { ok: false, error: RIVAL_OWNED };
    if (!depotGoals(state, v, d.id).length) return { ok: false, error: 'That depot cannot take this vehicle' };
    entry = { depotId: d.id };
  }
  if (o.serviceOnly) entry.serviceOnly = true;
  if (o.halt) entry.halt = true;
  if (o.unbunch) {
    const ue = unbunchOrderError(o);
    if (ue) return { ok: false, error: ue };
    entry.unbunch = true;
  }
  if (o.refit != null) {
    if (!(refitCargos(v) || []).includes(o.refit)) return { ok: false, error: `Cannot refit this vehicle to ${o.refit}` };
    entry.refit = o.refit;
  }
  return { ok: true, entry };
}

/** Cargo name helper for UI lines. */
export function cargoName(id) {
  return (CARGO_BY_ID[id] && CARGO_BY_ID[id].name) || id || 'nothing';
}

/**
 * Cargodist link graph: a vehicle that finishes loading at its station and leaves for its next stop adds its seats
 * to the edge (station -> next stop). Only when the setting is on (no-op otherwise).
 */
export function noteDepartureLeg(state, v) {
  if (!v.atStationId) return;
  const st = findStation(state, v.atStationId);
  const nxt = vehicleNextStop(v);
  if (!st || nxt == null || nxt === st.id) return;
  const slices = v.consist ? cargoSlices(v) : (v.cargoId ? [{ cargoId: v.cargoId, capacity: v.capacity || 0 }] : []);
  noteLeg(state, st, nxt, slices.filter((x) => cdApplies(state, x.cargoId)));
}
