/**
 * Monthly town statistics and delivery counters (growth itself: loco/town.js + townGrow.js).
 */
import { recomputePopulation } from './towns.js';
import { pushNews } from './news.js';
import { isArctic, isTropic } from './climate.js';

/** Population milestones that trigger news. */
export const MILESTONES = [500, 1000, 2000, 3000, 5000, 8000, 12000];

/**
 * Month end statistics roll for a town (growth itself is driven per town tick by loco/town.js,
 * see Town::tick / Town::updateMonthly there): last-month figures, counters reset, population, news.
 */
export function rollTownStats(state, town) {
  town.passengersLastMonth = town.passengersThisMonth;
  town.mailLastMonth = town.mailThisMonth;
  town.passengersTransported = town.transportedThisMonth;
  town.goodsDeliveredLastMonth = town.goodsThisMonth;
  town.goodsDelivered = town.goodsThisMonth;
  town.passengersThisMonth = 0; town.mailThisMonth = 0; town.transportedThisMonth = 0;
  town.goodsThisMonth = 0; town.deliveredPassThisMonth = 0;
  // lazy food counter (sub-arctic only): last month's food delivered, dropped when none
  if (town.foodThisMonth !== undefined) { town.foodLastMonth = town.foodThisMonth; delete town.foodThisMonth; }
  else if (town.foodLastMonth !== undefined) delete town.foodLastMonth;
  // TP tropic: water delivered this month (desert growth needs WATER too); lazy like the food counter
  if (town.waterThisMonth !== undefined) { town.waterLastMonth = town.waterThisMonth; delete town.waterThisMonth; }
  else if (town.waterLastMonth !== undefined) delete town.waterLastMonth;
  const before = town.population;
  recomputePopulation(state, town);
  for (const m of MILESTONES) {
    if (before < m && town.population >= m) {
      pushNews(state, `${town.name} has grown to a population of ${town.population}!`, 'good', town.x, town.y, 'general');
    }
  }
}

/**
 * Record passengers delivered to a town or goods delivered (boosts growth).
 */
export function recordTownDelivery(town, cargoId, amount, state = null) {
  if (cargoId === 'GOOD' || cargoId === 'FOOD' || cargoId === 'BMAT') { town.goodsThisMonth += amount; town.goodsDelivered += amount; } // FOOD/BMAT: T-IN
  else if (cargoId === 'PASS' || cargoId === 'MAIL') town.deliveredPassThisMonth += amount;
  // sub-arctic (opt-in): food delivered this month is kept for the snow-line growth rule (climate.js); lazy field
  if (cargoId === 'FOOD' && (isArctic(state) || isTropic(state))) town.foodThisMonth = (town.foodThisMonth || 0) + amount;
  if (cargoId === 'WATER' && isTropic(state)) town.waterThisMonth = (town.waterThisMonth || 0) + amount;
}
