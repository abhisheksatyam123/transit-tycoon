/**
 * AI competitor rail freight (gap #25 stage 5, OpenTTD-style): a rival with enough cash builds one rail
 * freight route: a primary producer (e.g. a coal mine) and an accepting industry 20..60 tiles away, a
 * rail station (length 3) at each, track laid by an A* over free land, a depot beside the track, and
 * trains with full-load orders at the source. Uses only the game's own commands with `owner: rivalId`
 * (buildRailStation, buildLine, buildDepot, buyVehicle, setOrders, startVehicle), so costs and rules match
 * the player's. Nothing here draws from the game rng (determinism): ties go to the lowest ids.
 */
import { findStation, manhattan } from './state.js';
import { getTile, inBounds } from './map.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { COSTS } from '../config/costs.js';
import { producedCargos, requiredCargos } from './loco/industry.js';
import { DIRS, OPPOSITE } from './constants.js';
import { straightAxis } from './network.js';
import { objectBlocks } from './trackRules.js';
import { buildLine } from './cmdTrack.js';
import { buildSignalRun } from './signalRun.js';
import { buildRailStation, buildDepot } from './cmdStation.js';
import { buyVehicle, setOrders, startVehicle } from './cmdVehicle.js';
import { listModels } from './queries.js';
import { pathOk } from './shapes.js';
import { pushNews } from './news.js';

/** Rival signalling: block signals on the line every this many track tiles (OTTD signal density autofill). */
export const RIVAL_SIGNAL_SPACING = 4;
/** Rail route distance window (manhattan tiles, industry centre to centre). */
export const RAIL_MIN_DIST = 20;
export const RAIL_MAX_DIST = 60;
/** Producer must make at least this much per month. */
const MIN_PRODUCTION = 40;
/** Rail routes per rival, and trains per route. */
export const MAX_RAIL_ROUTES = 2;
export const MAX_RAIL_TRAINS = 2;
/** Cargo waiting at the source before one more train is bought. */
export const WAITING_FOR_TRAIN = 60;
/** Wagons on a new train. */
const RAIL_WAGONS = 3;
/** Station length (tiles) on each end. */
const STATION_LEN = 3;
/** A* node budget (keeps a failed search cheap). */
const MAX_NODES = 60000;
const TURN_COST = 1.5;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

/** Industry centre tile. */
function centre(ind) {
  return { x: ind.x + Math.floor(ind.w / 2), y: ind.y + Math.floor(ind.h / 2) };
}

/** Fastest non-electric train engine (lowest cost, then id, on a speed tie). */
export function railEngineModel(state, ownerId = null) {
  const models = listModels(state, 'train', ownerId).filter((m) => m.kind === 'engine' && m.traction !== 'electric' && !m.railType);
  models.sort((a, b) => b.speed - a.speed || a.cost - b.cost || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/** Highest-capacity wagon for a cargo (then lowest id). */
export function railWagonFor(state, cargoId, ownerId = null) {
  const models = listModels(state, 'wagon', ownerId).filter((m) => m.cargos.includes(cargoId) && !m.railType);
  models.sort((a, b) => b.capacity - a.capacity || (a.id < b.id ? -1 : 1));
  return models[0] || null;
}

/** Rail routes a rival already has. */
export function railRoutesOf(r) {
  return r.routes.filter((q) => q.rail);
}

/** Cash a rival needs before a rail route: twice the estimated route cost (track, 2 stations, depot, train). */
export function railRouteBudget(dist, engine, wagon) {
  const est = dist * 1.4 * COSTS.rail + 2 * STATION_LEN * COSTS.railStation + COSTS.depotRail
    + Math.ceil(dist / RIVAL_SIGNAL_SPACING) * (COSTS.signal || 0)
    + engine.cost + RAIL_WAGONS * wagon.cost;
  return 2 * est;
}

/**
 * Best (producer, cargo, acceptor) triple: highest production, then nearest, then lowest ids.
 * Industries in `usedIds` are skipped.
 * @returns {{src:object,dst:object,cargo:string,dist:number}|null}
 */
export function pickRailPair(state, usedIds = new Set()) {
  let best = null, bestScore = -Infinity;
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
        if (d < RAIL_MIN_DIST || d > RAIL_MAX_DIST) continue;
        const score = prod * 100 - d;
        if (score > bestScore) { bestScore = score; best = { src, dst, cargo, dist: d }; }
      }
    }
  }
  return best;
}

/** Tile a rail line may pass: open land (no water, buildings, track, road, objects, bridges or tunnels). */
function laneOk(t) {
  return t.terrain !== 'water' && !t.building && !t.rail && !t.road && !objectBlocks(t) && !t.overBridge
    && !t.playerTunnel && !t.playerBridge && t.bridgeDeck === undefined;
}

