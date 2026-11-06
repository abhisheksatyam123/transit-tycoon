/**
 * AI competitor companies (gap #25 stages 1-2, OpenLoco CompanyAi, reduced to bus routes).
 *
 * Opt-in: the `aiCompanies` setting (0..3, default 0). With 0 nothing here runs and no state is created,
 * so default games (and their hashes/saves) are unchanged. The rivals use only the game's own commands
 * (buildRoadStop, buildDepot, buyVehicle, setOrders, startVehicle, sellVehicle) with `owner: rivalId`, so
 * costs and placement rules match the player's. Nothing here uses the game rng (determinism).
 *
 * Each month, per rival:
 *  1. loans: borrow when short of cash and expanding, repay when cash is comfortable; loan interest;
 *  2. vehicles with 12 consecutive negative-profit months are sent to a depot and sold;
 *  3. with enough money, a route is built: the best unserved town pair 15..40 tiles apart on one road
 *     network; stops on the straight road tiles that cover the most houses, a road depot on the same
 *     network, and 2 buses with 2 orders. Routes with waiting passengers get one more bus (up to 6);
 *  4. company value below zero for 12 months: the company is wound up (vehicles and stations removed).
 */
import { getSetting } from './settings.js';
import { createCompany, borrow, repay, spend, earn } from './economy.js';
import { allocId, findStation, manhattan } from './state.js';
import { getTile, inBounds } from './map.js';
import { labelComponents } from './diagIssue.js';
import { TOWN_CORE_RADIUS } from './diagChecksMap.js';
import { DIRS, OPPOSITE, CATCHMENT } from './constants.js';
import { canAddBits } from './trackRules.js';
import { buildRoadStop, buildDepot } from './cmdStation.js';
import { buyVehicle, setOrders, startVehicle, sellVehicle, sendToDepot } from './cmdVehicle.js';
import { listModels } from './queries.js';
import { straightAxis } from './network.js';
import { companyById } from './owner.js';
import { pushNews } from './news.js';

export const AI_NAMES = ['Northern Lines', 'Velox Transit', 'Iron Coach Co.'];
export const AI_COLOURS = ['#d9482b', '#2b7fd9', '#3aa35a'];
/** Town pair distance window (manhattan tiles). */
export const ROUTE_MIN_DIST = 15;
export const ROUTE_MAX_DIST = 40;
/** A rival only starts a new route with at least this much cash (stops + depot + 2 buses). */
export const ROUTE_BUDGET = 30000;
/** Months of negative profit before a vehicle is sold. */
export const SELL_AFTER_MONTHS = 12;
/** Months of negative company value before a rival is wound up (OpenTTD style bankruptcy). */
export const BANKRUPT_MONTHS = 12;
/** Buses per route: one more bus when passengers wait at an end and the route has fewer than this. */
export const MAX_BUSES_PER_ROUTE = 6;
const WAITING_FOR_BUS = 30;
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
      negValueMonths: 0,
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
  const ended = state.date.month === 0 ? { year: state.date.year - 1, month: 11 } : { year: state.date.year, month: state.date.month - 1 };
  for (const r of rivals) {
    if (r.bankrupt) continue;
    r.vehicles = r.vehicles.filter((id) => state.vehicles.some((v) => v.id === id));
    for (const v of state.vehicles) if (v.ownerId === r.id) updateNegMonths(v);
    closeRivalLedger(r, ended);
    chargeInterest(r);
    manageLoan(r);
    sellUnprofitable(ctx, r);
    if (r.money >= ROUTE_BUDGET && r.routes.length < MAX_ROUTES) buildRoute(ctx, r);
    addBuses(ctx, r);
    refreshStats(state, r);
    if (r.negValueMonths >= BANKRUPT_MONTHS) windUp(ctx, r);
  }
}

/** Monthly ledger for a rival (the player's is closed by the company manager). */
function closeRivalLedger(r, ended) {
  const cur = r.ledger.current;
  r.ledger.history.push({ year: ended.year, month: ended.month, income: cur.income, expenses: cur.expenses, byType: { ...cur.byType } });
  if (r.ledger.history.length > 36) r.ledger.history.shift();
  r.ledger.current = { income: 0, expenses: 0, byType: Object.fromEntries(Object.keys(cur.byType).map((k) => [k, 0])) };
}

/** Loan interest, same yearly rate as the player (5%, charged monthly). */
function chargeInterest(r) {
  spend(r, 'interest', Math.trunc((r.loan * 5) / 1200));
}

