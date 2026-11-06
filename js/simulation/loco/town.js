/**
 * Ported from OpenLoco (MIT), src/World/Town.cpp: Town::tick (0x0049742F), Town::updateMonthly (0x0049749B),
 * Town::recalculateSize (0x004975E0), Town::adjustCompanyRating.
 *
 * Mapping to the transit-tycoon town record (js/simulation/towns.js), fields added lazily by ensureTown()
 * (old saves / moscow towns lack them):
 *  - history (Uint8 x 240 months, historySize == history.length), historyMinPopulation, size (0..4 TownSize),
 *    buildSpeed (1..4), companyRating (-1000..1000, default 500; one player company => single value).
 *  - OpenLoco's grow() walks a random road and constructs buildings along it (up to 75 steps, kBuildSpeedToGrowthPerTick
 *    = {0,1,3,5,7,9,12,16,22} grow calls per town tick). TT's unit of growth is townGrow.growForTick() (one new house /
 *    upgrade / street extension). To keep the pace of the original game on TT's tile scale we use TT_STEP_CHANCE: the
 *    probability that a town tick performs one growth step for buildSpeed 1..4 (~0.4 .. 1.6 steps per month; a town
 *    ticks every 8*127 = 1016 ticks ~ 3.15x per month).
 *  - cargoInfluenceFlags/monthlyCargoDelivered: TT has no region influence cargo; the "influence cargo" is the town's
 *    own passengers+goods delivered/transported this month (as in the original TT: served towns grow faster).
 *  - populationCapacity -> population (sum of house pop).
 */
import { growForTick } from './townGrow.js';
import { townGrowthAllowed, tropicGrowthAllowed } from '../climate.js';
import { recomputePopulation } from '../towns.js';

export const HISTORY_LEN = 20 * 12;
export const MIN_COMPANY_RATING = -1000;
export const MAX_COMPANY_RATING = 1000;
/** TownSize: hamlet, village, town, city, metropolis. */
export const TOWN_SIZE_NAMES = ['hamlet', 'village', 'town', 'city', 'metropolis'];
/** 0x004FF714 */
const POPULATIONS = [0, 150, 500, 2500, 8000];

/** Give a town record the OpenLoco fields it lacks. */
export function ensureTown(town) {
  if (!town.history) {
    town.history = [0];
    town.historyMinPopulation = 0;
  }
  if (town.historyMinPopulation === undefined) town.historyMinPopulation = 0;
  if (town.size === undefined) town.size = 0;
  if (town.buildSpeed === undefined) town.buildSpeed = 1;
  if (town.companyRating === undefined) town.companyRating = 500;
  if (town.ratingAdjusted === undefined) town.ratingAdjusted = false;
  return town;
}

/** Town::adjustCompanyRating. */
export function adjustCompanyRating(town, amount) {
  ensureTown(town);
  town.companyRating = Math.max(MIN_COMPANY_RATING, Math.min(MAX_COMPANY_RATING, town.companyRating + amount));
}

/** Town::recalculateSize. */
export function recalculateSize(town) {
  let size = town.size;
  if (size < 4 && town.population >= POPULATIONS[size + 1]) size++;
  else if (size !== 0 && town.population + 100 < POPULATIONS[size]) size--;
  town.size = size;
}

/** Town::tick: recalculateSize, then grow (TT: growForTick) according to buildSpeed. */
export function tickTown(game, town) {
  ensureTown(town);
  recalculateSize(town);
  // sub-arctic (opt-in): a town centred above the snow line grows only if it got food last month (climate.js)
  const grew = townGrowthAllowed(game.state, town) && tropicGrowthAllowed(game.state, town) ? growForTick(game, town) : false;
  if (grew) {
    recomputePopulation(game.state, town);
    recalculateSize(town);
  }
  return grew;
}

/**
 * Town::updateMonthly part 1: scroll the population history and compute the new build speed.
 * (The TT statistics roll lives in townGrowth.rollTownStats and runs right after, in TownManager.updateMonthly.)
 */
export function updateMonthlyTown(town) {
  ensureTown(town);
  const h = town.history;
  if (h.length === HISTORY_LEN) h.shift(); else if (h.length > HISTORY_LEN) h.splice(0, h.length - HISTORY_LEN + 1);
  const historySize = Math.min(h.length + 1, HISTORY_LEN);

  let popSteps = Math.floor(Math.max(town.population - town.historyMinPopulation, 0) / 50);
  let popGrowth = 0;
  while (popSteps > 255) { popSteps -= 20; popGrowth += 1000; }
  if (popGrowth !== 0) {
    town.historyMinPopulation += popGrowth;
    const offset = Math.floor(popGrowth / 50) & 0xff;
    for (let i = 0; i < h.length; i++) h[i] = Math.max(0, h[i] - offset);
  }
  h.length = historySize - 1;
  h[historySize - 1] = popSteps & 0xff;

  let maxPopulation = 0;
  for (let i = 0; i < historySize; i++) maxPopulation = Math.max(maxPopulation, h[i]);
  let popOffset = town.historyMinPopulation;
  while (maxPopulation <= 235 && popOffset > 0) { maxPopulation += 20; popOffset -= 1000; }
  popOffset -= town.historyMinPopulation;
  if (popOffset !== 0) {
    popOffset = -popOffset;
    town.historyMinPopulation -= popOffset;
    popOffset = Math.trunc(popOffset / 50);
    for (let i = 0; i < historySize; i++) h[i] = (h[i] + popOffset) & 0xff;
  }

  // build speed 1 (slow) .. 4 (fast) from the influence cargo delivered this month
  const delivered = (town.transportedThisMonth || 0) + (town.deliveredPassThisMonth || 0) + (town.goodsThisMonth || 0);
  town.buildSpeed = Math.max(1, Math.min(4, Math.floor(delivered / 100) + 1));
}