/** Tile a line may cross: a straight road running across the line's direction (a level crossing). */
function crossOk(t, nd) {
  if (!t.road || t.building || t.rail || t.tram || objectBlocks(t) || t.overBridge || t.playerTunnel || t.playerBridge || t.bridgeDeck !== undefined) return false;
  if (t.terrain === 'water') return false;
  const across = nd % 2 === 0 ? 'x' : 'y'; // east/west step crosses a north-south road
  return straightAxis(t.road) === across;
}

/**
 * A* over open land from `start` to `goal` (inclusive). State = tile and heading (a turn costs extra).
 * Height steps of at most one level. `blocked` holds tile indices the line may not use.
 * @returns {{x:number,y:number}[]|null}
 */
export function laneRoute(map, start, goal, blocked = new Set()) {
  const { width: W, height: H, tiles } = map;
  const sIdx = start.y * W + start.x, gIdx = goal.y * W + goal.x;
  if (sIdx === gIdx) return [{ x: start.x, y: start.y }];
  const SN = W * H * 5;
  const g = new Float64Array(SN).fill(Infinity);
  const parent = new Int32Array(SN).fill(-1);
  const closed = new Uint8Array(SN);
  const heap = new MinHeap();
  const h = (i) => Math.abs((i % W) - goal.x) + Math.abs(Math.floor(i / W) - goal.y);
  const st0 = sIdx * 5 + 4; // heading 4 = none yet
  g[st0] = 0;
  heap.push(st0, h(sIdx));
  let goalState = -1, nodes = 0;
  while (heap.size && nodes < MAX_NODES) {
    const st = heap.pop();
    if (closed[st]) continue;
    closed[st] = 1;
    nodes++;
    const i = Math.floor(st / 5), hd = st - i * 5;
    if (i === gIdx) { goalState = st; break; }
    const x = i % W, y = Math.floor(i / W);
    const cur = tiles[i];
    for (let nd = 0; nd < 4; nd++) {
      if (hd < 4 && nd === (hd + 2) % 4) continue; // no reversing
      const nx = x + DX[nd], ny = y + DY[nd];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (blocked.has(j)) continue;
      const t = tiles[j];
      // a road may be crossed straight through only: no turning on a crossing, no turning off one
      if (cur.road && hd < 4 && nd !== hd) continue;
      if (!(laneOk(t) || (crossOk(t, nd) && (hd === 4 || nd === hd)))) continue;
      if (Math.abs(t.height - cur.height) > 1) continue;
      const ns = j * 5 + nd;
      if (closed[ns]) continue;
      const ng = g[st] + 1 + Math.abs(t.height - cur.height) * 0.5 + (hd < 4 && nd !== hd ? TURN_COST : 0)
        + (t.terrain === 'forest' ? 1 : 0) + (t.terrain === 'rock' ? 2 : 0);
      if (ng < g[ns]) { g[ns] = ng; parent[ns] = st; heap.push(ns, ng + h(j)); }
    }
  }
  if (goalState < 0) return null;
  const out = [];
  for (let c = goalState; c !== -1; c = parent[c]) {
    const ti = Math.floor(c / 5);
    out.push({ x: ti % W, y: Math.floor(ti / W) });
  }
  return out.reverse();
}

/** Minimal binary min-heap of state indices keyed by a score (deterministic). */
class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    let i = a.length;
    a.push(item); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p]; k[i] = k[p];
      i = p;
    }
    a[i] = item; k[i] = key;
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastItem = a.pop(), lastKey = k.pop();
    const n = a.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, rr = l + 1;
        let m = i, mk = lastKey;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (rr < n && k[rr] < mk) { m = rr; mk = k[rr]; }
        if (m === i) break;
        a[i] = a[m]; k[i] = k[m];
        i = m;
      }
      a[i] = lastItem; k[i] = lastKey;
    }
    return top;
  }
}

/**
 * Station spot beside an industry: a free straight run of STATION_LEN tiles just outside its footprint,
 * along the axis facing `toward`. The end nearer `toward` is the one the track leaves from.
 * @returns {{x0:number,y0:number,axis:'x'|'y',tiles:{x,y}[],end:{x,y},out:{dx,dy}}|null}
 */
