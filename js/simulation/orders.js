/**
 * Order progression and station loading / unloading.
 */
import { TICKS_PER_DAY } from './constants.js';
import { earn } from './economy.js';
import { calculateDeliveredCargoPayment } from './loco/economy.js';
import { recordDelivery } from './loco/company.js';
import { companyOf, ownerMismatch, RIVAL_OWNED } from './owner.js';
import { CARGO_BY_ID } from '../config/cargos.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { findStation, findDepot, manhattan, findIndustry, nearestTown } from './state.js';
import { refitCargos } from './refit.js';
import { normaliseCond } from './condOrders.js';
import { catchmentTiles, markPickup, takeWaiting, waitingAmount, addWaiting } from './stations.js';
import { deliverToIndustry } from './industries.js';
import { recordTownDelivery } from './townGrowth.js';
import { vehicleModel } from './vehicles.js';
import { notify } from './news.js';
import { noteDelivery } from './goals.js';
import { subsidyMultiplier } from './subsidies.js';
import { MAX_WAITING } from './constants.js';
import { cdApplies, loadFilter, nextHops, noteLeg } from './cargodist.js';
import { stopKindOk, stationFitsVehicle, depotGoals } from './routing.js';
import { departureHoldUntil, timetableSeparationOn } from './ttSchedule.js';
import { MODEL_BY_ID } from '../config/vehicles.js';

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

/** Effective unload mode of an order ('normal' when absent). */
export function unloadMode(order) {
  return (order && order.unload) || 'normal';
}

/** Short UI suffix describing non-default flags, e.g. " (full load)"; '' for normal orders. */
export function orderFlagText(o) {
  if (!o) return '';
  const parts = [];
  if (o.depotId != null) { // go-to-depot order (see movement.js depotOrderVisit)
    if (o.serviceOnly) parts.push('service if needed');
    if (o.refit) parts.push(`refit to ${cargoName(o.refit)}`);
    return parts.length ? ` (${parts.join(', ')})` : '';
  }
  if (o.full) parts.push('full load');
  if (o.load === 'fullAny') parts.push('full load any');
  if (o.load === 'none') parts.push('no loading');
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
  return new Set(v.orders.filter((o) => o.depotId == null && !o.cond).map((o) => o.stationId)).size;
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
  if (!v.consist) return unloadSlice(ctx, v, st);
  let income = 0;
  for (const s of cargoSlices(v)) income += inSlice(v, s.cargoId, s.capacity, () => unloadSlice(ctx, v, st));
  return income;
}

