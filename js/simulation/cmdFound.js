/**
 * Found a town and fund an industry (OpenTTD CMD_FOUND_TOWN / CMD_BUILD_INDUSTRY, OpenLoco
 * CreateTown / CreateIndustry). Both create the record through the same helpers as the map generator
 * (towns.js createTown, industries.js placeIndustry), so a player-made town or industry is indistinguishable
 * from a generated one. Prices are flat base amounts from config/costs.js scaled by inflation (prices.js).
 *
 * estimateFoundTown / estimateFundIndustry are pure and shared with the UI preview (dryRun option of the
 * commands). Money is charged to the company as construction spending.
 */
import { COSTS, INDUSTRY_FUND_COSTS } from '../config/costs.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { checkMoney, coordsOk } from './trackRules.js';
import { createTown } from './towns.js';
import { placeIndustry, canPlaceIndustry } from './industries.js';
import { getSetting } from './settings.js';
import { pushNews } from './news.js';
import { recomputeAllAcceptance } from './stations.js';
import { manhattan, nearestTown } from './state.js';
import { createRng } from './rng.js';

/** Minimum manhattan distance between town centres (player-founded towns). */
export const TOWN_MIN_DIST = 8;
/** Edge margin: a new town needs room for its street grid. */
export const TOWN_MARGIN = 2;
/** Highest tile height a town centre may sit on (generator uses the same limit). */
const TOWN_MAX_HEIGHT = 5;

export const FOUND_ERR = {
  bounds: 'Site is outside the map',
  water: 'Cannot found a town on water',
  height: 'Site is too steep for a town',
  occupied: 'Site is occupied by a building, track or road',
  nearTown: `Too close to another town (min ${TOWN_MIN_DIST} tiles)`,
  notLand: 'Not enough land around the site for a town',
  industryType: 'Unknown industry type',
  industrySite: 'Industry site is not free: needs flat land, no water, track, buildings or industries, 8+ tiles from towns and 9+ from industries',
  rawNone: 'Raw industries cannot be funded in this game (setting: raw industry construction = none)',
  notRaw: 'Only raw industries are prospected; processing industries are funded',
  prospectUnlucky: 'Prospecting was unlucky: nothing found this time (money is spent)',
  prospectNoSite: 'Prospecting found no suitable place on the map (money is spent)',
};

/** OpenTTD raw_industry_construction (settings_type.h): 'normal' = funding, 'none' = raw industries cannot be built, 'prospect' = prospecting (industry_cmd.cpp:2095). */
export const RAW_CONSTRUCTION_MODES = ['normal', 'none', 'prospect'];
/** OpenTTD prospecting attempts for a random free site (industry_cmd.cpp:2105 loop bound). */
export const PROSPECT_TRIES = 5000;
/** OpenTTD prospecting_chance per raw type (build_industry.h pc column, as a fraction of 2^32); unlisted raw types use 0.70. */
export const PROSPECT_CHANCE = { coal_mine: 0.70, forest: 0.75, farm: 0.85, iron_mine: 0.70, oil_wells: 0.60 };
const DEFAULT_PROSPECT_CHANCE = 0.70;

/** OpenTTD IsRawIndustry: produces cargo and accepts none (processing industries accept some input). */
export function isRawIndustry(type) {
  return !!type && type.produces.length > 0 && type.accepts.length === 0;
}

/** Raw construction mode of this game (setting rawIndustryConstruction, default 'normal'). */
export function rawIndustryMode(state) {
  const m = getSetting(state, 'rawIndustryConstruction');
  return RAW_CONSTRUCTION_MODES.includes(m) ? m : 'normal';
}

/** Town site check (pure). @returns {string} error or '' */
export function townSiteError(state, x, y) {
  const map = state.map;
  if (!coordsOk(map, x, y)) return FOUND_ERR.bounds;
  if (x < TOWN_MARGIN || y < TOWN_MARGIN || x >= map.width - TOWN_MARGIN || y >= map.height - TOWN_MARGIN) return FOUND_ERR.bounds;
  const t = map.tiles[y * map.width + x];
  if (t.terrain === 'water') return FOUND_ERR.water;
  if (t.building || t.rail || t.road) return FOUND_ERR.occupied;
  if (t.height > TOWN_MAX_HEIGHT) return FOUND_ERR.height;
  if (state.towns.some((o) => manhattan(o.x, o.y, x, y) < TOWN_MIN_DIST)) return FOUND_ERR.nearTown;
  let land = 0;
  for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) {
    if (coordsOk(map, xx, yy) && map.tiles[yy * map.width + xx].terrain !== 'water') land++;
  }
  if (land < 40) return FOUND_ERR.notLand;
  return '';
}

/** Price of a new town (inflation-adjusted). */
export function townPrice(state) {
  return constructionTotal(state, COSTS.foundTown);
}

/** Price of an industry of a type (inflation-adjusted). */
export function industryPrice(state, typeId) {
  return constructionTotal(state, INDUSTRY_FUND_COSTS[typeId] || 0);
}

/**
 * Pure estimate for the UI: {ok, cost, error}. error is set when the site or money is refused.
 * @param {'town'|'industry'} kind
 */
