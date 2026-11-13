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
import { DIRS, OPPOSITE, AXIS_BITS, dirBetween } from './constants.js';
import { straightAxis } from './network.js';
import { canAddBits } from './trackRules.js';
import { buildLine } from './cmdTrack.js';
import { buildRoadStop, buildDepot } from './cmdStation.js';
import { buyVehicle, setOrders, startVehicle } from './cmdVehicle.js';
import { listModels } from './queries.js';
import { pathOk } from './shapes.js';
import { pushNews } from './news.js';
import { beginRivalAttempt, rollbackRivalAttempt } from './rivalAttempt.js';

/** Freight route distance window (manhattan tiles, industry centre to centre). */
export const FREIGHT_MIN_DIST = 12;
export const FREIGHT_MAX_DIST = 30;
/** Trucks bought on a new freight route. */
export const FREIGHT_TRUCKS = 2;
/** Producer must have at least this much output per month to be worth a truck route. */
const MIN_PRODUCTION = 40;
/** Ranked candidates one attempt tries before giving up (like aiShip's PAIR_TRIES). */
const PAIR_TRIES = 4;

/** Industry centre tile. */
function centre(ind) {
  return { x: ind.x + Math.floor(ind.w / 2), y: ind.y + Math.floor(ind.h / 2) };
}

/** Bulk-truck model for a cargo (highest capacity, then lowest id). */
export function truckModelFor(state, cargoId, ownerId = null) {
  const models = listModels(state, 'truck', ownerId).filter((m) => m.cargos.includes(cargoId));
  models.sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/**
 * Freight candidates: (producer, cargo, acceptor) with a cargo the producer makes and the acceptor takes,
 * distance in the window, ranked by production then nearest, then lowest ids (deterministic). `used` ids
 * are excluded; `limit` caps the returned list after ranking (Infinity = all).
 * @returns {{src:object,dst:object,cargo:string,dist:number,score:number}[]}
 */
export function pickFreightPairs(state, usedIds = new Set(), limit = Infinity) {
  const out = [];
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
        out.push({ src, dst, cargo, dist: d, score: prod * 100 - d });
      }
    }
  }
  out.sort((p, q) => q.score - p.score || p.src.id - q.src.id || p.dst.id - q.dst.id ||
    (p.cargo < q.cargo ? -1 : p.cargo > q.cargo ? 1 : 0));
  return limit === Infinity ? out : out.slice(0, limit);
}

/**
 * Best freight candidate, or null. Kept for callers/tests that only need the top pair.
 * @returns {{src:object,dst:object,cargo:string}|null}
 */
export function pickFreightPair(state, usedIds = new Set()) {
  return pickFreightPairs(state, usedIds, 1)[0] || null;
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
 * Shortest 4-connected land path between two points, or null. A plain deterministic BFS (N, E, S, W)
 * instead of townRoads.findRoadPath: that A* tracks "straight steps since the last turn" in a single
 * bit that never becomes 1, so it only ever returns straight lines (town generation depends on its
 * exact output, so this stays a local choice). Height steps are limited to 1 like town roads.
 */
function planFreightRoad(state, from, to) {
  const map = state.map;
  const W = map.width, H = map.height;
  const passable = (t) => t.terrain !== 'water' && !t.building && !t.rail &&
    !t.playerTunnel && !t.playerBridge && t.bridgeDeck === undefined;
  const start = from.y * W + from.x, goal = to.y * W + to.x;
  if (!passable(map.tiles[start])) return null;
  const prev = new Int32Array(W * H).fill(-1);
  const seen = new Uint8Array(W * H);
  const queue = [start];
  seen[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (i === goal) {
      const out = [];
      for (let c = goal; c !== -1; c = prev[c]) out.push({ x: c % W, y: Math.floor(c / W) });
      const path = out.reverse();
      return pathOk(path) ? path : null;
    }
    const x = i % W, y = Math.floor(i / W), cur = map.tiles[i];
    for (const { dx, dy } of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j]) continue;
      const t = map.tiles[j];
      if (!passable(t) || Math.abs(t.height - cur.height) > 1) continue;
      seen[j] = 1;
      prev[j] = i;
      queue.push(j);
    }
  }
  return null;
}

