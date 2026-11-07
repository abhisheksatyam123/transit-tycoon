/**
 * AI competitor air routes (gap #25 stage 4): a rival with enough cash builds a small airport in each of
 * two of its larger towns (40+ tiles apart), buys planes at the first airport's hangar, orders them between
 * the two airports and starts them. Uses the game's own commands with `owner: rivalId` (buildAirport,
 * buyVehicle, setOrders, startVehicle), so costs and airport-type rules match the player's. Nothing here
 * draws from the game rng (determinism): towns are picked by population, then id.
 */
import { listModels } from './queries.js';
import { buildAirport } from './cmdAirport.js';
import { buyVehicle, setOrders, startVehicle } from './cmdVehicle.js';
import { manhattan, findStation } from './state.js';
import { getTile, inBounds } from './map.js';
import { vehicleFitsAirport, airportType, airportTypeId } from './airportTypes.js';
import { pushNews } from './news.js';

/** Air route distance window (manhattan tiles between the two towns). */
export const AIR_MIN_DIST = 40;
export const AIR_MAX_DIST = 120;
/** Planes bought on a new air route, and the most one route may grow to. */
export const AIR_PLANES = 2;
export const AIR_MAX_PLANES = 4;
/** At most this many air routes per rival. */
export const MAX_AIR_ROUTES = 2;
/**
 * Airport types a rival may choose for a new air route, largest first, with the smallest town population
 * (both towns) that justifies each. Small airports stay the fallback. Availability is the type's introYear.
 */
export const AIR_TYPE_ORDER = [
  { id: 'international', minPop: 1500 },
  { id: 'metropolitan', minPop: 1500 },
  { id: 'city', minPop: 800 },
  { id: 'commuter', minPop: 500 },
  { id: 'small', minPop: 0 },
];
/** Towns considered for air routes (largest first). */
const AIR_TOWN_POOL = 12;
/** Search radius (tiles) around a town centre for a flat, free spot for the airport. */
const SPOT_RADIUS = 8;

