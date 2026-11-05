/**
 * Order progression and station loading / unloading.
 */
import { TICKS_PER_DAY } from './constants.js';
import { cargoPayment, earn } from './economy.js';
import { CARGO_BY_ID } from '../config/cargos.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { findStation, manhattan, findIndustry, nearestTown } from './state.js';
import { catchmentTiles, markPickup, takeWaiting, waitingAmount } from './stations.js';
import { deliverToIndustry } from './industries.js';
import { recordTownDelivery } from './townGrowth.js';
import { vehicleModel } from './vehicles.js';
import { notify } from './news.js';
import { noteDelivery } from './goals.js';

/** Ticks spent at a station before (re)trying to load and depart. */
export const LOAD_TICKS = 40;
/** Ticks between load attempts while waiting for a full load. */
export const FULL_LOAD_RETRY = 20;

/** Current order of a vehicle or null. */
export function currentOrder(v) {
  return v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
}

/** Advance to the next order (wrapping). */
export function advanceOrder(v) {
  if (v.orders.length) v.orderIndex = (v.orderIndex + 1) % v.orders.length;
}

/**
 * Pay for and deliver the vehicle's cargo at a station when accepted and the source differs.
 * @returns {number} income earned
 */
export function unload(ctx, v, st) {
  const { state } = ctx;
  const load = v.load;
  if (!load.amount || !v.cargoId) return 0;
  if (!st.accepts[v.cargoId]) return 0;
  if (load.fromStationId === st.id) return 0;
  const dist = manhattan(load.sourceX, load.sourceY, st.x, st.y);
  const days = (state.tick - load.sinceTick) / TICKS_PER_DAY;
  const pay = cargoPayment(v.cargoId, load.amount, dist, days);
  creditDelivery(state, st, v.cargoId, load.amount);
  noteDelivery(state, v.cargoId, load.amount, v.id);
  const amount = load.amount;
  load.amount = 0;
  load.fromStationId = null;
  if (pay > 0) {
    earn(state.company, pay);
    v.profitThisYear += pay;
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
  if (town) recordTownDelivery(town, cargoId, amount);
}

/**
 * Load waiting cargo onto the vehicle; marks the station as picking up the cargo.
 * @returns {number} amount loaded
 */
export function loadCargo(ctx, v, st) {
  const { state } = ctx;
  if (!v.cargoId || v.capacity <= 0) return 0;
  const model = vehicleModel(v);
  markPickup(state, st, v.cargoId, model ? model.speed : 0);
  const room = v.capacity - v.load.amount;
  if (room <= 0 || waitingAmount(st, v.cargoId) <= 0) return 0;
  const got = takeWaiting(st, v.cargoId, room);
  if (got.amount <= 0) return 0;
  const l = v.load;
  const total = l.amount + got.amount;
  l.sourceX = Math.round((l.sourceX * l.amount + got.sourceX * got.amount) / total);
  l.sourceY = Math.round((l.sourceY * l.amount + got.sourceY * got.amount) / total);
  l.sinceTick = Math.round((l.sinceTick * l.amount + state.tick * got.amount) / total);
  l.amount = total;
  l.fromStationId = st.id;
  return got.amount;
}

/**
 * Handle arrival of a vehicle at its order's station: news, unload, start loading.
 */
export function arriveAtStation(ctx, v, st) {
  const { state } = ctx;
  const key = v.kind === 'train' ? 'train' : v.kind === 'aircraft' ? 'air' : 'road';
  if (!st.arrived[key]) {
    st.arrived[key] = true;
    const what = v.kind === 'train' ? 'train' : v.kind === 'aircraft' ? 'aircraft' : v.roadType === 'bus' ? 'bus' : 'truck';
    notify(ctx, `Citizens celebrate... First ${what} arrives at ${st.name}!`, 'good', st.x, st.y);
  }
  ctx.emit('vehicleArrived', { vehicle: v, station: st });
  v.state = 'loading';
  v.speed = 0;
  v.atStationId = st.id;
  unload(ctx, v, st);
  v.loadingTicks = LOAD_TICKS;
}

/**
 * One loading tick. Returns true when the vehicle is ready to depart.
 */
export function loadingTick(ctx, v) {
  const { state } = ctx;
  const st = findStation(state, v.atStationId);
  if (!st) return true;
  if (--v.loadingTicks > 0) return false;
  loadCargo(ctx, v, st);
  const order = currentOrder(v);
  if (order && order.full && order.stationId === st.id && v.load.amount < v.capacity) {
    v.loadingTicks = FULL_LOAD_RETRY;
    return false;
  }
  return true;
}

/**
 * Validate and normalise an order list for a vehicle.
 * @returns {{ok:true,orders:object[]}|{ok:false,error:string}}
 */
export function normaliseOrders(state, v, orders, kindOf) {
  if (!Array.isArray(orders)) return { ok: false, error: 'Orders must be an array' };
  if (orders.length > 16) return { ok: false, error: 'Too many orders' };
  const out = [];
  for (const o of orders) {
    const st = o && findStation(state, o.stationId);
    if (!st) return { ok: false, error: 'Unknown station in orders' };
    const kind = kindOf(v);
    if (!st.tiles.some((t) => t.kind === kind)) {
      return { ok: false, error: `${st.name} has no ${kind === 'rail' ? 'rail platform' : kind + ' stop'}` };
    }
    out.push({ stationId: st.id, full: !!o.full });
  }
  return { ok: true, orders: out };
}

/** Cargo name helper for UI lines. */
export function cargoName(id) {
  return (CARGO_BY_ID[id] && CARGO_BY_ID[id].name) || id || 'nothing';
}
