/**
 * Town (local authority) rating of the company and authority actions (T8, gap #8).
 *
 * Sources: OpenLoco src/World/Town.cpp (Town::adjustCompanyRating, companyRatings -1000..1000 default 500),
 * GameCommands/Buildings/RemoveBuilding.cpp (house demolition refused when the local rating is below 0),
 * the rank titles of Ui/Windows/TownWindow.cpp (Excellent/Good/Average/Poor/Appalling); OpenTTD
 * src/town_cmd.cpp (UpdateTownRating: station steps, RATING_TREE_DOWN_STEP -35, RATING_ROAD_DOWN_STEP_EDGE -18,
 * the town actions: advertising small/medium/large, statue, fund buildings) and town_type.h constants.
 *
 * Everything here is lazy: a town without authority fields behaves as rating 500, no statue, no funding.
 * Day-0 states and random worlds therefore serialize exactly as before until a rating changes.
 */
import { TICKS_PER_DAY } from './constants.js';
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { checkMoney } from './trackRules.js';
import { nearestTown, manhattan } from './state.js';
import { ensureTown, adjustCompanyRating, MIN_COMPANY_RATING, MAX_COMPANY_RATING } from './loco/town.js';

export const RATING_NEUTRAL = 500;
/** dist_local_authority (OpenTTD default 20): stations/roads/trees within this manhattan distance belong to the town. */
export const LOCAL_AUTHORITY_DIST = 20;
/** Below this rating the local authority refuses station building and house / town road demolition. */
export const REFUSE_BELOW = 0;
/** OpenTTD RATING_STATION_UP_STEP / DOWN_STEP (applied once per served / unserved station per month). */
const STATION_UP = 12, STATION_DOWN = -15;
/** A station counts as served if it picked up cargo within this many days. */
const SERVED_DAYS = 20;
/** OpenTTD RATING_TREE_DOWN_STEP / RATING_ROAD_DOWN_STEP_EDGE. */
export const TREE_DOWN_STEP = -35, ROAD_DOWN_STEP = -18;
/** OpenTTD RATING_STATUE bonus is not in OpenTTD's table; we use a one-off bonus of this size. */
export const STATUE_BONUS = 200;
/** Fund new buildings: months of accelerated growth. */
export const FUND_MONTHS = 3;
/** Build speed used while a town is funded (OpenTTD: funding forces growth). */
export const FUND_BUILD_SPEED = 4;

/** Advertising tiers (OpenTTD town actions 0..2): radius (manhattan), station rating target bonus, duration months, cost. */
export const ADVERTISE = {
  small: { radius: 10, bonus: 15, months: 2, cost: 'advertiseSmall' },
  medium: { radius: 15, bonus: 25, months: 3, cost: 'advertiseMedium' },
  large: { radius: 20, bonus: 35, months: 4, cost: 'advertiseLarge' },
};

/** OpenLoco rank titles (TownWindow.cpp: (rating+1000)/20 percentage thresholds 70/60/50/25). */
export function ratingTitle(rating) {
  if (rating >= 400) return 'Excellent';
  if (rating >= 200) return 'Good';
  if (rating >= 0) return 'Average';
  if (rating >= -500) return 'Poor';
  return 'Appalling';
}

/** The company's rating in a town (neutral when the town has no authority data yet). */
export function townRating(town) {
  return town.companyRating ?? RATING_NEUTRAL;
}

/** Nearest town within the local authority distance of (x,y), or null. */
export function authorityTown(state, x, y) {
  const t = nearestTown(state, x, y);
  if (!t || manhattan(t.x, t.y, x, y) > LOCAL_AUTHORITY_DIST) return null;
  return t;
}

/** Error text when the local authority refuses an action at (x,y), else null. */
export function refusalAt(state, x, y) {
  const t = authorityTown(state, x, y);
  if (!t || townRating(t) >= REFUSE_BELOW) return null;
  return `${t.name} local authority refuses permission`;
}

/** Demolition gate: houses and town roads (OpenLoco: non-misc buildings; OpenTTD: town road). */
export function demolishRefusal(state, jobs) {
  for (const j of jobs) {
    if (j.kind !== 'house' && j.kind !== 'track') continue;
    if (j.kind === 'track') {
      const t = state.map.tiles[j.y * state.map.width + j.x];
      if (!t.road) continue;
    }
    const msg = refusalAt(state, j.x, j.y);
    if (msg) return msg;
  }
  return null;
}

/** Rating penalties for a demolition that really happened: trees and town roads inside the town radius. */
export function applyDemolishPenalty(state, jobs) {
  const perTown = new Map();
  for (const j of jobs) {
    let step = 0;
    if (j.kind === 'clear') {
      if (state.map.tiles[j.y * state.map.width + j.x].terrain === 'forest') step = TREE_DOWN_STEP;
    } else if (j.kind === 'track') {
      const t = state.map.tiles[j.y * state.map.width + j.x];
      if (t.road) step = ROAD_DOWN_STEP;
    }
    if (!step) continue;
    const town = authorityTown(state, j.x, j.y);
    if (!town) continue;
    perTown.set(town, (perTown.get(town) || 0) + step);
  }
  for (const [town, amount] of perTown) adjustCompanyRating(town, amount);
}

