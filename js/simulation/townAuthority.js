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
import { createRng } from './rng.js';
import { notify } from './news.js';
import { nearestTown, manhattan } from './state.js';
import { getSetting } from './settings.js';
import { ensureTown, adjustCompanyRating, MIN_COMPANY_RATING, MAX_COMPANY_RATING } from './loco/town.js';

export const RATING_NEUTRAL = 500;
/** dist_local_authority (OpenTTD default 20): stations/roads/trees within this manhattan distance belong to the town. */
export const LOCAL_AUTHORITY_DIST = 20;

/** Local authority radius (tiles) for this game: settings.distLocalAuthority (OpenTTD dist_local_authority, min 5). Default = LOCAL_AUTHORITY_DIST. */
export function localAuthorityDist(state) {
  const v = getSetting(state, 'distLocalAuthority');
  return Number.isFinite(v) ? Math.max(5, v) : LOCAL_AUTHORITY_DIST;
}
/** Below this rating the local authority refuses station building and house / town road demolition. */
export const REFUSE_BELOW = 0;
/**
 * Town council tolerance (townCouncilTolerance setting, OpenTTD difficulty.town_council_tolerance).
 * OpenTTD difficulty_settings.ini:298 (def 0): 0 = Lenient, 1 = Tolerant, 2 = Hostile, 3 = Permissive.
 * TT applies the threshold to station building and town house/road demolition (refusalAt).
 */
export const TOLERANCE_THRESHOLDS = {
  0: 0,
  1: 200,
  2: 400,
  3: -Infinity,
};
/** Backwards-compatible constant for permissive level. */
export const TOLERANCE_PERMISSIVE = 3;

/** The rating a town must reach for the local authority to allow building / demolition. */
export function refuseBelow(state) {
  return TOLERANCE_THRESHOLDS[getSetting(state, 'townCouncilTolerance')] ?? REFUSE_BELOW;
}
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

/** OpenTTD town_type.h: bribe rating step, cap, and the rating a failed bribe drops to. */
export const RATING_BRIBE_UP_STEP = 200;
export const RATING_BRIBE_MAXIMUM = 800;
export const RATING_BRIBE_DOWN_TO = -50;
/** OpenTTD TownActionBribe: a bribe fails with probability 1/14 (Chance16(1,14)). */
export const BRIBE_FAIL_CHANCE = 1 / 14;
/** OpenTTD: a failed bribe leaves the town unwanted for this many months (no more bribes, station ratings 0). */
export const BRIBE_UNWANTED_MONTHS = 6;
/** OpenTTD: road reconstruction lasts 6 months (t->road_build_months = 6). */
export const ROAD_WORKS_MONTHS = 6;
/** Car speed multiplier on town road tiles under reconstruction (our disruption model; OpenTTD has no speed effect). */
export const ROAD_WORKS_SPEED = 0.5;
/** OpenTTD exclusive transport rights last 12 months (t->exclusive_counter = 12). */
export const EXCLUSIVE_MONTHS = 12;
/** Exclusive-rights base cost (scaled by town population at purchase time). */
export const EXCLUSIVE_BASE = 40_000;

/** Local authority rating of the player (lazy default 500). */
export function townRating(town) {
  if (!town) return RATING_NEUTRAL;
  return typeof town.companyRating === 'number' ? town.companyRating : RATING_NEUTRAL;
}

/** Town whose local authority governs (x,y) (nearest town within LOCAL_AUTHORITY_DIST), or null. */
export function authorityTown(state, x, y) {
  if (!state.towns || !state.towns.length) return null;
  const town = nearestTown(state, x, y);
  return town && manhattan(town.x, town.y, x, y) <= localAuthorityDist(state) ? town : null;
}

/**
 * OpenTTD-style rank name for a rating value (TownWindow.cpp: Excellent/Good/Average/Poor/Appalling).
 * Kept for tests and any future use; the UI renders a 0-100% bar instead.
 */
/** Backwards-compatible alias (tests/UI). */
export const ratingTitle = (r) => ratingRank(r);

export function ratingRank(r) {
  if (r >= 400) return 'Excellent';
  if (r >= 200) return 'Good';
  if (r >= 0) return 'Average';
  if (r >= -500) return 'Poor';
  return 'Appalling';
}

