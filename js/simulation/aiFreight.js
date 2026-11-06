/**
 * AI competitor freight (gap #25 stage 3): a rival builds a truck route from a producing industry to an
 * accepting industry. Uses only the game's own commands with `owner: rivalId` (buildLine for the road,
 * buildRoadStop, buildDepot, buyVehicle, setOrders, startVehicle), so costs and rules match the player's.
 * Nothing here draws from the game rng (determinism).
 */
import { findStation, manhattan } from './state.js';
import { getTile, inBounds } from './map.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { producedCargos, requiredCargos } from './loco/industry.js';
import { DIRS, OPPOSITE } from './constants.js';
import { canAddBits } from './trackRules.js';
import { buildLine } from './cmdTrack.js';
import { buildRoadStop, buildDepot } from './cmdStation.js';
import { buyVehicle, setOrders, startVehicle } from './cmdVehicle.js';
import { listModels } from './queries.js';
import { findRoadPath } from './townRoads.js';
import { pathOk } from './shapes.js';
import { pushNews } from './news.js';

/** Freight route distance window (manhattan tiles, industry centre to centre). */
export const FREIGHT_MIN_DIST = 12;
export const FREIGHT_MAX_DIST = 30;
/** Trucks bought on a new freight route. */
export const FREIGHT_TRUCKS = 2;
/** Producer must have at least this much output per month to be worth a truck route. */
const MIN_PRODUCTION = 40;

/** Industry centre tile. */
function centre(ind) {
  return { x: ind.x + Math.floor(ind.w / 2), y: ind.y + Math.floor(ind.h / 2) };
}

