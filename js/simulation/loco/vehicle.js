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
import { COST_INDEX, normalisedFactor } from './economy.js';
import { dayNumber } from '../date.js';
import { autorenewVehicle } from '../autorenew.js';

export const RELIABILITY_SCALE = 25600; // 100% * 256
export const RELIABILITY_LOSS_PER_DAY = 4; // kReliabilityLossPerDay
export const RELIABILITY_LOSS_PER_DAY_OBSOLETE = 10; // kReliabilityLossPerDayObsolete
export const MIN_RELIABILITY = 100;
export const BREAKDOWN_DAYS = 5; // car.front->breakdownTimeout = 5
/** OpenTTD vehicle.cpp:1357 `if (Ship) rel += 0x6666` (16-bit reliability): ships are boosted by 0x6666/65536 = 0.4 of full
 *  scale; on the 25600 scale that is exactly 10240. Used only with setting shipBreakdownReduced (default off). */
export const SHIP_BREAKDOWN_BOOST = Math.round((0x6666 * RELIABILITY_SCALE) / 65536); // 10240
export const NO_BREAKDOWN_TIMEOUT = 0xffff;
const PROFIT_HISTORY = 4; // OpenLoco veh2->profit[4]

/**
 * Reliability-decay obsolete year of a model (OpenLoco VehicleObject::obsolete): successor intro + 5, else never.
 * Purchase availability uses the separate config field `obsoleteYear` (vehicles.js purchasable); kept apart so
 * existing simulations stay identical.
 */
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
    // shipBreakdownReduced (default off): a ship's reliability is boosted by SHIP_BREAKDOWN_BOOST before the timer is
    // computed, so a ship's timer is lengthened the way the reliability bonus would. Trains and default play unchanged.
    const boost = state && v.kind === 'ship' && getSetting(state, 'shipBreakdownReduced') ? SHIP_BREAKDOWN_BOOST : 0;
    let f = Math.trunc((rel16 + boost) / 256);
    f = Math.trunc((f * f) / 16);
    const randVal = Math.trunc((Math.floor(rng.next() * 65536) * (f >> 1)) / 65536);
    f -= f >> 2;
    f += randVal;
    if (state && getSetting(state, 'breakdowns') === 'reduced') f *= 2;
    v.timeoutToBreakdown = Math.max(4, f);
  }
}

/**
 * Daily reliability loss (fraction of full scale). Default: 4 per day, 10 once obsolete (current TT).
 * ageDecayOttd (default off): OpenTTD AgeVehicle (vehicle.cpp:1454-1466) doubles reliability_spd_dec at each start of
 * year past max age, starting at max age itself: x2 in year 0, x4 in year 1, ... capped at x32 (5 doublings).
 * Years past max age are whole 365-day years (TT has no leap years).
 */
export function dailyReliabilityLoss(v, obsolete, state) {
  const base = obsolete ? RELIABILITY_LOSS_PER_DAY_OBSOLETE : RELIABILITY_LOSS_PER_DAY;
  if (!state || !getSetting(state, 'ageDecayOttd')) return base / RELIABILITY_SCALE;
  const past = v.age - v.maxAge;
  if (!(past >= 0)) return base / RELIABILITY_SCALE;
  const doublings = Math.min(4, Math.floor(past / 365)) + 1; // 1..5 doublings = x2..x32
  return (base * 2 ** doublings) / RELIABILITY_SCALE;
}

