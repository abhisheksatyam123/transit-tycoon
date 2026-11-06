/**
 * Monthly town statistics and delivery counters (growth itself: loco/town.js + townGrow.js).
 */
import { recomputePopulation } from './towns.js';
import { pushNews } from './news.js';

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
  const before = town.population;
  recomputePopulation(state, town);
  for (const m of MILESTONES) {
    if (before < m && town.population >= m) {
      pushNews(state, `${town.name} has grown to a population of ${town.population}!`, 'good', town.x, town.y);
    }
  }
}

/**
 * Record passengers delivered to a town or goods delivered (boosts growth).
 */
export function recordTownDelivery(town, cargoId, amount) {
  if (cargoId === 'GOOD' || cargoId === 'FOOD' || cargoId === 'BMAT') { town.goodsThisMonth += amount; town.goodsDelivered += amount; } // FOOD/BMAT: T-IN
  else if (cargoId === 'PASS' || cargoId === 'MAIL') town.deliveredPassThisMonth += amount;
}