/** Bulk-truck model for a cargo (highest capacity, then lowest id). */
export function truckModelFor(state, cargoId) {
  const models = listModels(state, 'truck').filter((m) => m.cargos.includes(cargoId));
  models.sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/**
 * Freight candidates: (producer, cargo, acceptor) with a cargo the producer makes and the acceptor takes,
 * distance in the window, both on the same tile-connected land (no water between). Highest production first,
 * then nearest, then lowest ids (deterministic).
 * @returns {{src:object,dst:object,cargo:string}|null}
 */
export function pickFreightPair(state, usedIds = new Set()) {
  let best = null, bestScore = -1;
  for (const src of state.industries) {
    if (usedIds.has(src.id)) continue;
    const type = INDUSTRY_BY_ID[src.typeId];
    if (!type) continue;
    for (const cargo of producedCargos(type)) {
      const prod = (src.production && src.production[cargo]) || 0;
      if (prod < MIN_PRODUCTION) continue;
      for (const dst of state.industries) {
        if (dst.id === src.id || usedIds.has(dst.id)) continue;
        const dt = INDUSTRY_BY_ID[dst.typeId];
        if (!dt || !requiredCargos(dt).includes(cargo)) continue;
        const a = centre(src), b = centre(dst);
        const d = manhattan(a.x, a.y, b.x, b.y);
        if (d < FREIGHT_MIN_DIST || d > FREIGHT_MAX_DIST) continue;
        const score = prod * 100 - d;
        if (score > bestScore) { bestScore = score; best = { src, dst, cargo }; }
      }
    }
  }
  return best;
}

/** Free tile on land next to the source industry, as a truck stop spot (straight road or empty land). */
function stopSpot(state, ind, toward) {
  const map = state.map;
  let best = null, bestD = Infinity;
  for (let y = ind.y - 1; y <= ind.y + ind.h; y++) for (let x = ind.x - 1; x <= ind.x + ind.w; x++) {
    if (!inBounds(map, x, y)) continue;
    const inside = x >= ind.x && x < ind.x + ind.w && y >= ind.y && y < ind.y + ind.h;
    if (inside) continue;
    const t = getTile(map, x, y);
    if (t.building || t.rail || t.terrain === 'water') continue;
    const d = manhattan(x, y, toward.x, toward.y);
    if (d < bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

/**
 * Lay a road between two points: A* over land (townRoads.findRoadPath), then buildLine along the path,
 * paid by the rival. Returns the path or null.
 */
function layFreightRoad(ctx, owner, from, to) {
  const { state } = ctx;
  const map = state.map;
  const goal = new Set([to.y * map.width + to.x]);
  const allowed = (x, y) => {
    const t = getTile(map, x, y);
    return t.terrain !== 'water' && !t.building && !t.rail;
  };
  const path = findRoadPath(map, [from], goal, to, allowed, 2);
  if (!path || !pathOk(path)) return null;
  const r = buildLine(ctx, 'road', 0, 0, 0, 0, { path, owner });
  if (!r.ok) return null;
  return path;
}

/**
 * Build one freight route for the rival: stops at the producer and acceptor, a depot beside the source,
 * a road between them, and FREIGHT_TRUCKS trucks.
 * @returns {boolean}
 */
export function buildFreightRoute(ctx, r) {
  const { state } = ctx;
  const used = new Set(r.freightIndustries || []);
  const pair = pickFreightPair(state, used);
  if (!pair) return false;
  const { src, dst, cargo } = pair;
  const model = truckModelFor(state, cargo);
  if (!model) return false;
  const owner = r.id;
  const a = stopSpot(state, src, centre(dst));
  if (!a) return false;
  const b = stopSpot(state, dst, centre(src));
  if (!b) return false;
  // Road before stops: it claims the shortest route; a failed road must not leave a stop behind.
  const path = layFreightRoad(ctx, owner, a, b);
  if (!path) return false;
  const sa = buildRoadStop(ctx, a.x, a.y, 'truck', { owner });
  const sb = buildRoadStop(ctx, b.x, b.y, 'truck', { owner });
  if (!sa.ok || !sb.ok) return false;
  const stA = findStation(state, sa.stationId), stB = findStation(state, sb.stationId);
  if (!stA || !stB) return false;
  const depot = placeTruckDepot(ctx, a, owner, path);
  if (!depot) return false;
  for (const id of [stA.id, stB.id]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  const route = { a: stA.id, b: stB.id, depot: depot.id, cargo, freight: true, industries: [src.id, dst.id] };
  r.routes.push(route);
  r.freightIndustries = [...(r.freightIndustries || []), src.id, dst.id];
  for (let k = 0; k < FREIGHT_TRUCKS; k++) addFreightTruck(ctx, r, route, model);
  pushNews(state, `${r.name} opened a ${cargo} truck route from ${src.name} to ${dst.name}.`, 'info', a.x, a.y, 'company');
  return true;
}

/** Road depot beside the first path tile (the stop end), with its exit on the path. */
function placeTruckDepot(ctx, near, owner, path) {
  const { state } = ctx;
  const map = state.map;
  for (let R = 1; R <= 4; R++) for (let y = near.y - R; y <= near.y + R; y++) for (let x = near.x - R; x <= near.x + R; x++) {
    if (!inBounds(map, x, y) || Math.max(Math.abs(x - near.x), Math.abs(y - near.y)) !== R) continue;
    const t = getTile(map, x, y);
    if (t.road || t.rail || t.building || t.terrain === 'water') continue;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const nt = getTile(map, nx, ny);
      if (!nt.road) continue;
      if (!(nt.road & OPPOSITE[d.bit]) && canAddBits(nt, 'road', OPPOSITE[d.bit])) continue;
      const res = buildDepot(ctx, x, y, 'road', d.bit, { owner });
      if (res.ok) return state.depots.find((q) => q.id === res.depotId) || null;
    }
  }
  return null;
}

/** Buy one truck at the route depot, order it stop A <-> stop B and start it. */
function addFreightTruck(ctx, r, route, model) {
  const { state } = ctx;
  const depot = state.depots.find((d) => d.id === route.depot);
  if (!depot) return false;
  const b = buyVehicle(ctx, depot.id, { modelId: model.id, cargoId: route.cargo }, { owner: r.id });
  if (!b.ok) return false;
  const v = b.vehicle;
  const o = setOrders(ctx, v.id, [{ stationId: route.a }, { stationId: route.b }], { owner: r.id });
  if (!o.ok) return false;
  startVehicle(ctx, v.id, { owner: r.id });
  r.vehicles.push(v.id);
  return true;
}

/** Add a truck to a freight route whose producer stop has cargo waiting (cash permitting). */
export function addFreightTrucks(ctx, r) {
  const { state } = ctx;
  for (const route of r.routes) {
    if (!route.freight) continue;
    const onRoute = state.vehicles.filter((v) => v.ownerId === r.id && v.orders.some((o) => o.stationId === route.a || o.stationId === route.b));
    if (onRoute.length >= 6) continue;
    const st = findStation(state, route.a);
    if (!st || !st.cargo) continue;
    const waiting = (st.cargo[route.cargo] || []).reduce((n, p) => n + p.amount, 0);
    if (waiting < 40) continue;
    if (onRoute.some((v) => v.state === 'lost')) continue;
    const model = truckModelFor(state, route.cargo);
    if (model) addFreightTruck(ctx, r, route, model);
    return;
  }
}
