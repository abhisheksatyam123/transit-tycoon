/**
 * AI competitor companies (gap #25 stage 1, OpenLoco CompanyAi, reduced to bus routes).
 *
 * Opt-in: the `aiCompanies` setting (0..3, default 0). With 0 nothing here runs and no state is created,
 * so default games (and their hashes/saves) are unchanged. The rivals use only the game's own commands
 * (buildRoadStop, buildDepot, buyVehicle, setOrders, startVehicle, sellVehicle) with `owner: rivalId`, so
 * costs and placement rules match the player's. Nothing here uses the game rng (determinism).
 *
 * Each month, per rival:
 *  1. vehicles with 12 consecutive negative-profit months are sent to a depot and sold;
 *  2. with enough money, a route is built: the best unserved town pair 15..40 tiles apart that is already
 *     on one town road network: a bus stop in each town, a road depot, and 2 buses with 2 orders.
 */
import { getSetting } from './settings.js';
import { createCompany } from './economy.js';
import { allocId, findStation, manhattan } from './state.js';
import { getTile, inBounds } from './map.js';
import { labelComponents } from './diagIssue.js';
import { TOWN_CORE_RADIUS } from './diagChecksMap.js';
import { DIRS } from './constants.js';
import { buildRoadStop, buildDepot } from './cmdStation.js';
import { buyVehicle, setOrders, startVehicle, sellVehicle, sendToDepot } from './cmdVehicle.js';
import { listModels } from './queries.js';
import { straightAxis } from './network.js';
import { companyById } from './owner.js';

export const AI_NAMES = ['Northern Lines', 'Velox Transit', 'Iron Coach Co.'];
export const AI_COLOURS = ['#d9482b', '#2b7fd9', '#3aa35a'];
/** Town pair distance window (manhattan tiles). */
export const ROUTE_MIN_DIST = 15;
export const ROUTE_MAX_DIST = 40;
/** A rival only starts a new route with at least this much cash (stops + depot + 2 buses). */
export const ROUTE_BUDGET = 30000;
/** Months of negative profit before a vehicle is sold. */
export const SELL_AFTER_MONTHS = 12;
const MAX_ROUTES = 8;
/** Served-town radius: a town with a station within this manhattan distance of its centre counts as served. */
const SERVED_RADIUS = 10;

/** Create the rivals (lazy; only when the setting asks for them). Returns the rival list. */
export function ensureRivals(state, n) {
  if (!state.rivals) state.rivals = [];
  while (state.rivals.length < n) {
    const i = state.rivals.length;
    // a full company record (ledger, loan, history) so the shared money helpers work unchanged
    state.rivals.push({
      ...createCompany(AI_NAMES[i % AI_NAMES.length]),
      id: allocId(state), colour: AI_COLOURS[i % AI_COLOURS.length],
      vehicles: [], stations: [], depots: [], routes: [], stats: { profit: 0, vehicles: 0 }, valueHistory: [],
    });
  }
  return state.rivals;
}

/** Monthly AI turn (called from the game loop after the vehicle monthly, so profits are current). */
export function updateMonthly(game) {
  const state = game.state;
  const n = getSetting(state, 'aiCompanies') | 0;
  if (n <= 0) return;
  const ctx = game.ctx;
  const rivals = ensureRivals(state, Math.min(3, n));
  for (const r of rivals) {
    r.vehicles = r.vehicles.filter((id) => state.vehicles.some((v) => v.id === id));
    for (const v of state.vehicles) if (v.ownerId === r.id) updateNegMonths(v);
    sellUnprofitable(ctx, r);
    if (r.money >= ROUTE_BUDGET && r.routes.length < MAX_ROUTES) buildRoute(ctx, r);
    refreshStats(state, r);
  }
}

/** Consecutive months with a loss (v.profit[0] is the month just closed). */
function updateNegMonths(v) {
  const last = v.profit && v.profit.length ? v.profit[0] : 0;
  v.aiNegMonths = last < 0 ? (v.aiNegMonths || 0) + 1 : 0;
}

function sellUnprofitable(ctx, r) {
  const { state } = ctx;
  for (const v of state.vehicles) {
    if (v.ownerId !== r.id || (v.aiNegMonths || 0) < SELL_AFTER_MONTHS) continue;
    if (v.state === 'depot') {
      const res = sellVehicle(ctx, v.id, { owner: r.id });
      if (res.ok) r.vehicles = r.vehicles.filter((id) => id !== v.id);
    } else if (v.goingToDepot == null) {
      sendToDepot(ctx, v.id, { owner: r.id });
    }
  }
}

/** Monthly bookkeeping for the league: company value (cash + fleet) and last month's profit. */
function refreshStats(state, r) {
  let fleet = 0, profit = 0, count = 0;
  for (const v of state.vehicles) {
    if (v.ownerId !== r.id) continue;
    fleet += v.value || 0;
    profit += v.profit && v.profit.length ? v.profit[0] : 0;
    count++;
  }
  r.stats = { profit, vehicles: count };
  r.companyValue = r.money - (r.loan || 0) + fleet;
  r.valueHistory.unshift(r.companyValue);
  if (r.valueHistory.length > 120) r.valueHistory.length = 120;
}

