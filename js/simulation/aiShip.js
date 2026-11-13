/**
 * AI competitor ship freight (gap #25, OpenTTD-style): a rival with enough cash builds one ship route: a
 * producer (e.g. oil wells) and an accepting industry 15..80 tiles apart by water, a dock on land beside
 * water within catchment of each industry, a ship depot on water beside the source dock, and ships with a
 * full-load order at the source. Uses only the game's own commands with `owner: rivalId` (buildDock,
 * buildShipDepot, buyVehicle, setOrders, startVehicle), so costs and rules match the player's.
 * Nothing here draws from the game rng (determinism): candidates are ordered by score, then by ids.
 */
import { findStation, manhattan } from './state.js';
import { getTile, inBounds } from './map.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { SHIP_COSTS } from '../config/ships.js';
import { producedCargos, requiredCargos } from './loco/industry.js';
import { DIRS, ACCEPT_THRESHOLD } from './constants.js';
import { buildDock, buildShipDepot, DOCK_RADIUS } from './cmdShip.js';
import { buyVehicle, setOrders, startVehicle } from './cmdVehicle.js';
import { listModels } from './queries.js';
import { findShipPath, shipPassable } from './shipPath.js';
import { getSetting } from './settings.js';
import { tileAcceptance } from './stations.js';
import { pushNews } from './news.js';
import { beginRivalAttempt, rollbackRivalAttempt } from './rivalAttempt.js';

/** Water route distance window (tiles, dock to dock along the water). */
const SHIP_MIN_DIST = 15;
const SHIP_MAX_DIST = 80;
/** Producer must make at least this much per month. */
const MIN_PRODUCTION = 40;
/** Ship routes per rival, and ships per route. */
export const MAX_SHIP_ROUTES = 2;
const MAX_SHIPS = 2;
/** Cargo waiting at the source dock before one more ship is bought. */
const WAITING_FOR_SHIP = 60;
/** Dock spots kept per end; the water search tries every source/destination spot pair. */
const SPOTS_PER_END = 6;
/** Candidate industry pairs tried per month (each costs a few path searches). */
const PAIR_TRIES = 6;