export function stationSpot(state, ind, toward) {
  const map = state.map;
  const c = centre(ind);
  const axis = Math.abs(toward.x - c.x) >= Math.abs(toward.y - c.y) ? 'x' : 'y';
  let best = null, bestD = Infinity;
  const consider = (tiles) => {
    for (const p of tiles) {
      if (!inBounds(map, p.x, p.y) || !laneOk(getTile(map, p.x, p.y))) return;
    }
    const ends = [
      { end: tiles[0], out: axis === 'x' ? { dx: -1, dy: 0 } : { dx: 0, dy: -1 } },
      { end: tiles[tiles.length - 1], out: axis === 'x' ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 } },
    ];
    for (const e of ends) {
      // the two tiles straight out of the station must be open land too (the track runs through them)
      const p0 = { x: e.end.x + e.out.dx, y: e.end.y + e.out.dy };
      const p1 = { x: p0.x + e.out.dx, y: p0.y + e.out.dy };
      if (!inBounds(map, p1.x, p1.y) || !laneOk(getTile(map, p0.x, p0.y)) || !laneOk(getTile(map, p1.x, p1.y))) continue;
      const d = manhattan(p0.x, p0.y, toward.x, toward.y);
      if (d < bestD) { bestD = d; best = { x0: tiles[0].x, y0: tiles[0].y, axis, tiles, end: e.end, out: e.out }; }
    }
  };
  if (axis === 'x') {
    for (const y of [ind.y - 1, ind.y + ind.h]) for (let x0 = ind.x - STATION_LEN + 1; x0 <= ind.x + ind.w - 1; x0++) {
      consider(Array.from({ length: STATION_LEN }, (_, i) => ({ x: x0 + i, y })));
    }
  } else {
    for (const x of [ind.x - 1, ind.x + ind.w]) for (let y0 = ind.y - STATION_LEN + 1; y0 <= ind.y + ind.h - 1; y0++) {
      consider(Array.from({ length: STATION_LEN }, (_, i) => ({ x, y: y0 + i })));
    }
  }
  return best;
}

/**
 * Plan the track between two station spots: path = [exitA, A* from the tile beyond exitA to the tile beyond
 * exitB, exitB]. The first and last steps run straight out of / into the stations, so the line connects.
 * @returns {{x,y}[]|null}
 */
export function planTrack(state, sa, sb) {
  const map = state.map;
  const oa = sa.out, ob = sb.out;
  const P0 = { x: sa.end.x + oa.dx, y: sa.end.y + oa.dy };
  const P1 = { x: P0.x + oa.dx, y: P0.y + oa.dy };
  const Q = { x: sb.end.x + ob.dx, y: sb.end.y + ob.dy };
  const G = { x: Q.x + ob.dx, y: Q.y + ob.dy };
  if (!inBounds(map, G.x, G.y) || !inBounds(map, P1.x, P1.y)) return null;
  const blocked = new Set();
  for (const s of [sa, sb]) for (const p of s.tiles) blocked.add(p.y * map.width + p.x);
  blocked.add(P0.y * map.width + P0.x);
  blocked.add(Q.y * map.width + Q.x);
  if (!laneOk(getTile(map, P1.x, P1.y)) || !laneOk(getTile(map, G.x, G.y))) return null;
  const mid = laneRoute(map, P1, G, blocked);
  if (!mid) return null;
  // the station end tiles lead the path so the track joins the station (buildLine links only path neighbours)
  const path = [sa.end, P0, ...mid, Q, sb.end];
  // a detour (roads, slopes, forest) can make the line far longer than the straight distance: refuse those
  if (path.length > 2 * manhattan(sa.end.x, sa.end.y, sb.end.x, sb.end.y) + 14) return null;
  return pathOk(path) ? path : null;
}

/**
 * Depot on open land directly beside a line tile, its exit facing that tile. The line tile must take the
 * matching bit (buildDepot adds it); a candidate is dry-run first and skipped when it would not connect.
 * @returns {object|null} the depot record
 */
function placeRailDepot(ctx, path, owner) {
  const { state } = ctx;
  const map = state.map;
  const onPath = new Set(path.map((p) => p.y * map.width + p.x));
  for (let k = 1; k < path.length - 1; k++) {
    const p = path[k];
    for (const d of DIRS) {
      const x = p.x + d.dx, y = p.y + d.dy;
      if (!inBounds(map, x, y) || onPath.has(y * map.width + x) || !laneOk(getTile(map, x, y))) continue;
      const dir = OPPOSITE[d.bit]; // depot exit points at the line tile
      if (!buildDepot(ctx, x, y, 'rail', dir, { owner, dryRun: true }).ok) continue;
      const res = buildDepot(ctx, x, y, 'rail', dir, { owner });
      if (!res.ok) continue;
      const depot = state.depots.find((q) => q.id === res.depotId) || null;
      if (depot && getTile(map, p.x, p.y).rail & d.bit) return depot;
      return depot; // connected or not, the depot is placed; the caller checks the link
    }
  }
  return null;
}