/** Index of the road component of the town's core (-1 if the core has no road). */
function townComponent(state, labels, town) {
  const { map } = state;
  const R = TOWN_CORE_RADIUS;
  for (let y = town.y - R; y <= town.y + R; y++) {
    for (let x = town.x - R; x <= town.x + R; x++) {
      if (!inBounds(map, x, y)) continue;
      if (getTile(map, x, y).road) return labels[y * map.width + x];
    }
  }
  return -1;
}

/** True when a station (of any owner) already serves the town centre. */
function townServed(state, town) {
  return state.stations.some((st) => manhattan(st.x, st.y, town.x, town.y) <= SERVED_RADIUS);
}

/**
 * Best unserved, road-connected town pair 15..40 apart: highest combined population, then lowest id.
 * @returns {[object, object]|null}
 */
export function pickTownPair(state) {
  const labels = labelComponents(state.map, 'road', () => true);
  const cands = state.towns.filter((t) => !townServed(state, t))
    .map((t) => ({ t, comp: townComponent(state, labels, t) }))
    .filter((c) => c.comp >= 0);
  let best = null, bestScore = -1;
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i], b = cands[j];
      if (a.comp !== b.comp) continue;
      const d = manhattan(a.t.x, a.t.y, b.t.x, b.t.y);
      if (d < ROUTE_MIN_DIST || d > ROUTE_MAX_DIST) continue;
      const score = (a.t.population || 0) + (b.t.population || 0);
      if (score > bestScore) { bestScore = score; best = [a.t, b.t]; }
    }
  }
  return best;
}

/** Bus stop on a straight road tile in the town core (first in row-major order that the rules accept). */
function placeStop(ctx, town, owner) {
  const { state } = ctx;
  const map = state.map;
  const R = TOWN_CORE_RADIUS;
  for (let y = town.y - R; y <= town.y + R; y++) {
    for (let x = town.x - R; x <= town.x + R; x++) {
      if (!inBounds(map, x, y)) continue;
      const t = getTile(map, x, y);
      if (!t.road || t.rail || t.building || !straightAxis(t.road)) continue;
      const r = buildRoadStop(ctx, x, y, 'bus', { owner });
      if (r.ok) return findStation(state, r.stationId);
    }
  }
  return null;
}

/** Road depot on empty land next to a road in the town core. */
function placeDepot(ctx, town, owner) {
  const { state } = ctx;
  const map = state.map;
  const R = 8;
  for (let y = town.y - R; y <= town.y + R; y++) {
    for (let x = town.x - R; x <= town.x + R; x++) {
      if (!inBounds(map, x, y)) continue;
      const t = getTile(map, x, y);
      if (t.road || t.rail || t.building || t.terrain === 'water') continue;
      for (const d of DIRS) {
        const nx = x + d.dx, ny = y + d.dy;
        if (!inBounds(map, nx, ny) || !getTile(map, nx, ny).road) continue;
        const r = buildDepot(ctx, x, y, 'road', d.bit, { owner });
        if (r.ok) return state.depots.find((q) => q.id === r.depotId) || null;
      }
    }
  }
  return null;
}

/** Build one route for the rival: stops in both towns, a depot, 2 buses on the two stops. */
function buildRoute(ctx, r) {
  const { state } = ctx;
  const pair = pickTownPair(state);
  if (!pair) return false;
  const [ta, tb] = pair;
  const owner = r.id;
  const sa = placeStop(ctx, ta, owner);
  if (!sa) return false;
  const sb = placeStop(ctx, tb, owner);
  if (!sb) return false;
  const depot = placeDepot(ctx, ta, owner);
  if (!depot) return false;
  // a stop reused from an earlier route (same town) is already listed
  for (const id of [sa.id, sb.id]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  const models = listModels(state, 'bus').sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  const model = models[0];
  if (!model) return false;
  for (let k = 0; k < 2; k++) {
    const b = buyVehicle(ctx, depot.id, { modelId: model.id }, { owner });
    if (!b.ok) break;
    const v = b.vehicle;
    const o = setOrders(ctx, v.id, [{ stationId: sa.id }, { stationId: sb.id }], { owner });
    if (!o.ok) break;
    startVehicle(ctx, v.id, { owner });
    r.vehicles.push(v.id);
  }
  r.routes.push({ a: sa.id, b: sb.id, depot: depot.id, towns: [ta.id, tb.id] });
  return true;
}

/** The rival company record for a stamped entity (null for the player). */
export function ownerOf(state, entity) {
  return entity && entity.ownerId != null ? companyById(state, entity.ownerId) : null;
}