export function estimateFound(state, kind, x, y, typeId) {
  if (kind === 'town') {
    const cost = townPrice(state);
    const err = townSiteError(state, x, y) || (checkMoney(state, cost) || {}).error || '';
    return { ok: !err, cost, error: err || null };
  }
  const type = INDUSTRY_BY_ID[typeId];
  if (!type) return { ok: false, cost: 0, error: FOUND_ERR.industryType };
  const cost = industryPrice(state, typeId);
  let err = '';
  if (isRawIndustry(type) && rawIndustryMode(state) === 'none') err = FOUND_ERR.rawNone;
  else if (isRawIndustry(type) && rawIndustryMode(state) === 'prospect') { /* random site: no site check here */ }
  else if (!coordsOk(state.map, x, y)) err = FOUND_ERR.bounds;
  else if (!canPlaceIndustry(state, type, x, y)) err = FOUND_ERR.industrySite;
  if (!err) err = (checkMoney(state, cost) || {}).error || '';
  return { ok: !err, cost, error: err || null };
}

/** Commit a found-town command. Charges COSTS.foundTown (inflated). */
function commitTown(ctx, x, y, opts) {
  const { state } = ctx;
  const err = townSiteError(state, x, y);
  if (err) return { ok: false, error: err };
  const cost = townPrice(state);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost };
  const rng = ctx.rng || createRng(state);
  const town = createTown(state, rng, x, y, undefined, undefined, opts.layout);
  spend(state.company, 'construction', state.editor ? 0 : cost);
  recomputeAllAcceptance(state);
  return { ok: true, cost, town: { id: town.id, name: town.name, x, y } };
}

/** Commit a fund-industry command (typeId, top-left x,y). Charges the inflated base price. */
function commitIndustry(ctx, typeId, x, y, opts) {
  const { state } = ctx;
  const type = INDUSTRY_BY_ID[typeId];
  if (!type) return { ok: false, error: FOUND_ERR.industryType };
  if (isRawIndustry(type) && rawIndustryMode(state) === 'none') return { ok: false, error: FOUND_ERR.rawNone };
  if (!coordsOk(state.map, x, y)) return { ok: false, error: FOUND_ERR.bounds };
  if (!canPlaceIndustry(state, type, x, y)) return { ok: false, error: FOUND_ERR.industrySite };
  const cost = industryPrice(state, typeId);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost };
  const ind = placeIndustry(state, typeId, x, y);
  spend(state.company, 'construction', state.editor ? 0 : cost);
  recomputeAllAcceptance(state);
  return { ok: true, cost, industry: { id: ind.id, name: ind.name, typeId, x, y } };
}

/**
 * Found a town centred on tile (x,y).
 * @param {{state:object, rng?:object}} ctx
 * @returns {{ok:true,cost:number,town?:object}|{ok:false,error:string}}
 */
export function foundTown(ctx, x, y, opts = {}) {
  if (getSetting(ctx.state, 'townFounding') === 'forbidden') return { ok: false, error: 'Founding new towns is forbidden in these settings' };
  return commitTown(ctx, x, y, opts);
}

/**
 * Fund a new industry of type typeId with its top-left tile at (x,y).
 * @param {{state:object}} ctx
 * @returns {{ok:true,cost:number,industry?:object}|{ok:false,error:string}}
 */
export function fundIndustry(ctx, typeId, x, y, opts = {}) {
  // prospect mode: a raw industry is never placed at (x,y); it is prospected at a random site
  if (rawIndustryMode(ctx.state) === 'prospect' && isRawIndustry(INDUSTRY_BY_ID[typeId])) return prospectIndustry(ctx, typeId, opts);
  return commitIndustry(ctx, typeId, x, y, opts);
}

/**
 * Prospect a raw industry (OpenTTD CmdBuildIndustry prospect branch, industry_cmd.cpp:2095-2130).
 * Pays the construction price; with the type's prospecting chance the industry is placed on a random
 * valid site (up to PROSPECT_TRIES draws from the game rng). Failure keeps the money spent and news says so.
 * opts.dryRun = check only (no rng draws). Returns {ok, cost, industry?, prospectFailed?}.
 */
export function prospectIndustry(ctx, typeId, opts = {}) {
  const { state } = ctx;
  const type = INDUSTRY_BY_ID[typeId];
  if (!type) return { ok: false, error: FOUND_ERR.industryType };
  if (!isRawIndustry(type)) return { ok: false, error: FOUND_ERR.notRaw };
  const cost = industryPrice(state, typeId);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost };
  const rng = ctx.rng || createRng(state);
  spend(state.company, 'construction', state.editor ? 0 : cost);
  const chance = PROSPECT_CHANCE[typeId] ?? DEFAULT_PROSPECT_CHANCE;
  if (rng.next() > chance) {
    pushNews(state, `Prospecting failed: no ${type.name} found this time.`, 'bad', undefined, undefined, 'industryOpen');
    return { ok: true, cost, industry: null, prospectFailed: true, error: null };
  }
  const { map } = state;
  let site = null;
  for (let i = 0; i < PROSPECT_TRIES && !site; i++) {
    const x = rng.int(0, map.width - 1), y = rng.int(0, map.height - 1);
    if (canPlaceIndustry(state, type, x, y)) site = { x, y };
  }
  if (!site) {
    pushNews(state, `Prospecting failed: no suitable place for a ${type.name} was found.`, 'bad', undefined, undefined, 'industryOpen');
    return { ok: true, cost, industry: null, prospectFailed: true, error: null };
  }
  const ind = placeIndustry(state, typeId, site.x, site.y);
  recomputeAllAcceptance(state);
  const town = nearestTown(state, site.x, site.y);
  pushNews(state, `New ${type.name} found${town ? ' near ' + town.name : ''}: ${ind.name}.`, 'good', site.x, site.y, 'industryOpen');
  return { ok: true, cost, industry: { id: ind.id, name: ind.name, typeId, x: site.x, y: site.y }, prospectFailed: false };
}

