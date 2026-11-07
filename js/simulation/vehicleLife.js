/**
 * Yearly vehicle bookkeeping (profit rollover, new-model news). Daily/monthly logic (ageing, reliability,
 * breakdowns, running costs, value decay) lives in loco/vehicle.js + loco/vehicleManager.js.
 */
import { ALL_VEHICLE_MODELS } from '../config/vehicles.js';
import { notify } from './news.js';
import { getSetting } from './settings.js';

export { BREAKDOWN_DAYS } from './loco/vehicle.js';

/**
 * Yearly: profit rollover, depreciation, new model news for `year`.
 */
export function vehiclesYearly(ctx, year) {
  for (const v of ctx.state.vehicles) {
    v.profitLastYear = v.profitThisYear;
    v.profitThisYear = 0;
    v.profitMonthMark = 0;
    delete v.transferCredits; // lazy: absent when no transfer credit was earned this year
  }
  // era news (OpenLoco/OpenTTD new-vehicle news): fires once, when the model's intro year starts. Starting a
  // game never fires it (the yearly hook runs on the year change only), so a 1920 start gets no burst.
  for (const m of ALL_VEHICLE_MODELS) {
    if (m.introYear === year && !m.optIn && m.news !== false && !getSetting(ctx.state, 'enginePreview')) notify(ctx, `New vehicle available: ${m.name} (${m.speed} km/h) — open Autoreplace to upgrade.`, 'good', undefined, undefined, 'newVehicle');
  }
}