function rankCss(r) {
  if (r >= 200) return 'rgba(180,255,220,.9)';
  if (r > -200) return 'rgba(230,210,160,.9)';
  if (r > -400) return 'rgba(255,200,120,.9)';
  return 'rgba(255,140,140,.95)';
}

/** A short refusal reason if the local authority at (x,y) forbids building, else null. */
export function refusalAt(state, x, y) {
  const t = authorityTown(state, x, y);
  if (!t || townRating(t) >= refuseBelow(state)) return null;
  return `${t.name}'s local authority refuses (rating ${townRating(t)}; needs ${refuseBelow(state)}+)`;
}

/**
 * Monthly rating drift (OpenTTD's per-month station steps; TT has no road/tree monthly steps, so we keep the
 * cheap, simple model): +12 per station the company served (pick-up) recently, -15 per unserved station nearby.
 * Also ticks down any active advertising boost / funding / statue expiry is not needed (statue is permanent).
 */
export function authorityMonthlyTick(ctx) {
  const { state } = ctx;
  const towns = state.towns || [];
  const stations = (state.stations || []).filter((st) => st.tiles && st.tiles.length);
  const dist = localAuthorityDist(state);
  for (const town of towns) {
    ensureTown(town);
    if (stations.length) {
      let delta = 0;
      for (const st of stations) {
        if (manhattan(town.x, town.y, st.x, st.y) > dist) continue;
        // lastPickup is {CARGO: tick} in this codebase; some callers/tests set tick values.
        let lastTick = null;
        if (st.lastPickup && typeof st.lastPickup === 'object') {
          let best = -1; for (const v of Object.values(st.lastPickup)) if (typeof v === 'number' && v > best) best = v;
          if (best >= 0) lastTick = best;
        }
        if (lastTick == null && typeof st.lastPickUp === 'number') lastTick = st.lastPickUp; // alt spelling/day units
        const served = typeof lastTick === 'number' && (state.tick - lastTick) <= SERVED_DAYS * TICKS_PER_DAY;
        delta += served ? STATION_UP : STATION_DOWN;
      }
      if (delta) adjustCompanyRating(town, delta);
    }
    // Count down active funding/timers every month regardless of stations.
    if (town.fundMonths > 0) town.fundMonths -= 1;
    // Tick down the town-action timers (lazy fields; 0 => no effect, keep absent at 0).
    if (town.roadWorksMonths > 0) town.roadWorksMonths -= 1;
    if (town.exclusiveMonths > 0) town.exclusiveMonths -= 1;
    if (town.unwantedMonths > 0) town.unwantedMonths -= 1;
    if (!town.roadWorksMonths) delete town.roadWorksMonths;
    if (!town.exclusiveMonths) delete town.exclusiveMonths;
    if (!town.unwantedMonths) delete town.unwantedMonths;
  }
}

