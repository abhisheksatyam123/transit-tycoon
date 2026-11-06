/**
 * Company headquarters (OpenTTD CMD_BUILD_OBJECT OBJECT_HQ / BuildCompanyHQ, UpdateCompanyHQ; OpenLoco
 * HeadquarterBuilding, CompanyManager::updateMonthlyHeadquarters). One 2x2 HQ per company, stored lazily as
 * state.company.hq = {x, y, level} (absent = no HQ) and on its four tiles as tile.building = {type:'hq', dx, dy, level}.
 * The level follows the company performance index (Company::getHeadquarterPerformanceVariation, 0..4) and is
 * refreshed monthly; a level-up makes news. Building again elsewhere relocates the HQ (the old one is removed).
 * Demolishing an HQ tile removes the whole HQ without refund (see cmdTrack.js demolish).
 */
import { COSTS } from '../config/costs.js';
import { constructionTotal } from './prices.js';
import { spend } from './economy.js';
import { checkMoney, coordsOk } from './trackRules.js';
import { headquarterVariation } from './loco/company.js';
import { companyById } from './owner.js';
import { notify } from './news.js';

/** Footprint size of a headquarters (tiles). */
export const HQ_SIZE = 2;
/** Highest HQ level (OpenTTD/OpenLoco: 0..4). */
export const HQ_MAX_LEVEL = 4;

export const HQ_ERR = {
  bounds: 'Site is outside the map',
  water: 'Cannot build an HQ on water',
  terrain: 'Clear the trees or rock first',
  occupied: 'Site is occupied by a building, track or road',
  slope: 'Site is too uneven: the four tiles must differ by at most one height level',
  same: 'The HQ is already here',
};

/** Price of an HQ (inflation-adjusted). */
export function hqPrice(state) {
  return constructionTotal(state, COSTS.buildHQ);
}

/** Site check (pure). @returns {string} error or '' */
export function hqSiteError(state, x, y, owner = null) {
  const map = state.map;
  const hq = (companyById(state, owner) || state.company).hq;
  if (!coordsOk(map, x, y, x + HQ_SIZE - 1, y + HQ_SIZE - 1)) return HQ_ERR.bounds;
  if (hq && hq.x === x && hq.y === y) return HQ_ERR.same;
  let hmin = 99, hmax = -99;
  for (let yy = y; yy < y + HQ_SIZE; yy++) for (let xx = x; xx < x + HQ_SIZE; xx++) {
    const t = map.tiles[yy * map.width + xx];
    if (t.terrain === 'water') return HQ_ERR.water;
    if (t.terrain === 'forest' || t.terrain === 'rock') return HQ_ERR.terrain;
    if (t.building || t.rail || t.road) return HQ_ERR.occupied;
    hmin = Math.min(hmin, t.height); hmax = Math.max(hmax, t.height);
  }
  if (hmax - hmin > 1) return HQ_ERR.slope;
  return '';
}

/** Pure estimate for the UI: {ok, cost, error}. */
export function estimateHQ(state, x, y, owner = null) {
  const cost = hqPrice(state);
  const err = hqSiteError(state, x, y, owner) || (checkMoney(state, cost, companyById(state, owner) || state.company) || {}).error || '';
  return { ok: !err, cost, error: err || null };
}

/** Remove the HQ (all four tiles and the company record). Idempotent. */
export function removeHQ(state, owner = null) {
  const company = companyById(state, owner) || state.company;
  const hq = company.hq;
  if (!hq) return;
  const map = state.map;
  for (let dy = 0; dy < HQ_SIZE; dy++) for (let dx = 0; dx < HQ_SIZE; dx++) {
    const x = hq.x + dx, y = hq.y + dy;
    if (!coordsOk(map, x, y)) continue;
    const t = map.tiles[y * map.width + x];
    if (t.building && t.building.type === 'hq') { t.building = null; t.owner = null; }
  }
  delete company.hq;
}

function setLevel(state, level, company = state.company) {
  const hq = company.hq;
  hq.level = level;
  const map = state.map;
  for (let dy = 0; dy < HQ_SIZE; dy++) for (let dx = 0; dx < HQ_SIZE; dx++) {
    const t = map.tiles[(hq.y + dy) * map.width + hq.x + dx];
    if (t.building && t.building.type === 'hq') t.building.level = level;
  }
}

/**
 * Build (or relocate) the company HQ with its top-left tile at (x,y). Charges COSTS.buildHQ (inflated).
 * opts.dryRun = check only.
 * @param {{state:object}} ctx
 * @returns {{ok:true,cost:number,hq?:object}|{ok:false,error:string}}
 */
export function buildHQ(ctx, x, y, opts = {}) {
  const { state } = ctx;
  const owner = opts.owner ?? null;
  const c = companyById(state, owner);
  if (!c) return { ok: false, error: 'Unknown company' };
  const err = hqSiteError(state, x, y, owner);
  if (err) return { ok: false, error: err };
  const cost = hqPrice(state);
  const money = checkMoney(state, cost, c);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost };
  removeHQ(state, owner);
  const level = headquarterVariation(c);
  c.hq = { x, y, level };
  const map = state.map;
  for (let dy = 0; dy < HQ_SIZE; dy++) for (let dx = 0; dx < HQ_SIZE; dx++) {
    const t = map.tiles[(y + dy) * map.width + x + dx];
    t.building = { type: 'hq', dx, dy, level };
    t.owner = null;
  }
  spend(c, 'construction', cost);
  return { ok: true, cost, hq: { x, y, level } };
}

/**
 * Monthly HQ update (CompanyManager::updateMonthlyHeadquarters): level follows the performance index.
 * Does nothing when the company has no HQ, so games without one are untouched.
 * @param {{state:object,emit?:Function}} ctx
 */
export function updateHQ(ctx) {
  const { state } = ctx;
  updateCompanyHQ(ctx, state.company, null);
  for (const r of state.rivals || []) if (!r.bankrupt) updateCompanyHQ(ctx, r, r.id);
}

/** One company's HQ level update (the player's, or a rival's by id). */
function updateCompanyHQ(ctx, company, owner) {
  const { state } = ctx;
  const hq = company.hq;
  if (!hq) return;
  const level = Math.min(HQ_MAX_LEVEL, headquarterVariation(company));
  if (level === hq.level) return;
  const grew = level > hq.level;
  setLevel(state, level, company);
  if (owner != null) return; // rivals' HQ level changes are not news
  if (grew) notify(ctx, `${company.name}'s headquarters grew to level ${level}: the company is performing well.`, 'good', undefined, undefined, 'company');
  else notify(ctx, `${company.name}'s headquarters shrank to level ${level}.`, 'info', undefined, undefined, 'company');
}