/** Biggest plane (not helicopter) that the airport type takes; small airports take planes up to SMALL_MAX_CAPACITY seats. */
export function airPlaneModel(state, typeId = 'small', ownerId = null) {
  const models = listModels(state, 'aircraft', ownerId).filter((m) => !m.helicopter && vehicleFitsAirport(m, typeId));
  models.sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/**
 * Cash a rival needs before it starts an air route: twice one small airport plus one plane (the second
 * airport and the rest of the planes are paid from the route's income).
 * @returns {number} money threshold (Infinity when no plane can be bought)
 */
export function airRouteBudget(state, airportCost, typeId = 'small', ownerId = null) {
  const plane = airPlaneModel(state, typeId, ownerId);
  if (!plane) return Infinity;
  return 2 * (airportCost + plane.cost);
}

/** Air routes a rival already has. */
export function airRoutesOf(r) {
  return r.routes.filter((q) => q.air);
}

/** Flat, free spot for a small airport near a town centre (dry run: rival money and rules apply). */
function airportSpot(ctx, town, owner, typeId = 'small') {
  const map = ctx.state.map;
  for (let R = 0; R <= SPOT_RADIUS; R++) {
    for (let y = town.y - R; y <= town.y + R; y++) for (let x = town.x - R; x <= town.x + R; x++) {
      if (!inBounds(map, x, y) || Math.max(Math.abs(x - town.x), Math.abs(y - town.y)) !== R) continue;
      if (getTile(map, x, y).terrain === 'water') continue;
      if (buildAirport(ctx, x, y, { type: typeId, owner, dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}

/**
 * The two towns for a new air route: the two largest towns not yet on an air route, 40..120 tiles apart,
 * each with a spot for an airport. Returns {a:{town,x,y}, b:{town,x,y}} or null.
 */
export function pickAirTowns(ctx, r, typeId = 'small', minPop = 0) {
  const { state } = ctx;
  const used = new Set();
  for (const q of airRoutesOf(r)) for (const id of q.towns || []) used.add(id);
  const pool = state.towns.filter((t) => !used.has(t.id) && (t.population || 0) >= minPop)
    .sort((a, b) => (b.population || 0) - (a.population || 0) || a.id - b.id)
    .slice(0, AIR_TOWN_POOL);
  const spots = new Map(); // one search per town (the pair loop reuses it)
  const spotOf = (t) => { if (!spots.has(t.id)) spots.set(t.id, airportSpot(ctx, t, r.id, typeId)); return spots.get(t.id); };
  for (let i = 0; i < pool.length; i++) {
    const sa = spotOf(pool[i]);
    if (!sa) continue;
    for (let j = i + 1; j < pool.length; j++) {
      const d = manhattan(pool[i].x, pool[i].y, pool[j].x, pool[j].y);
      if (d < AIR_MIN_DIST || d > AIR_MAX_DIST) continue;
      const sb = spotOf(pool[j]);
      if (!sb) continue;
      return { a: { town: pool[i], ...sa }, b: { town: pool[j], ...sb } };
    }
  }
  return null;
}

/**
 * The airport type, plane and town pair for a new air route: the first type in AIR_TYPE_ORDER that is
 * available in the current year, has a plane it allows, has two towns above its population bar with
 * spots, and that the rival can afford (two airports and a plane). Falls back to small airports.
 * @returns {{typeId:string, plane:object, pick:object}|null}
 */
export function airRouteChoice(ctx, r) {
  const { state } = ctx;
  for (const { id, minPop } of AIR_TYPE_ORDER) {
    const type = airportType(id);
    if (type.introYear && state.date.year < type.introYear) continue;
    const plane = airPlaneModel(state, id, r.id);
    if (!plane || r.money < airRouteBudget(state, type.cost, id, r.id)) continue;
    const pick = pickAirTowns(ctx, r, id, minPop);
    if (pick) return { typeId: id, plane, pick };
  }
  return null;
}

/**
 * Build one air route for the rival: two airports of the chosen type (see airRouteChoice), the first one's
 * hangar as the plane depot, and AIR_PLANES planes ordered between the two airports.
 * @returns {boolean} true when the route was built
 */
export function buildAirRoute(ctx, r) {
  const { state } = ctx;
  const choice = airRouteChoice(ctx, r);
  if (!choice) return false;
  const { typeId, plane, pick } = choice;
  // dry-run the second airport first so a failure never leaves a lone airport behind
  if (!buildAirport(ctx, pick.b.x, pick.b.y, { type: typeId, owner: r.id, dryRun: true }).ok) return false;
  const aa = buildAirport(ctx, pick.a.x, pick.a.y, { type: typeId, owner: r.id });
  if (!aa.ok) return false;
  const ab = buildAirport(ctx, pick.b.x, pick.b.y, { type: typeId, owner: r.id });
  if (!ab.ok) return false;
  const depot = state.depots.find((d) => d.id === aa.depotId);
  if (!depot) return false;
  const route = { a: aa.stationId, b: ab.stationId, depot: depot.id, towns: [pick.a.town.id, pick.b.town.id], air: true };
  if (typeId !== 'small') route.apType = typeId; // lazy: small routes (and older saves) carry no field
  r.routes.push(route);
  for (const id of [aa.stationId, ab.stationId]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  for (let k = 0; k < AIR_PLANES; k++) addAirPlane(ctx, r, route, plane);
  const kind = typeId === 'small' ? '' : `${airportType(typeId).name.toLowerCase()} `;
  pushNews(state, `${r.name} opened a ${kind}air route between ${pick.a.town.name} and ${pick.b.town.name}.`, 'info', pick.a.x, pick.a.y, 'company');
  return true;
}

/** Buy one plane at the route's hangar, order it airport A <-> airport B and start it. */
function addAirPlane(ctx, r, route, plane) {
  const { state } = ctx;
  const depot = state.depots.find((d) => d.id === route.depot);
  if (!depot) return false;
  const b = buyVehicle(ctx, depot.id, { modelId: plane.id }, { owner: r.id });
  if (!b.ok) return false;
  const v = b.vehicle;
  const o = setOrders(ctx, v.id, [{ stationId: route.a }, { stationId: route.b }], { owner: r.id });
  if (!o.ok) return false;
  startVehicle(ctx, v.id, { owner: r.id });
  r.vehicles.push(v.id);
  return true;
}

/** Passengers waiting at a station (all cargo). */
function waitingAtAir(state, id) {
  const st = findStation(state, id);
  if (!st || !st.cargo) return 0;
  let n = 0;
  for (const list of Object.values(st.cargo)) for (const p of list) n += p.amount;
  return n;
}

/** Add one plane to an air route with passengers waiting at either airport (cash permitting, one per month). */
export function addAirPlanes(ctx, r) {
  const { state } = ctx;
  for (const route of airRoutesOf(r)) {
    const onRoute = state.vehicles.filter((v) => v.ownerId === r.id && v.orders.some((o) => o.stationId === route.a || o.stationId === route.b));
    if (onRoute.length >= AIR_MAX_PLANES) continue;
    if (waitingAtAir(state, route.a) + waitingAtAir(state, route.b) < 30) continue;
    if (onRoute.some((v) => v.state === 'lost')) continue;
    const plane = airPlaneModel(state, route.apType || 'small', r.id);
    if (!plane || r.money < plane.cost * 2) continue;
    addAirPlane(ctx, r, route, plane);
    return;
  }
}