/** Actions the local authority window can take (base costs from OpenTTD town_cmd.cpp, scaled for TT). */
export function actionList(state, town) {
  const pop = town.population || 1;
  const rating = townRating(town);
  const unwanted = (town.unwantedMonths || 0) > 0;
  const bribeAllowed = getSetting(state, 'allowTownBribe') !== false;
  const bribeOk = !unwanted && bribeAllowed && rating < RATING_BRIBE_MAXIMUM;
  const bribeDetail = !bribeAllowed ? 'Bribing disabled in game settings' : `+${RATING_BRIBE_UP_STEP} rating; 1/14 chance the town turns hostile`;
  const blocked = (ok) => unwanted ? false : ok;
  const blockedDetail = (ok, detail) => unwanted ? 'The town will not deal with this company' : detail;
  return [
    { id: 'advertise_small', label: 'Small advertising campaign', cost: constructionTotal(state, Math.round(pop * 4), 'property'), hint: '+25 station rating for 3 months', detail: '+25 station rating for 3 months', ok: blocked(rating < MAX_COMPANY_RATING), enabled: blocked(rating < MAX_COMPANY_RATING) },
    { id: 'advertise_medium', label: 'Medium advertising campaign', cost: constructionTotal(state, Math.round(pop * 9), 'property'), hint: '+50 station rating for 6 months', detail: '+50 station rating for 6 months', ok: blocked(rating < MAX_COMPANY_RATING), enabled: blocked(rating < MAX_COMPANY_RATING) },
    { id: 'advertise_large', label: 'Large advertising campaign', cost: constructionTotal(state, Math.round(pop * 18), 'property'), hint: '+75 station rating for 12 months', detail: '+75 station rating for 12 months', ok: blocked(rating < MAX_COMPANY_RATING), enabled: blocked(rating < MAX_COMPANY_RATING) },
    { id: 'fund', label: 'Fund new buildings', cost: constructionTotal(state, Math.max(COSTS.fundBuildings, Math.round(pop * 40)), 'property'), hint: `+growth for ${FUND_MONTHS} months`, detail: blockedDetail((town.fundMonths || 0) <= 0, (town.fundMonths || 0) > 0 ? `Active, ${town.fundMonths} more months` : `+growth for ${FUND_MONTHS} months`), ok: blocked((town.fundMonths || 0) <= 0), enabled: blocked((town.fundMonths || 0) <= 0) },
    { id: 'roadworks', label: 'Fund local road reconstruction', cost: constructionTotal(state, Math.max(COSTS.roadRebuild, Math.round(pop * 25)), 'property'), hint: `Repairs town roads, slows cars ${ROAD_WORKS_MONTHS} months`, detail: blockedDetail((town.roadWorksMonths || 0) <= 0, (town.roadWorksMonths || 0) > 0 ? `Active, ${town.roadWorksMonths} more months` : `Repairs town roads, slows cars ${ROAD_WORKS_MONTHS} months`), ok: blocked((town.roadWorksMonths || 0) <= 0), enabled: blocked((town.roadWorksMonths || 0) <= 0) },
    { id: 'rights', label: 'Buy exclusive transport rights', cost: constructionTotal(state, Math.max(EXCLUSIVE_BASE, Math.round(pop * 120)), 'property'), hint: `${EXCLUSIVE_MONTHS} months (no other company in this town)`, detail: blockedDetail((town.exclusiveMonths || 0) <= 0, (town.exclusiveMonths || 0) > 0 ? `Active, ${town.exclusiveMonths} more months` : `${EXCLUSIVE_MONTHS} months (no other company in this town)`), ok: blocked((town.exclusiveMonths || 0) <= 0), enabled: blocked((town.exclusiveMonths || 0) <= 0) },
    { id: 'statue', label: 'Build a statue of the company owner', cost: constructionTotal(state, Math.max((COSTS.buildStatue ?? 45000), Math.round(pop * 60)), 'property'), hint: `Permanent +${STATUE_BONUS} rating`, detail: blockedDetail(!town.statue, town.statue ? 'Already built' : `Permanent +${STATUE_BONUS} rating`), ok: blocked(!town.statue), enabled: blocked(!town.statue) },
    { id: 'bribe', label: 'Bribe the town council', cost: constructionTotal(state, Math.max(10_000, Math.round(pop * 80)), 'property'), hint: `+${RATING_BRIBE_UP_STEP} rating; 1/14 chance the town turns hostile`, detail: bribeDetail, ok: bribeOk, enabled: bribeOk },
  ];
}

