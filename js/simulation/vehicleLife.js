/**
 * Yearly vehicle bookkeeping (profit rollover, new-model news). Daily/monthly logic (ageing, reliability,
 * breakdowns, running costs, value decay) lives in loco/vehicle.js + loco/vehicleManager.js.
 */
import { VEHICLE_MODELS } from '../config/vehicles.js';
import { notify } from './news.js';

export { BREAKDOWN_DAYS } from './loco/vehicle.js';

/**
 * Yearly: profit rollover, depreciation, new model news for `year`.
 */
export function vehiclesYearly(ctx, year) {
  for (const v of ctx.state.vehicles) {
    v.profitLastYear = v.profitThisYear;
    v.profitThisYear = 0;
    v.profitMonthMark = 0;
  }
  for (const m of VEHICLE_MODELS) {
    if (m.introYear === year) notify(ctx, `New vehicle available: ${m.name} (${m.speed} km/h).`, 'good');
  }
}