/** Mixed consists (v.consist): the wagons' cargo slices, one per cargo, with their total capacity. */
export function cargoSlices(v) {
  const out = [];
  for (const w of v.consist || []) {
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

/** Full load: a plain train is full at capacity; a mixed consist only when every cargo slice is full. */
export function isFull(v) {
  if (!v.consist) return v.load.amount >= v.capacity;
  return cargoSlices(v).every((s) => ((v.loads && v.loads[s.cargoId] && v.loads[s.cargoId].amount) || 0) >= s.capacity);
}

/** Full load any cargo (OpenTTD OLFB_FULL_LOAD_ANY): depart when any one cargo slice is full (single cargo = full). */
export function isFullAny(v) {
  if (!v.consist) return v.load.amount >= v.capacity;
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
  // the packet keeps its feeder share and gains this leg's transfer credit (OpenTTD AddFeederShare(profit))
  const moved = addWaiting(st, v.cargoId, amount, load.sourceX, load.sourceY, load.sinceTick, MAX_WAITING, feederOut + credit, dest);
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

/**
 * OpenTTD CargoPayment::PayTransfer: the feeder vehicle is credited the income of its leg (source to this station,
 * distance and days so far) minus the feeder share the units already hold, times FEEDER_PAYMENT_SHARE percent.
 * The credit is virtual: it goes into the vehicle's profit and the packet's feeder share, never into company cash.
 * @returns {number} credit (integer money)
 */
export function transferCredit(state, v, st, amount, feederOfAmount) {
  const load = v.load;
  const dist = manhattan(load.sourceX, load.sourceY, st.x, st.y);
  const days = (state.tick - load.sinceTick) / TICKS_PER_DAY;
  const income = calculateDeliveredCargoPayment(state, v.cargoId, amount, dist, days);
  return Math.round(((income - feederOfAmount) * FEEDER_PAYMENT_SHARE) / 100);
}

/** Pay for and deliver the vehicle's cargo to an accepting station (the original unload path). */
function deliverLoad(ctx, v, st) {
  const { state } = ctx;
  const load = v.load;
  const dist = manhattan(load.sourceX, load.sourceY, st.x, st.y);
  const days = (state.tick - load.sinceTick) / TICKS_PER_DAY;
  let pay = calculateDeliveredCargoPayment(state, v.cargoId, load.amount, dist, days);
  const mult = subsidyMultiplier(state, v.cargoId, load.sourceX, load.sourceY, st, ctx);
  if (mult !== 1) pay = Math.round(pay * mult);
  const payee = companyOf(state, v);
  recordDelivery(payee, v.cargoId, load.amount, dist);
  creditDelivery(state, st, v.cargoId, load.amount);
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
      return;
    }
  }
  const town = nearestTown(state, st.x, st.y);
  if (town) recordTownDelivery(town, cargoId, amount, state);
}

/**
 * Load waiting cargo onto the vehicle; marks the station as picking up the cargo.
 * @returns {number} amount loaded
 */
export function loadCargo(ctx, v, st) {
  if (!v.consist) return loadSlice(ctx, v, st);
  let got = 0;
  for (const s of cargoSlices(v)) got += inSlice(v, s.cargoId, s.capacity, () => loadSlice(ctx, v, st));
  return got;
}

function loadSlice(ctx, v, st) {
  const { state } = ctx;
  if (!v.cargoId || v.capacity <= 0) return 0;
  const model = vehicleModel(v);
  markPickup(state, st, v.cargoId, model ? model.speed : 0);
  const room = v.capacity - v.load.amount;
  if (room <= 0 || waitingAmount(st, v.cargoId) <= 0) return 0;
  // cargodist: only parcels whose next hop is the vehicle's next stop (or with no route known)
  const cd = cdApplies(state, v.cargoId);
  const pred = cd ? loadFilter(state, st, v.cargoId, vehicleNextStop(v)) : undefined;
  const got = takeWaiting(st, v.cargoId, room, pred);
  if (got.amount <= 0) return 0;
  const l = v.load;
  if (cd || l.dests) {
    l.dests = l.dests || {};
    for (const k of Object.keys(got.dests || { u: got.amount })) l.dests[k] = (l.dests[k] || 0) + (got.dests ? got.dests[k] : got.amount);
  }
  const total = l.amount + got.amount;
  l.sourceX = Math.round((l.sourceX * l.amount + got.sourceX * got.amount) / total);
  l.sourceY = Math.round((l.sourceY * l.amount + got.sourceY * got.amount) / total);
  l.sinceTick = Math.round((l.sinceTick * l.amount + state.tick * got.amount) / total);
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
  if (!st.arrived[key]) {
    st.arrived[key] = true;
    const what = v.kind === 'train' ? 'train' : v.kind === 'aircraft' ? 'aircraft' : v.kind === 'ship' ? 'ship' : v.roadType === 'bus' ? 'bus' : v.roadType === 'tram' ? 'tram' : 'truck';
    notify(ctx, `Citizens celebrate... First ${what} arrives at ${st.name}!`, 'good', st.x, st.y, 'arrival');
  }
  ctx.emit('vehicleArrived', { vehicle: v, station: st });
  v.state = 'loading';
  v.speed = 0;
  v.atStationId = st.id;
  if (intermediate) v.intermediate = true; // stop 'all': an intermediate stop, the order does not advance on departure
  else delete v.intermediate;
  unload(ctx, v, st);
  v.loadingTicks = LOAD_TICKS;
  if (!intermediate) recordArrival(ctx, v, currentOrder(v));
}

/** Timetable bookkeeping on arrival: arrival tick, lateness, autofill of the travel time. */
function recordArrival(ctx, v, order) {
  const { state } = ctx;
  if (!order) return;
  if (order.waitDays > 0 || v.autofill || (v.orderGroup != null && timetableSeparationOn(state))) v.arriveTick = state.tick;
  else delete v.arriveTick;
  if (v.departTick == null || !(order.travelDays > 0 || v.autofill)) return;
  const idx = v.orderIndex % v.orders.length;
  const actual = Math.round((state.tick - v.departTick) / TICKS_PER_DAY);
  let scheduled = order.travelDays || 0;
  if (v.autofill) {
    scheduled = Math.max(1, actual);
    setOrderField(state, v, idx, { travelDays: scheduled });
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
  if (!order || (order.load !== 'none' && !dropped)) loadCargo(ctx, v, st);
  const fullMode = order && (order.full || order.load === 'fullAny');
  if (fullMode && order.load !== 'none' && order.unload !== 'transfer' && order.unload !== 'all'
    && order.stationId === st.id && !(order.load === 'fullAny' ? isFullAny(v) : isFull(v)) && distinctOrderStations(v) >= 2) {
    v.loadingTicks = FULL_LOAD_RETRY;
    return false;
  }
  // timetable: hold until the minimum wait since arrival has passed
  if (order && order.waitDays > 0 && v.arriveTick != null
    && state.tick - v.arriveTick < order.waitDays * TICKS_PER_DAY) {
    v.loadingTicks = FULL_LOAD_RETRY;
    return false;
  }
  // timetable start date and separation: hold until the departure slot (lazy; absent = no hold)
  if (order && !v.intermediate && (v.ttStart != null || v.orderGroup != null)) {
    const hold = departureHoldUntil(state, v, v.orderIndex % v.orders.length);
    if (hold != null && state.tick < hold) {
      v.loadingTicks = FULL_LOAD_RETRY;
      return false;
    }
  }
  if (!v.intermediate) recordDeparture(ctx, v, order); // timetable and order advance belong to the order's own stop
  noteDepartureLeg(state, v); // cargodist link graph (no-op when the setting is off)
  return true;
}

/** Bookkeeping when a vehicle leaves its stop: autofill waiting time, autofill round, departure tick. */
function recordDeparture(ctx, v, order) {
  const { state } = ctx;
  const n = v.orders.length;
  const idx = n ? v.orderIndex % n : 0;
  if (v.autofill && order && v.arriveTick != null) {
    const waited = Math.round((state.tick - v.arriveTick) / TICKS_PER_DAY);
    setOrderField(state, v, idx, { waitDays: waited });
  }
  if (v.autofill) {
    v.autofillLeft = (v.autofillLeft || 0) - 1;
    if (v.autofillLeft <= 0) { delete v.autofill; delete v.autofillLeft; }
  }
  delete v.arriveTick;
  const next = n ? v.orders[(idx + 1) % n] : null;
  if (next && (next.travelDays > 0 || v.autofill)) v.departTick = state.tick;
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
      const r = normaliseCond(o.cond);
      if (!r.ok) return r;
      out.push(r.entry);
      continue;
    }
    if (o && o.depotId != null) { // go-to-depot order: no station; optional service-if-needed and refit
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
    if (stop !== undefined) entry.stop = stop;
    out.push(entry);
  }
  for (const o of out) {
    if (o.cond && (o.cond.to < 0 || o.cond.to >= out.length)) return { ok: false, error: 'Conditional order jumps to an order that does not exist' };
  }
  return { ok: true, orders: out };
}

/** Validate a go-to-depot order: an existing depot of the vehicle's kind, own company, optional refit cargo. */
function normaliseDepotOrder(state, v, o) {
  const d = findDepot(state, o.depotId);
  if (!d) return { ok: false, error: 'Unknown depot in orders' };
  if (ownerMismatch(d, { owner: v.ownerId ?? null })) return { ok: false, error: RIVAL_OWNED };
  if (!depotGoals(state, v, d.id).length) return { ok: false, error: 'That depot cannot take this vehicle' };
  const entry = { depotId: d.id };
  if (o.serviceOnly) entry.serviceOnly = true;
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