/**
 * Build one rail freight route for the rival (stations, track, depot, one train). Nothing is spent unless
 * every step passes its dry run.
 * @returns {boolean} true when the route was built
 */
export function buildRailRoute(ctx, r) {
  const { state } = ctx;
  const used = new Set([...(r.freightIndustries || []), ...(r.railIndustries || [])]);
  const pair = pickRailPair(state, used);
  if (!pair) return false;
  const { src, dst, cargo, dist } = pair;
  const engine = railEngineModel(state, r.id);
  const wagon = railWagonFor(state, cargo, r.id);
  if (!engine || !wagon) return false;
  if (r.money < railRouteBudget(dist, engine, wagon)) return false;
  const owner = r.id;
  const sa = stationSpot(state, src, centre(dst));
  const sb = sa && stationSpot(state, dst, centre(src));
  if (!sa || !sb) return false;
  const path = planTrack(state, sa, sb);
  if (!path) return false;
  // dry runs first: nothing is built unless the whole route is valid
  if (!buildLine(ctx, 'rail', 0, 0, 0, 0, { path, owner, dryRun: true }).ok) return false;
  if (!buildRailStation(ctx, sa.x0, sa.y0, sa.axis, STATION_LEN, { owner, dryRun: true }).ok) return false;
  if (!buildRailStation(ctx, sb.x0, sb.y0, sb.axis, STATION_LEN, { owner, dryRun: true }).ok) return false;
  const stA = buildRailStation(ctx, sa.x0, sa.y0, sa.axis, STATION_LEN, { owner });
  const stB = buildRailStation(ctx, sb.x0, sb.y0, sb.axis, STATION_LEN, { owner });
  if (!stA.ok || !stB.ok) return false;
  const line = buildLine(ctx, 'rail', 0, 0, 0, 0, { path, owner });
  if (!line.ok) return false;
  // Rival signalling (OpenTTD AI autofill): block signals along the line; best-effort (run stops at stations).
  buildSignalRun(ctx, path.slice(1, -1), { spacing: RIVAL_SIGNAL_SPACING, owner });
  const depot = placeRailDepot(ctx, path, owner);
  if (!depot) return false;
  const A = findStation(state, stA.stationId), B = findStation(state, stB.stationId);
  if (!A || !B) return false;
  for (const id of [A.id, B.id]) if (!r.stations.includes(id)) r.stations.push(id);
  r.depots.push(depot.id);
  const route = { a: A.id, b: B.id, depot: depot.id, cargo, rail: true, industries: [src.id, dst.id] };
  r.routes.push(route);
  r.railIndustries = [...(r.railIndustries || []), src.id, dst.id];
  addRailTrain(ctx, r, route, engine, wagon);
  pushNews(state, `${r.name} opened a rail freight route from ${src.name} to ${dst.name}.`, 'info', sa.x0, sa.y0, 'company');
  return true;
}

/** Buy one train at the route depot, order full load at the source then unload at the acceptor, start it. */
function addRailTrain(ctx, r, route, engine, wagon) {
  const { state } = ctx;
  const depot = state.depots.find((d) => d.id === route.depot);
  if (!depot) return false;
  const b = buyVehicle(ctx, depot.id, { modelId: engine.id, wagonModelId: wagon.id, wagons: RAIL_WAGONS, cargoId: route.cargo }, { owner: r.id });
  if (!b.ok) return false;
  const v = b.vehicle;
  const o = setOrders(ctx, v.id, [{ stationId: route.a, full: true }, { stationId: route.b }], { owner: r.id });
  if (!o.ok) return false;
  startVehicle(ctx, v.id, { owner: r.id });
  r.vehicles.push(v.id);
  return true;
}

/** Add one train to a rail route whose source station has cargo waiting (cash permitting, one per month). */
export function addRailTrains(ctx, r) {
  const { state } = ctx;
  for (const route of railRoutesOf(r)) {
    const onRoute = state.vehicles.filter((v) => v.ownerId === r.id && v.orders.some((o) => o.stationId === route.a || o.stationId === route.b));
    if (onRoute.length >= MAX_RAIL_TRAINS) continue;
    const st = findStation(state, route.a);
    if (!st || !st.cargo) continue;
    const waiting = (st.cargo[route.cargo] || []).reduce((n, p) => n + p.amount, 0);
    if (waiting < WAITING_FOR_TRAIN) continue;
    if (onRoute.some((v) => v.state === 'lost')) continue;
    const engine = railEngineModel(state, r.id), wagon = railWagonFor(state, route.cargo, r.id);
    if (engine && wagon) addRailTrain(ctx, r, route, engine, wagon);
    return;
  }
}