/** VehicleHead::updateDaily (reliability / breakdown part) + transit-tycoon ageing. */
export function vehicleDaily(ctx, v, rng, year) {
  if (v.state === 'depot') {
    if (ctx && ctx.state) autorenewVehicle(ctx, v); // stopped in a depot past max age: replace (setting autorenew)
    v.timeoutToBreakdown = null; // serviced: re-armed on leaving the depot
    v.breakdownPending = false;
    return;
  }
  v.age++;
  // service interval (OpenTTD NeedsServicing): once due, the vehicle services at the nearest depot after its current stop
  // OpenTTD order.no_servicing_if_no_breakdowns (default true): no service trips when breakdowns are off
  const skipService = !!ctx && !!ctx.state
    && getSetting(ctx.state, 'breakdowns') === 'none'
    && getSetting(ctx.state, 'noServicingIfNoBreakdowns') !== false;
  if (v.serviceIntervalDays && !v.serviceDue && !v.serviceTrip && ctx && ctx.state && !skipService
      && dayNumber(ctx.state.date) - (v.lastServiceDay ?? 0) >= v.serviceIntervalDays) v.serviceDue = true;
  if (v.age === v.maxAge) notify(ctx, `${v.name} is getting old and should be replaced.`, 'bad', v.tx, v.ty, 'advice');
  if (v.reliability === 0) return;
  // breakdowns setting: 'none' = never; 'reduced' = timer doubled (armBreakdownTimer); 'normal' = unchanged
  if (ctx && ctx.state && getSetting(ctx.state, 'breakdowns') === 'none') {
    v.timeoutToBreakdown = null;
    v.breakdownPending = false;
    v.reliability = Math.max(v.reliability - dailyReliabilityLoss(v, obsoleteYear(vehicleModel(v)) <= year, ctx && ctx.state), MIN_RELIABILITY / RELIABILITY_SCALE);
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
  const loss = dailyReliabilityLoss(v, obsolete, ctx && ctx.state);
  v.reliability = Math.max(v.reliability - loss, MIN_RELIABILITY / RELIABILITY_SCALE);
}

/** VehicleHead::updateBreakdown (per tick): a pending breakdown strikes a moving vehicle. */
export function vehicleBreakdownTick(v) {
  if (!v.breakdownPending) return;
  if (v.state !== 'running' || !(v.speed > 0)) return; // only travelling vehicles break down
  v.breakdownPending = false;
  v.state = 'broken';
  v.breakdownTicks = BREAKDOWN_DAYS * TICKS_PER_DAY;
  if (v.kind === 'aircraft') v.speed = 0; // aircraft still stop; road/rail/ship crawl on (movement.js 'broken'), or stop with breakdownStop
  delete v.breakdownFrozen;
  v.breakdowns = (v.breakdowns || 0) + 1;
}

/** VehicleHead::calculateRunningCost: monthly running cost of one vehicle. */
export function monthlyRunningCost(v, state) {
  // OL VehicleHead::calculateRunningCost (VehicleHead.cpp:7119-7130): per car
  // getInflationAdjustedCost(runCostFactor, runCostIndex, 10) = trunc(factor * normalisedMultiplier / 2^10), summed.
  // TT keeps one yearly figure per consist, so the monthly share is the yearly amount / 12, inflated and truncated
  // once (integer math, no separate rounding step before inflation).
  if (!state) return Math.trunc(v.runningCost / 12);
  const cost = Math.trunc((v.runningCost * normalisedFactor(state, COST_INDEX.running)) / (12 * 1024));
  // vehicleCostPercent (OpenTTD difficulty.vehicle_costs); 100 leaves the amount untouched.
  const p = getSetting(state, 'vehicleCostPercent');
  return p === 100 ? cost : Math.round(cost * p / 100);
}

/** VehicleHead::updateMonthly. @returns {number} running cost charged */
export function vehicleMonthly(ctx, v) {
  // OL VehicleHead::updateMonthly (VehicleHead.cpp:238-249) charges every head with a valid tile, and a vehicle
  // parked in a depot keeps its tile (only liftUpVehicle / creation / pickup set tileX = -1), so depot vehicles pay too.
  const cost = monthlyRunningCost(v, ctx && ctx.state);
  // veh2->curMonthRevenue = profit earned since the last month roll-over (orders.js adds deliveries to profitThisYear)
  const revenue = v.profitThisYear - (v.profitMonthMark || 0);
  v.profitThisYear -= cost;
  const hist = v.profit || (v.profit = new Array(PROFIT_HISTORY).fill(0));
  hist.unshift(revenue - cost);
  hist.length = PROFIT_HISTORY;
  v.profitMonthMark = v.profitThisYear;
  // refundCost -= refundCost / 128 each month (value = sell-back value)
  v.value -= Math.trunc(v.value / 128);
  return cost;
}

export function chargeRunning(ctx, total) { spend(ctx.state.company, 'running', total); }