/** Authority cost table: inflated construction-index amounts (COSTS table, see config/costs.js). */
export function actionCost(state, key) {
  return constructionTotal(state, COSTS[key]);
}

/**
 * Monthly authority update (after every town has its monthly roll):
 * - each station in a town's radius: +12 if it served recently, else -15 (OpenTTD station steps, monthly);
 * - slow drift of the rating toward neutral (1/20 of the distance, truncated);
 * - funding and advertising counters.
 * Towns and stations without a rating change are left untouched.
 */
export function updateAuthorityMonthly(state) {
  if (!state.towns.length) return;
  const served = new Map();
  for (const st of state.stations) {
    if (!st.tiles || !st.tiles.length) continue;
    const town = authorityTown(state, st.x, st.y);
    if (!town) continue;
    const recent = Object.values(st.lastPickup || {}).some((tick) => state.tick - tick <= SERVED_DAYS * TICKS_PER_DAY);
    served.set(town, (served.get(town) || 0) + (recent ? STATION_UP : STATION_DOWN));
  }
  for (const town of state.towns) {
    ensureTown(town);
    const delta = served.get(town);
    if (delta) adjustCompanyRating(town, delta);
    const r = townRating(town);
    const drift = Math.trunc((RATING_NEUTRAL - r) / 20);
    if (drift) town.companyRating = Math.max(MIN_COMPANY_RATING, Math.min(MAX_COMPANY_RATING, r + drift));
    if (town.fundMonths > 0) town.fundMonths--;
  }
}

/** Town window / action availability (no state mutation). */
export function actionList(state, town) {
  const money = state.company.money;
  const list = [];
  for (const key of ['small', 'medium', 'large']) {
    const cost = actionCost(state, ADVERTISE[key].cost);
    list.push({ id: 'advertise_' + key, label: `Advertise (${key})`, cost, enabled: money >= cost,
      detail: `Stations within ${ADVERTISE[key].radius} tiles get +${ADVERTISE[key].bonus} rating target for ${ADVERTISE[key].months} months` });
  }
  const sc = actionCost(state, 'statue');
  list.push({ id: 'statue', label: 'Build statue', cost: sc, enabled: !town.statue && money >= sc,
    detail: town.statue ? 'Already built' : `Permanent bonus +${STATUE_BONUS} rating` });
  const fc = actionCost(state, 'fundBuildings');
  list.push({ id: 'fund', label: 'Fund new buildings', cost: fc, enabled: !(town.fundMonths > 0) && money >= fc,
    detail: town.fundMonths > 0 ? `Funded for ${town.fundMonths} more months` : `Town grows fast for ${FUND_MONTHS} months` });
  return list;
}

/**
 * Run an authority action for a town (CMD_DO_TOWN_ACTION).
 * @returns {{ok:true,cost:number}|{ok:false,error:string}}
 */
export function townAction(ctx, townId, actionId, opts = {}) {
  const { state } = ctx;
  const town = state.towns.find((t) => t.id === townId);
  if (!town) return { ok: false, error: 'Unknown town' };
  ensureTown(town);
  const entry = actionList(state, town).find((a) => a.id === actionId);
  if (!entry) return { ok: false, error: 'Unknown town action' };
  if (actionId === 'statue' && town.statue) return { ok: false, error: `${town.name} already has a statue` };
  if (actionId === 'fund' && town.fundMonths > 0) return { ok: false, error: `${town.name} is already funded` };
  const money = checkMoney(state, entry.cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost: entry.cost };
  if (actionId.startsWith('advertise_')) {
    const tier = ADVERTISE[actionId.slice('advertise_'.length)];
    const until = state.tick + tier.months * 30 * TICKS_PER_DAY;
    for (const st of state.stations) {
      if (!st.tiles || !st.tiles.length) continue;
      if (manhattan(town.x, town.y, st.x, st.y) > tier.radius) continue;
      st.adBoost = { amount: tier.bonus, until };
    }
  } else if (actionId === 'statue') {
    town.statue = true;
    adjustCompanyRating(town, STATUE_BONUS);
  } else if (actionId === 'fund') {
    town.fundMonths = FUND_MONTHS;
  }
  spend(state.company, 'property', entry.cost);
  return { ok: true, cost: entry.cost };
}

/** Station advertising bonus at the current tick (0 when none or expired). */
export function advertBonus(state, st) {
  const b = st.adBoost;
  return b && state.tick < b.until ? b.amount : 0;
}