/** Carry out a local authority action; returns {ok,error?}. */
export function doTownAction(ctx, townId, actionId, opts = {}) {
  const { state } = ctx;
  const town = (state.towns || []).find((t) => t.id === townId);
  if (!town) return { ok: false, error: 'Unknown town' };
  ensureTown(town);
  const entry = actionList(state, town).find((a) => a.id === actionId);
  if (!entry) return { ok: false, error: 'Unknown town action' };
  if (actionId === 'statue' && town.statue) return { ok: false, error: `${town.name} already has a statue` };
  if (actionId === 'fund' && town.fundMonths > 0) return { ok: false, error: `${town.name} is already funded` };
  if (actionId === 'roadworks' && town.roadWorksMonths > 0) return { ok: false, error: `${town.name} roads are already being rebuilt` };
  if (actionId === 'rights' && town.exclusiveMonths > 0) return { ok: false, error: `${town.name} exclusive rights are already bought` };
  // OpenTTD town_cmd.cpp GetMaskOfTownActions: an unwanted company (failed bribe) gets no town actions at all
  if (town.unwantedMonths > 0) return { ok: false, error: `${town.name} refuses to deal with you for ${town.unwantedMonths} more months` };
  if (actionId === 'bribe' && getSetting(ctx.state, 'allowTownBribe') === false) return { ok: false, error: 'Bribing the town council is disabled in game settings' };
  if (actionId === 'bribe' && townRating(town) >= RATING_BRIBE_MAXIMUM) return { ok: false, error: `${town.name} rating is already maximal` };
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
  } else if (actionId === 'roadworks') {
    town.roadWorksMonths = ROAD_WORKS_MONTHS;
    notify(ctx, `Local road reconstruction started in ${town.name}`, 'info', town.x, town.y, 'general');
  } else if (actionId === 'rights') {
    town.exclusiveMonths = EXCLUSIVE_MONTHS;
    // Effect: other companies' cargo in this town is blocked. We have one company, so nothing is blocked (documented).
    notify(ctx, `${state.company.name} bought exclusive transport rights in ${town.name} for ${EXCLUSIVE_MONTHS} months`, 'good', town.x, town.y, 'general');
  } else if (actionId === 'bribe') {
    if (createRng(state).chance(BRIBE_FAIL_CHANCE)) {
      town.unwantedMonths = BRIBE_UNWANTED_MONTHS;
      for (const st of state.stations) {
        if (!st.tiles || !st.tiles.length) continue;
        if (authorityTown(state, st.x, st.y) !== town) continue;
        for (const k of Object.keys(st.rating || {})) st.rating[k] = 0;
      }
      if (townRating(town) > RATING_BRIBE_DOWN_TO) town.companyRating = RATING_BRIBE_DOWN_TO;
      notify(ctx, `${town.name}'s council refused the bribe; the town will not deal with you for ${BRIBE_UNWANTED_MONTHS} months`, 'bad', town.x, town.y, 'general');
    } else {
      const r = townRating(town);
      town.companyRating = Math.max(r, Math.min(r + RATING_BRIBE_UP_STEP, RATING_BRIBE_MAXIMUM));
      notify(ctx, `${town.name}'s council accepted the bribe`, 'good', town.x, town.y, 'general');
    }
  }
  spend(state.company, 'property', entry.cost);
  return { ok: true, cost: entry.cost };
}

/** Station advertising bonus at the current tick (0 when none or expired). */
export function advertBonus(state, st) {
  const b = st.adBoost;
  return b && state.tick < b.until ? b.amount : 0;
}

function ratingKey(companyId) {
  if (companyId == null) return 'player';
  return String(companyId);
}

/**
 * OpenTTD CmdTownRating: set a company's rating in a town (clamped to [-1000, 1000]).
 * Supports per-company ratings via t.ratings map (K4); player also mirrored to companyRating for compat.
 * @param {object} ctx game context (needs state.towns)
 * @param {number} townId
 * @param {number|string|null} companyId null/undefined => player
 * @param {number} rating
 * @param {{dryRun?:boolean}} [opts]
 * @returns {{ok:true,cost:0,rating:number}|{ok:false,error:string}}
 */
export function setTownRatingCmd(ctx, townId, companyId, rating, opts = {}) {
  const town = (ctx.state.towns || []).find((t) => t.id === townId);
  if (!town) return { ok: false, error: 'Unknown town' };
  const v = Math.max(MIN_COMPANY_RATING, Math.min(MAX_COMPANY_RATING, Math.round(rating)));
  if (opts.dryRun) return { ok: true, cost: 0, rating: v };
  const key = ratingKey(companyId);
  if (!town.ratings || typeof town.ratings !== 'object') town.ratings = {};
  town.ratings[key] = v;
  if (key === 'player') town.companyRating = v;
  return { ok: true, cost: 0, rating: v };
}

const ADVERTISE = {
  small: { months: 3, bonus: 25, radius: 15 },
  medium: { months: 6, bonus: 50, radius: 20 },
  large: { months: 12, bonus: 75, radius: 25 },
};

