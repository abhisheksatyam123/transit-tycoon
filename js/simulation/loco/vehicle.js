/**
 * Per-vehicle daily/monthly economics.
 * Ported from OpenLoco (MIT), src/Vehicles/VehicleHead.cpp (updateDaily 0x004B8340, updateBreakdown 0x004BA8D4,
 * updateMonthly 0x004C3C65, calculateRunningCost 0x004BA5B0) and VehicleBogie.cpp sub_4BA873 (breakdown timeout).
 *
 * Mapping to transit-tycoon: one JS vehicle = one OpenLoco train (head + cars). OpenLoco stores reliability as
 * percent*256 (0..25600); transit-tycoon keeps v.reliability as 0..1, so rel16 = reliability*25600.
 * VehicleObject.obsolete -> obsoleteYear() below (successor model intro + 5). VehicleObject.runCostFactor ->
 * v.runningCost (yearly, summed over the engine and wagons). Breakdown duration (5 days) is run by movement.js
 * via v.state='broken' / v.breakdownTicks. Servicing: entering a depot (movement.enterDepot) restores reliability;
 * the breakdown timer is re-armed here the next day (v.timeoutToBreakdown == null).
 */
import { TICKS_PER_DAY } from '../constants.js';
import { VEHICLE_MODELS } from '../../config/vehicles.js';
import { spend } from '../economy.js';
import { vehicleModel } from '../vehicles.js';
import { notify } from '../news.js';
import { getSetting } from '../settings.js';
import { runningCost } from '../prices.js';

export const RELIABILITY_SCALE = 25600; // 100% * 256
export const RELIABILITY_LOSS_PER_DAY = 4; // kReliabilityLossPerDay
export const RELIABILITY_LOSS_PER_DAY_OBSOLETE = 10; // kReliabilityLossPerDayObsolete
export const MIN_RELIABILITY = 100;
export const BREAKDOWN_DAYS = 5; // car.front->breakdownTimeout = 5
export const NO_BREAKDOWN_TIMEOUT = 0xffff;
const PROFIT_HISTORY = 4; // OpenLoco veh2->profit[4]

/** Obsolete year of a vehicle's model (OpenLoco VehicleObject::obsolete): successor intro + 5, else never. */
export function obsoleteYear(model) {
  if (!model) return Infinity;
  if (model.obsolete) return model.obsolete;
  let next = Infinity;
  for (const m of VEHICLE_MODELS) {
    if (m.kind === model.kind && m.id !== model.id && m.introYear > model.introYear && m.speed >= model.speed) next = Math.min(next, m.introYear);
  }
  return next + 5;
}

/** sub_4BA873: arm the breakdown timer (days until next breakdown) from reliability. */
export function armBreakdownTimer(v, rng, state) {
  v.timeoutToBreakdown = NO_BREAKDOWN_TIMEOUT;
  const rel16 = Math.round(v.reliability * RELIABILITY_SCALE);
  if (rel16 !== 0) {
    let f = Math.trunc(rel16 / 256);
    f = Math.trunc((f * f) / 16);
    const randVal = Math.trunc((Math.floor(rng.next() * 65536) * (f >> 1)) / 65536);
    f -= f >> 2;
    f += randVal;
    if (state && getSetting(state, 'breakdowns') === 'reduced') f *= 2;
    v.timeoutToBreakdown = Math.max(4, f);
  }
}

/** VehicleHead::updateDaily (reliability / breakdown part) + transit-tycoon ageing. */
export function vehicleDaily(ctx, v, rng, year) {
  if (v.state === 'depot') {
    v.timeoutToBreakdown = null; // serviced: re-armed on leaving the depot
    v.breakdownPending = false;
    return;
  }
  v.age++;
  if (v.age === v.maxAge) notify(ctx, `${v.name} is getting old and should be replaced.`, 'bad', v.tx, v.ty);
  if (v.reliability === 0) return;
  // breakdowns setting: 'none' = never; 'reduced' = timer doubled (armBreakdownTimer); 'normal' = unchanged
  if (ctx && ctx.state && getSetting(ctx.state, 'breakdowns') === 'none') {
    v.timeoutToBreakdown = null;
    v.breakdownPending = false;
    v.reliability = Math.max(v.reliability - (obsoleteYear(vehicleModel(v)) <= year ? RELIABILITY_LOSS_PER_DAY_OBSOLETE : RELIABILITY_LOSS_PER_DAY) / RELIABILITY_SCALE, MIN_RELIABILITY / RELIABILITY_SCALE);
    return;
  }
  if (v.timeoutToBreakdown == null) armBreakdownTimer(v, rng, ctx && ctx.state);
  if (v.state !== 'broken' && v.timeoutToBreakdown !== NO_BREAKDOWN_TIMEOUT) {
    v.timeoutToBreakdown = Math.max(0, v.timeoutToBreakdown - 1);
    if (v.timeoutToBreakdown === 0) {
      armBreakdownTimer(v, rng, ctx && ctx.state);
      v.breakdownPending = true;
    }
  }
  const obsolete = obsoleteYear(vehicleModel(v)) <= year;
  const loss = (obsolete ? RELIABILITY_LOSS_PER_DAY_OBSOLETE : RELIABILITY_LOSS_PER_DAY) / RELIABILITY_SCALE;
  v.reliability = Math.max(v.reliability - loss, MIN_RELIABILITY / RELIABILITY_SCALE);
}

/** VehicleHead::updateBreakdown (per tick): a pending breakdown strikes a moving vehicle. */
export function vehicleBreakdownTick(v) {
  if (!v.breakdownPending) return;
  if (v.state !== 'running' || !(v.speed > 0)) return; // only travelling vehicles break down
  v.breakdownPending = false;
  v.state = 'broken';
  v.breakdownTicks = BREAKDOWN_DAYS * TICKS_PER_DAY;
  v.speed = 0;
  v.breakdowns = (v.breakdowns || 0) + 1;
}

/** VehicleHead::calculateRunningCost: monthly running cost of one vehicle. */
export function monthlyRunningCost(v, state) {
  const base = Math.round(v.runningCost / 12);
  return state ? runningCost(state, base) : base;
}

/** VehicleHead::updateMonthly. @returns {number} running cost charged */
export function vehicleMonthly(ctx, v) {
  let cost = 0;
  if (v.state !== 'depot') {
    cost = monthlyRunningCost(v, ctx && ctx.state);
    // veh2->curMonthRevenue = profit earned since the last month roll-over (orders.js adds deliveries to profitThisYear)
    const revenue = v.profitThisYear - (v.profitMonthMark || 0);
    v.profitThisYear -= cost;
    const hist = v.profit || (v.profit = new Array(PROFIT_HISTORY).fill(0));
    hist.unshift(revenue - cost);
    hist.length = PROFIT_HISTORY;
  }
  v.profitMonthMark = v.profitThisYear;
  // refundCost -= refundCost / 128 each month (value = sell-back value)
  v.value -= Math.trunc(v.value / 128);
  return cost;
}

export function chargeRunning(ctx, total) { spend(ctx.state.company, 'running', total); }