/**
 * True when a truck stop at a path end still sees a straight road after the road build. An empty stop
 * tile takes the path's own axis, but a tile that already has road keeps its bits: the path must arrive
 * along that existing straight axis, or the tile becomes a junction and buildRoadStop refuses it.
 * @param {object} tile current map tile at the stop
 * @param {{x:number,y:number}[]} path planned road path, stop tile first or last
 * @param {boolean} atStart true when the stop is path[0], false when it is the last tile
 */
export function stopAxisOk(tile, path, atStart) {
  if (!tile.road) return true;
  const axis = straightAxis(tile.road);
  if (!axis) return false;
  const n = path.length;
  const i = atStart ? 0 : n - 1;
  const j = atStart ? 1 : n - 2;
  if (j < 0 || j >= n) return false;
  const bit = dirBetween(path[i].x, path[i].y, path[j].x, path[j].y);
  return !!(bit & AXIS_BITS[axis]);
}

/**
 * Build one freight route for the rival: stops at the producer and acceptor, a depot beside the source,
 * a road between them, and FREIGHT_TRUCKS trucks. Tries the top PAIR_TRIES ranked candidates, because a
 * pair can be valid on paper yet unbuildable (no 4-connected land road, or a stop spot whose road axis
 * would break); the unbuildable ones stay unused so they are retried next month.
 * @returns {boolean}
 */
export function buildFreightRoute(ctx, r) {
  const { state } = ctx;
  const used = new Set(r.freightIndustries || []);
  let tried = 0;
  for (const pair of pickFreightPairs(state, used)) {
    if (tried >= PAIR_TRIES) break;
    tried++;
    if (tryFreightRoute(ctx, r, pair)) return true;
  }
  return false;
}

/**
 * Plan and build one freight route for a chosen candidate. Nothing is spent unless every step passes its
 * dry run; returns false (leaving no state behind) when this candidate cannot be built.
 * @returns {boolean}
 */