/** HTML for the Local authority tab of the town window. */
export function renderAuthorityTab(state, town) {
  const r = townRating(town);
  const pct = Math.round(((r - MIN_COMPANY_RATING) / (MAX_COMPANY_RATING - MIN_COMPANY_RATING)) * 100);
  const actions = actionList(state, town);
  const funded = town.fundMonths > 0 ? `<span style="opacity:.7;margin-left:6px">funded ${town.fundMonths}mo</span>` : '';
  const statue = town.statue ? `<span style="opacity:.7;margin-left:6px">statue built</span>` : '';
  const roadw = town.roadWorksMonths > 0 ? `<span style="opacity:.7;margin-left:6px">road works ${town.roadWorksMonths}mo</span>` : '';
  const rights = town.exclusiveMonths > 0 ? `<span style="opacity:.7;margin-left:6px">exclusive rights ${town.exclusiveMonths}mo</span>` : '';
  const unwanted = town.unwantedMonths > 0 ? `<span style="color:rgba(255,150,150,.95);margin-left:6px">hostile ${town.unwantedMonths}mo</span>` : '';
  const rows = actions.map((a) => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)">
      <div style="flex:1">
        <div style="font-size:12px">${a.label}</div>
        <div style="font-size:10px;opacity:.6">${a.hint}</div>
      </div>
      <button class="btn" data-taction="${a.id}" ${a.ok ? '' : 'disabled'}>£${a.cost.toLocaleString('en-GB')}</button>
    </div>`).join('');
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:11px;opacity:.7">Company rating</span>
      <b style="font-size:12px;color:${rankCss(r)}">${r}</b>${funded}${statue}${roadw}${rights}${unwanted}
    </div>
    <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden;margin-bottom:10px">
      <div style="height:100%;width:${pct}%;background:${rankCss(r)};opacity:.85"></div>
    </div>
    <div style="font-size:10px;opacity:.55;margin-bottom:6px">A rating below ${refuseBelow(state)} makes this town refuse your stations and demolition. Serve nearby stations to improve it.</div>
    ${rows}`;
}


/** Backwards-compatible aliases for callers expecting older API names. */
export const updateAuthorityMonthly = (state) => authorityMonthlyTick({ state });
export const townAction = (ctx, townId, actionId, opts) => doTownAction(ctx, townId, actionId, opts);
export const setTownRating = (ctx, townId, companyId, rating, opts) => setTownRatingCmd(ctx, townId, companyId, rating, opts);
export function getTownRating(state, townId, companyId = null) {
  const town = (state.towns || []).find((t) => t.id === townId);
  if (!town) return RATING_NEUTRAL;
  const key = ratingKey(companyId);
  if (town.ratings && typeof town.ratings[key] === 'number') return town.ratings[key];
  if (key === 'player') return townRating(town);
  return RATING_NEUTRAL;
}
export function actionCost(state, key) {
  // legacy helper: return base cost estimate for action key
  const pop = 100;
  if (key === 'advertise_small') return constructionTotal(state, Math.round(pop * 4), 'property');
  if (key === 'advertise_medium') return constructionTotal(state, Math.round(pop * 9), 'property');
  if (key === 'advertise_large') return constructionTotal(state, Math.round(pop * 18), 'property');
  if (key === 'fund') return constructionTotal(state, Math.max(COSTS.fundBuildings, Math.round(pop * 40)), 'property');
  if (key === 'statue') return constructionTotal(state, Math.max((COSTS.buildStatue ?? 45000), Math.round(pop * 60)), 'property');
  if (key === 'roadworks') return constructionTotal(state, Math.max(COSTS.roadRebuild, Math.round(pop * 25)), 'property');
  if (key === 'rights') return constructionTotal(state, Math.max(EXCLUSIVE_BASE, Math.round(pop * 120)), 'property');
  if (key === 'bribe') return constructionTotal(state, Math.max(10_000, Math.round(pop * 80)), 'property');
  return 0;
}
export function demolishRefusal(state, jobs) {
  // Check authority at any demolished tile; return refusal reason or null
  for (const j of (jobs || [])) {
    const r = refusalAt(state, j.x, j.y);
    if (r) return r;
  }
  return null;
}
export function applyDemolishPenalty(state, jobs) {
  // Apply rating penalty for demolishing structures near a town (OpenTTD: tree -35, road edge -18).
  for (const j of (jobs || [])) {
    const t = authorityTown(state, j.x, j.y);
    if (!t) continue;
    if (j.kind === 'clear') adjustCompanyRating(t, TREE_DOWN_STEP);
    else if (j.kind === 'track' || j.kind === 'house' || j.tile?.building) adjustCompanyRating(t, ROAD_DOWN_STEP);
  }
}
export { ADVERTISE };