/** Borrow when short of cash and still expanding; repay once cash is comfortably above the route budget. */
function manageLoan(r) {
  if (r.money < ROUTE_BUDGET && r.routes.length < MAX_ROUTES && r.negValueMonths === 0) {
    borrow(r, 50000);
  } else if (r.loan > 0 && r.money > 4 * ROUTE_BUDGET) {
    repay(r, Math.min(r.loan, r.money - 2 * ROUTE_BUDGET));
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

/** Monthly bookkeeping for the league: company value (cash + fleet - loan) and last month's profit. */
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
  r.negValueMonths = r.companyValue < 0 ? (r.negValueMonths || 0) + 1 : 0;
  r.valueHistory.unshift(r.companyValue);
  if (r.valueHistory.length > 120) r.valueHistory.length = 120;
}

/**
 * Wind up a bankrupt rival: its vehicles and stations/depots are removed (no refund), the tiles are
 * cleared to plain road, and the company stays listed as bankrupt. News tells the player.
 */
function windUp(ctx, r) {
  const { state } = ctx;
  r.bankrupt = true;
  state.vehicles = state.vehicles.filter((v) => v.ownerId !== r.id);
  for (const st of state.stations.filter((s) => s.ownerId === r.id)) {
    for (const p of st.tiles) {
      const t = getTile(state.map, p.x, p.y);
      if (t.building && t.building.stationId === st.id) { t.building = null; t.owner = null; }
    }
  }
  state.stations = state.stations.filter((s) => s.ownerId !== r.id);
  for (const d of state.depots.filter((q) => q.ownerId === r.id)) {
    const t = getTile(state.map, d.x, d.y);
    if (t.building && t.building.depotId === d.id) { delete t[t.building.kind]; t.building = null; t.owner = null; }
  }
  state.depots = state.depots.filter((q) => q.ownerId !== r.id);
  r.vehicles = []; r.stations = []; r.depots = []; r.routes = [];
  r.companyValue = r.money - (r.loan || 0);
  pushNews(state, `${r.name} has gone bankrupt and been wound up.`, 'bad', undefined, undefined, 'company');
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

/** Houses within the bus catchment of a tile (more houses = more passengers). */
function housesAround(state, x, y) {
  const map = state.map, R = CATCHMENT.bus;
  let n = 0;
  for (let yy = y - R; yy <= y + R; yy++) {
    for (let xx = x - R; xx <= x + R; xx++) {
      if (!inBounds(map, xx, yy)) continue;
      const b = getTile(map, xx, yy).building;
      if (b && b.type === 'house') n++;
    }
  }
  return n;
}

/**
 * Bus stop on a straight road tile of the town's road network (component `comp`) that covers the most
 * houses; ties go to the first tile in row-major order.
 */
function placeStop(ctx, town, owner, labels, comp) {
  const { state } = ctx;
  const map = state.map;
  const R = TOWN_CORE_RADIUS;
  let best = null, bestHouses = -1;
  for (let y = town.y - R; y <= town.y + R; y++) {
    for (let x = town.x - R; x <= town.x + R; x++) {
      if (!inBounds(map, x, y)) continue;
      const t = getTile(map, x, y);
      if (!t.road || t.rail || t.building || !straightAxis(t.road) || labels[y * map.width + x] !== comp) continue;
      const h = housesAround(state, x, y);
      if (h > bestHouses) { bestHouses = h; best = { x, y }; }
    }
  }
  if (!best) return null;
  const r = buildRoadStop(ctx, best.x, best.y, 'bus', { owner });
  if (!r.ok) return null;
  return findStation(state, r.stationId);
}

/** Road depot on empty land next to a road of network `comp`, in the town core. */
function placeDepot(ctx, town, owner, labels, comp) {
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
        if (labels[ny * map.width + nx] !== comp) continue;
        // the exit must join the road: the neighbour takes the bit (or already has it) without a crossing
        const nt = getTile(map, nx, ny);
        if (!(nt.road & OPPOSITE[d.bit]) && canAddBits(nt, 'road', OPPOSITE[d.bit])) continue;
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
  const labels = labelComponents(state.map, 'road', () => true);
  const comp = townComponent(state, labels, ta);
  const sa = placeStop(ctx, ta, owner, labels, comp);
  if (!sa) return false;
  const sb = placeStop(ctx, tb, owner, labels, comp);
  if (!sb) return false;
  const depot = placeDepot(ctx, ta, owner, labels, comp);
  if (!depot) return false;
  // a stop reused from an earlier route (same town) is already listed
  for (const id of [sa.id, sb.id]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  const models = listModels(state, 'bus').sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  const model = models[0];
  if (!model) return false;
  const route = { a: sa.id, b: sb.id, depot: depot.id, towns: [ta.id, tb.id] };
  r.routes.push(route);
  for (let k = 0; k < 2; k++) addRouteBus(ctx, r, route);
  return true;
}

/** Buy one bus at the route's depot on its two stops and start it. */
function addRouteBus(ctx, r, route) {
  const { state } = ctx;
  const depot = state.depots.find((d) => d.id === route.depot);
  const models = listModels(state, 'bus').sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  if (!depot || !models[0]) return false;
  const b = buyVehicle(ctx, depot.id, { modelId: models[0].id }, { owner: r.id });
  if (!b.ok) return false;
  const v = b.vehicle;
  const o = setOrders(ctx, v.id, [{ stationId: route.a }, { stationId: route.b }], { owner: r.id });
  if (!o.ok) return false;
  startVehicle(ctx, v.id, { owner: r.id });
  r.vehicles.push(v.id);
  return true;
}

/** Passengers waiting at a station (all cargo). */
function waitingAt(state, id) {
  const st = findStation(state, id);
  if (!st || !st.cargo) return 0;
  let n = 0;
  for (const list of Object.values(st.cargo)) for (const p of list) n += p.amount;
  return n;
}

/** Add a bus to each route whose stops have passengers waiting and few buses (cash permitting). */
function addBuses(ctx, r) {
  const { state } = ctx;
  if (r.money < ROUTE_BUDGET / 2) return;
  for (const route of r.routes) {
    const onRoute = state.vehicles.filter((v) => v.ownerId === r.id && v.orders.length && v.orders.some((o) => o.stationId === route.a || o.stationId === route.b));
    if (onRoute.length >= MAX_BUSES_PER_ROUTE) continue;
    if (waitingAt(state, route.a) + waitingAt(state, route.b) < WAITING_FOR_BUS) continue;
    if (onRoute.some((v) => v.state === 'lost')) continue;
    addRouteBus(ctx, r, route);
    return; // one purchase per month keeps the rival's cash for other needs
  }
}

/** The rival company record for a stamped entity (null for the player). */
export function ownerOf(state, entity) {
  return entity && entity.ownerId != null ? companyById(state, entity.ownerId) : null;
}
