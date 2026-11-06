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
import { recomputeAllAcceptance } from './stations.js';
import { manhattan } from './state.js';
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
};

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
  if (!coordsOk(state.map, x, y)) err = FOUND_ERR.bounds;
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
  const town = createTown(state, rng, x, y);
  spend(state.company, 'construction', cost);
  recomputeAllAcceptance(state);
  return { ok: true, cost, town: { id: town.id, name: town.name, x, y } };
}

/** Commit a fund-industry command (typeId, top-left x,y). Charges the inflated base price. */
function commitIndustry(ctx, typeId, x, y, opts) {
  const { state } = ctx;
  const type = INDUSTRY_BY_ID[typeId];
  if (!type) return { ok: false, error: FOUND_ERR.industryType };
  if (!coordsOk(state.map, x, y)) return { ok: false, error: FOUND_ERR.bounds };
  if (!canPlaceIndustry(state, type, x, y)) return { ok: false, error: FOUND_ERR.industrySite };
  const cost = industryPrice(state, typeId);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost };
  const ind = placeIndustry(state, typeId, x, y);
  spend(state.company, 'construction', cost);
  recomputeAllAcceptance(state);
  return { ok: true, cost, industry: { id: ind.id, name: ind.name, typeId, x, y } };
}

/**
 * Found a town centred on tile (x,y).
 * @param {{state:object, rng?:object}} ctx
 * @returns {{ok:true,cost:number,town?:object}|{ok:false,error:string}}
 */
export function foundTown(ctx, x, y, opts = {}) {
  return commitTown(ctx, x, y, opts);
}

/**
 * Fund a new industry of type typeId with its top-left tile at (x,y).
 * @param {{state:object}} ctx
 * @returns {{ok:true,cost:number,industry?:object}|{ok:false,error:string}}
 */
export function fundIndustry(ctx, typeId, x, y, opts = {}) {
  return commitIndustry(ctx, typeId, x, y, opts);
}