/** Ship model that carries a cargo: highest capacity, then lowest id. */
export function shipModelFor(state, cargoId, ownerId = null) {
  const models = listModels(state, 'ship', ownerId).filter((m) => m.cargos.includes(cargoId));
  models.sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/** Ship routes a rival already has. */
export function shipRoutesOf(r) {
  return (r.routes || []).filter((q) => q.ship);
}

/** Cash a rival needs before a ship route: twice the estimated cost (2 docks, a depot, one ship). */
function shipRouteBudget(ship) {
  return 2 * (2 * SHIP_COSTS.dock + SHIP_COSTS.depot + ship.cost);
}

function centre(ind) {
  return { x: ind.x + Math.floor(ind.w / 2), y: ind.y + Math.floor(ind.h / 2) };
}

/** Candidate (producer, cargo, acceptor) pairs, best first (production, then nearest, then ids). */
export function shipCandidates(state, used = new Set()) {
  const out = [];
  for (const src of state.industries) {
    if (used.has(src.id)) continue;
    const type = INDUSTRY_BY_ID[src.typeId];
    if (!type) continue;
    for (const cargo of producedCargos(type)) {
      const prod = (src.production && src.production[cargo]) || 0;
      if (prod < MIN_PRODUCTION) continue;
      for (const dst of state.industries) {
        if (dst.id === src.id || used.has(dst.id)) continue;
        const dt = INDUSTRY_BY_ID[dst.typeId];
        if (!dt || !requiredCargos(dt).includes(cargo)) continue;
        const a = centre(src), b = centre(dst);
        const d = manhattan(a.x, a.y, b.x, b.y);
        if (d < SHIP_MIN_DIST || d > SHIP_MAX_DIST) continue;
        out.push({ src, dst, cargo, dist: d, score: prod * 100 - d });
      }
    }
  }
  out.sort((p, q) => q.score - p.score || p.src.id - q.src.id || p.dst.id - q.dst.id);
  return out;
}

/** Chebyshev distance from a tile to an industry footprint (0 = inside it). */
function footprintDist(ind, x, y) {
  const dx = Math.max(ind.x - x, 0, x - (ind.x + ind.w - 1));
  const dy = Math.max(ind.y - y, 0, y - (ind.y + ind.h - 1));
  return Math.max(dx, dy);
}

/** Open water neighbours of a land tile a ship may stop beside. */
function waterNeighbours(map, x, y) {
  const out = [];
  for (const d of DIRS) {
    const nx = x + d.dx, ny = y + d.dy;
    if (!inBounds(map, nx, ny)) continue;
    if (shipPassable(map, ny * map.width + nx)) out.push({ x: nx, y: ny });
  }
  return out;
}

/** Acceptance of a cargo at a would-be dock: the same catchment sum recomputeAcceptance uses. */
function catchAccepts(state, x, y, cargo) {
  const map = state.map;
  let sum = 0;
  for (let yy = y - DOCK_RADIUS; yy <= y + DOCK_RADIUS; yy++) for (let xx = x - DOCK_RADIUS; xx <= x + DOCK_RADIUS; xx++) {
    if (!inBounds(map, xx, yy)) continue;
    sum += tileAcceptance(state, xx, yy)[cargo] || 0;
  }
  return sum >= ACCEPT_THRESHOLD;
}

/**
 * Dock spots for an industry: land tiles within catchment of its footprint that a dock may be built on
 * (dry run), with an open water neighbour. `accepts` = the spot must accept the cargo (destination).
 * Sorted nearest to `toward`, then by position.
 */
function dockSpots(ctx, ind, toward, owner, cargo, accepts, want = SPOTS_PER_END) {
  const { state } = ctx;
  const map = state.map;
  const out = [];
  for (let y = ind.y - DOCK_RADIUS; y <= ind.y + ind.h - 1 + DOCK_RADIUS; y++) {
    for (let x = ind.x - DOCK_RADIUS; x <= ind.x + ind.w - 1 + DOCK_RADIUS; x++) {
      if (!inBounds(map, x, y) || footprintDist(ind, x, y) > DOCK_RADIUS) continue;
      if (getTile(map, x, y).terrain === 'water') continue;
      const water = waterNeighbours(map, x, y);
      if (!water.length) continue;
      if (accepts && !catchAccepts(state, x, y, cargo)) continue;
      out.push({ x, y, water, d: manhattan(x, y, toward.x, toward.y) });
    }
  }
  out.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const res = [];
  for (const s of out) {
    if (res.length >= want) break;
    if (buildDock(ctx, s.x, s.y, { owner, dryRun: true }).ok) res.push(s);
  }
  return res;
}

/**
 * A water route between a source and a destination dock spot: the ship starts on a water tile beside the source
 * dock and ends on one beside the destination dock. Returns {sa, sb, path} for the first spot pair (source spots
 * in order, then destination spots) that is joined by water within the length window, or null.
 */
function waterRoute(state, sas, sbs) {
  for (const sa of sas) {
    for (const sb of sbs) {
      if (!sa.water.length || !sb.water.length) continue;
      const path = findShipPath(state.map, sa.water[0], sb.water, { turnCost: getSetting(state, 'shipTurnCost'), diagonal: getSetting(state, 'shipDiagonal') });
      if (!path || path.length < SHIP_MIN_DIST || path.length > SHIP_MAX_DIST) continue;
      return { sa, sb, path };
    }
  }
  return null;
}

/**
 * Build one ship freight route for the rival: two docks, a depot on water beside the source dock and one ship
 * with a full-load order at the source. Nothing is spent unless every step passes its dry run.
 * @returns {boolean} true when the route was built
 */
export function buildShipRoute(ctx, r) {
  const { state } = ctx;
  const used = new Set([...(r.shipIndustries || [])]);
  const tries = shipCandidates(state, used);
  let tried = 0;
  for (const pair of tries) {
    if (tried >= PAIR_TRIES) break;
    const { src, dst, cargo } = pair;
    const ship = shipModelFor(state, cargo, r.id);
    if (!ship) continue;
    if (r.money < shipRouteBudget(ship)) return false;
    tried++;
    const sas = dockSpots(ctx, src, centre(dst), r.id, cargo, false);
    if (!sas.length) continue;
    const sbs = dockSpots(ctx, dst, centre(src), r.id, cargo, true);
    if (!sbs.length) continue;
    const found = waterRoute(state, sas, sbs);
    if (!found) continue;
    if (buildRouteNow(ctx, r, { src, dst, cargo, ship, sa: found.sa, sb: found.sb })) return true;
  }
  return false;
}

/** A water tile beside the source dock where a depot can go (dry run, with its cost). */
function depotSpot(ctx, sa, owner) {
  const map = ctx.state.map;
  for (const n of sa.water) {
    for (const d of DIRS) {
      const x = n.x + d.dx, y = n.y + d.dy;
      if (!inBounds(map, x, y) || !shipPassable(map, y * map.width + x) || getTile(map, x, y).building) continue;
      const dry = buildShipDepot(ctx, x, y, { owner, dryRun: true });
      if (dry.ok) return { x, y, cost: dry.cost };
    }
  }
  return null;
}

/** Dry runs, then the real build of the two docks, the depot and the first ship. */
function buildRouteNow(ctx, r, p) {
  const { state } = ctx;
  const { src, dst, cargo, ship, sa, sb } = p;
  const owner = r.id;
  const aDry = buildDock(ctx, sa.x, sa.y, { owner, dryRun: true });
  if (!aDry.ok) return false;
  const bDry = buildDock(ctx, sb.x, sb.y, { owner, dryRun: true });
  if (!bDry.ok) return false;
  const spot = depotSpot(ctx, sa, owner); // checked before anything is built
  if (!spot) return false;
  if (r.money < aDry.cost + bDry.cost + spot.cost) return false;
  const attempt = beginRivalAttempt(state, r, [{ x: sa.x, y: sa.y }, { x: sb.x, y: sb.y }, { x: spot.x, y: spot.y }]);
  const da = buildDock(ctx, sa.x, sa.y, { owner });
  const db = da.ok ? buildDock(ctx, sb.x, sb.y, { owner }) : da;
  const dep = db.ok ? buildShipDepot(ctx, spot.x, spot.y, { owner }) : db;
  const depot = dep.ok ? state.depots.find((q) => q.id === dep.depotId) : null;
  const A = depot ? findStation(state, da.stationId) : null;
  const B = depot ? findStation(state, db.stationId) : null;
  if (!depot || !A || !B) { rollbackRivalAttempt(attempt); return false; }
  const route = { a: A.id, b: B.id, depot: depot.id, cargo, ship: true, industries: [src.id, dst.id] };
  r.routes.push(route);
  for (const id of [A.id, B.id]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  r.shipIndustries = [...(r.shipIndustries || []), src.id, dst.id];
  addShip(ctx, r, route, ship);
  pushNews(state, `${r.name} opened a ship route from ${src.name} to ${dst.name}.`, 'info', sa.x, sa.y, 'company');
  return true;
}

/** Buy one ship at the route's depot, order full load at the source then unload at the acceptor, start it. */
function addShip(ctx, r, route, ship) {
  const { state } = ctx;
  const depot = state.depots.find((d) => d.id === route.depot);
  if (!depot) return false;
  const b = buyVehicle(ctx, depot.id, { modelId: ship.id }, { owner: r.id });
  if (!b.ok) return false;
  const v = b.vehicle;
  const o = setOrders(ctx, v.id, [{ stationId: route.a, full: true }, { stationId: route.b }], { owner: r.id });
  if (!o.ok) return false;
  startVehicle(ctx, v.id, { owner: r.id });
  r.vehicles.push(v.id);
  return true;
}

/** Add one ship to a ship route whose source dock has cargo waiting (cash permitting, one per month). */
export function addShips(ctx, r) {
  const { state } = ctx;
  for (const route of shipRoutesOf(r)) {
    const onRoute = state.vehicles.filter((v) => v.ownerId === r.id && v.orders.some((o) => o.stationId === route.a || o.stationId === route.b));
    if (onRoute.length >= MAX_SHIPS) continue;
    const st = findStation(state, route.a);
    if (!st || !st.cargo) continue;
    const waiting = (st.cargo[route.cargo] || []).reduce((n, p) => n + p.amount, 0);
    if (waiting < WAITING_FOR_SHIP) continue;
    if (onRoute.some((v) => v.state === 'lost')) continue;
    const ship = shipModelFor(state, route.cargo, r.id);
    if (!ship || r.money < ship.cost * 2) continue;
    addShip(ctx, r, route, ship);
    return;
  }
}