function tryFreightRoute(ctx, r, pair) {
  const { state } = ctx;
  const { src, dst, cargo } = pair;
  const model = truckModelFor(state, cargo, r.id);
  if (!model) return false;
  const owner = r.id;
  const a = stopSpot(state, src, centre(dst));
  if (!a) return false;
  const b = stopSpot(state, dst, centre(src));
  if (!b) return false;
  const path = planFreightRoad(state, a, b);
  if (!path) return false;
  // the road is committed before the stops, so a stop tile that already carries road must still be
  // straight along the path's arrival axis afterwards (otherwise it turns into a junction and fails)
  if (!stopAxisOk(getTile(state.map, a.x, a.y), path, true)) return false;
  if (!stopAxisOk(getTile(state.map, b.x, b.y), path, false)) return false;
  // dry runs first: road, both stops and the depot must be possible and affordable before anything is built
  const roadDry = buildLine(ctx, 'road', 0, 0, 0, 0, { path, owner, dryRun: true });
  if (!roadDry.ok) return false;
  const aDry = buildRoadStop(ctx, a.x, a.y, 'truck', { owner, dryRun: true });
  if (!aDry.ok) return false;
  const bDry = buildRoadStop(ctx, b.x, b.y, 'truck', { owner, dryRun: true });
  if (!bDry.ok) return false;
  const dSpot = truckDepotSpot(ctx, a, owner, path, [a, b]);
  if (!dSpot) return false;
  // the trucks are part of the opening cost: do not create a route we cannot equip
  if (r.money < roadDry.cost + aDry.cost + bDry.cost + dSpot.cost + model.cost * FREIGHT_TRUCKS) return false;
  const attempt = beginRivalAttempt(state, r, [...path, a, b, { x: dSpot.x, y: dSpot.y },
    ...DIRS.map((d) => ({ x: dSpot.x + d.dx, y: dSpot.y + d.dy })),
    ...DIRS.map((d) => ({ x: a.x + d.dx, y: a.y + d.dy })),
    ...DIRS.map((d) => ({ x: b.x + d.dx, y: b.y + d.dy }))]);
  const road = buildLine(ctx, 'road', 0, 0, 0, 0, { path, owner });
  const sa = road.ok ? buildRoadStop(ctx, a.x, a.y, 'truck', { owner }) : road;
  const sb = sa.ok ? buildRoadStop(ctx, b.x, b.y, 'truck', { owner }) : sa;
  const stA = sb.ok ? findStation(state, sa.stationId) : null;
  const stB = sb.ok ? findStation(state, sb.stationId) : null;
  const depot = stA && stB ? placeTruckDepot(ctx, dSpot, owner) : null;
  if (!stA || !stB || !depot) { rollbackRivalAttempt(attempt); return false; }
  for (const id of [stA.id, stB.id]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  const route = { a: stA.id, b: stB.id, depot: depot.id, cargo, freight: true, industries: [src.id, dst.id] };
  r.routes.push(route);
  r.freightIndustries = [...(r.freightIndustries || []), src.id, dst.id];
  for (let k = 0; k < FREIGHT_TRUCKS; k++) addFreightTruck(ctx, r, route, model);
  pushNews(state, `${r.name} opened a ${cargo} truck route from ${src.name} to ${dst.name}.`, 'info', a.x, a.y, 'company');
  return true;
}

/**
 * Depot spot on empty land beside `near` whose exit joins a path tile (or an existing road), dry-run
 * with its cost. Path tiles have no road yet when this is preflighted, so they are accepted as exits and
 * the committed road build supplies the bit; the spot itself must stay off the path (the road build would
 * occupy it) and off the planned stops (their drive-through side rule only rejects at commit time, once
 * the station record exists).
 *
 * `stops` are the truck stops this route is about to build: neither a stop tile nor a tile whose exit
 * faces one can take the depot, because the dry run cannot see the stop yet (buildDepot's drive-through
 * side rule only rejects at commit time, once the station record exists).
 */
function truckDepotSpot(ctx, near, owner, path, stops = []) {
  const { state } = ctx;
  const map = state.map;
  const onPath = new Set(path.map((p) => p.y * map.width + p.x));
  const stopTiles = new Set(stops.map((p) => p.y * map.width + p.x));
  for (let R = 1; R <= 4; R++) for (let y = near.y - R; y <= near.y + R; y++) for (let x = near.x - R; x <= near.x + R; x++) {
    if (!inBounds(map, x, y) || Math.max(Math.abs(x - near.x), Math.abs(y - near.y)) !== R) continue;
    if (stopTiles.has(y * map.width + x) || onPath.has(y * map.width + x)) continue;
    const t = getTile(map, x, y);
    if (t.road || t.rail || t.building || t.terrain === 'water') continue;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (!inBounds(map, nx, ny)) continue;
      const nt = getTile(map, nx, ny);
      if (stopTiles.has(ny * map.width + nx)) continue;
      const onRoadPath = onPath.has(ny * map.width + nx);
      if (!nt.road && !onRoadPath) continue;
      if (nt.road && !(nt.road & OPPOSITE[d.bit]) && canAddBits(nt, 'road', OPPOSITE[d.bit])) continue;
      if (!nt.road && canAddBits(nt, 'road', OPPOSITE[d.bit])) continue;
      const dry = buildDepot(ctx, x, y, 'road', d.bit, { owner, dryRun: true });
      if (dry.ok) return { x, y, dir: d.bit, cost: dry.cost };
    }
  }
  return null;
}

/** Commit a preflighted truck depot spot. @returns {object|null} the depot record. */
function placeTruckDepot(ctx, spot, owner) {
  const { state } = ctx;
  const res = buildDepot(ctx, spot.x, spot.y, 'road', spot.dir, { owner });
  if (!res.ok) return null;
  return state.depots.find((q) => q.id === res.depotId) || null;
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
    const model = truckModelFor(state, route.cargo, r.id);
    if (model) addFreightTruck(ctx, r, route, model);
    return;
  }
}
