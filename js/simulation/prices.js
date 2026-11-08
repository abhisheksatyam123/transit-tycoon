/**
 * Inflation-adjusted prices (OpenLoco Economy::getInflationAdjustedCost). All money amounts that are
 * defined as static table values (config/costs.js, vehicle/aircraft `cost`, running costs) go through
 * these helpers so they grow with inflation. At game start costScale == 1, so prices equal table values.
 * Results are always integers.
 */
import { COSTS } from '../config/costs.js';
import { COST_INDEX, inflateCost as inflate } from './loco/economy.js';
import { MAX_LOAN } from './constants.js';
import { getSetting } from './settings.js';

/** Apply a difficulty percent (settings vehicleCostPercent / constructionCostPercent). 100 returns the amount untouched. */
export function applyCostPercent(state, key, amount) {
  const p = getSetting(state, key);
  return p === 100 ? amount : Math.round(amount * p / 100);
}

/** Like inflateCost, but never creates state.economy (dry runs must not mutate state; a missing economy means scale 1). */
function inflateCost(state, costIndex, amount) {
  if (!state.economy || !Array.isArray(state.economy.factors)) return Math.round(amount);
  return inflate(state, costIndex, amount);
}

/** Inflated construction/demolition cost for COSTS[key]. */
export function buildCost(state, key) {
  return applyCostPercent(state, 'constructionCostPercent', inflateCost(state, COST_INDEX.construction, COSTS[key]));
}

/** Inflate an already summed construction amount (clearing, demolition, refunds...). */
export function constructionTotal(state, amount) {
  return applyCostPercent(state, 'constructionCostPercent', inflateCost(state, COST_INDEX.construction, amount));
}

/** Inflated purchase price of a vehicle model (or any base vehicle price number). */
export function vehiclePrice(state, modelOrCost) {
  const base = typeof modelOrCost === 'number' ? modelOrCost : (modelOrCost ? modelOrCost.cost : 0);
  return applyCostPercent(state, 'vehicleCostPercent', inflateCost(state, COST_INDEX.vehicles, base));
}

/** Inflated running cost amount. */
export function runningCost(state, amount) {
  return applyCostPercent(state, 'vehicleCostPercent', inflateCost(state, COST_INDEX.running, amount));
}

/** Inflated property upkeep amount. */
export function upkeepCost(state, amount) {
  return inflateCost(state, COST_INDEX.property, amount);
}

/**
 * Effective max loan (gap #52). OpenLoco scales maxLoan with inflation
 * (CompanyManager.cpp:1191 ChangeLoan.cpp getInflationAdjustedCost(size,0,8)); TT keeps
 * flat MAX_LOAN unless the setting is on. Default off -> hash/balance unchanged.
 */
export function effectiveMaxLoan(state) {
  if (!getSetting(state, 'inflationAdjustsMaxLoan')) return MAX_LOAN;
  // OL divisor formula works on base-1900 size units (div 8); TT MAX_LOAN is in start-year cmp,
  // so scale by costScale (1.0 at start) instead — equivalent growth, correct units.
  return inflateCost(state, COST_INDEX.general, MAX_LOAN);
}
