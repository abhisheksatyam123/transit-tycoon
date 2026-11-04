/**
 * Daily / monthly / yearly vehicle bookkeeping: ageing, reliability, breakdowns,
 * running costs, profit rollover and new-model announcements.
 */
import { TICKS_PER_DAY } from './constants.js';
import { VEHICLE_MODELS } from '../config/vehicles.js';
import { spend } from './economy.js';
import { vehicleModel } from './vehicles.js';
import { notify } from './news.js';

/** Days a breakdown lasts. */
export const BREAKDOWN_DAYS = 2;

/**
 * Daily: age, reliability decay, random breakdowns.
 */
export function vehiclesDaily(ctx, rng) {
  for (const v of ctx.state.vehicles) {
    if (v.state === 'depot') continue;
    v.age++;
    const model = vehicleModel(v);
    const base = v.baseReliability ?? (model ? model.reliability : 0.8);
    const floor = base * (v.age > v.maxAge ? 0.3 : 0.55);
    v.reliability = Math.max(floor, v.reliability - (v.age > v.maxAge ? 0.0015 : 0.0004));
    if (v.age === v.maxAge) notify(ctx, `${v.name} is getting old and should be replaced.`, 'bad', v.tx, v.ty);
    if (v.state === 'running' && v.speed > 0 && rng.chance((1 - v.reliability) * 0.025)) {
      v.state = 'broken';
      v.breakdownTicks = BREAKDOWN_DAYS * TICKS_PER_DAY;
      v.speed = 0;
      v.breakdowns = (v.breakdowns || 0) + 1;
    }
  }
}

/**
 * Monthly: charge running costs (vehicles outside depots).
 * @returns {number} total charged
 */
export function vehiclesMonthly(ctx) {
  let total = 0;
  for (const v of ctx.state.vehicles) {
    if (v.state === 'depot') continue;
    const c = Math.round(v.runningCost / 12);
    total += c;
    v.profitThisYear -= c;
  }
  spend(ctx.state.company, 'running', total);
  return total;
}

/**
 * Yearly: profit rollover, depreciation, new model news for `year`.
 */
export function vehiclesYearly(ctx, year) {
  for (const v of ctx.state.vehicles) {
    v.profitLastYear = v.profitThisYear;
    v.profitThisYear = 0;
    v.value = Math.round(v.value * 0.85);
  }
  for (const m of VEHICLE_MODELS) {
    if (m.introYear === year) notify(ctx, `New vehicle available: ${m.name} (${m.speed} km/h).`, 'good');
  }
}
