/**
 * Vehicle routing: goal tiles for orders/depots, path planning incl. train reversal.
 */
import { findPath } from './pathfinder.js';
import { findStation, manhattan } from './state.js';
import { DIRS, OPPOSITE, dirBetween } from './constants.js';
import { airLine, isRunwayCentre } from './aircraft.js';
import { airportTypeId, isHelicopter, vehicleFitsAirport } from './airportTypes.js';
import { HELI_PAD_TYPES, ftaTileOccupied } from './airportGround.js';
import { findShipPath, shipGoals } from './shipPath.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { getSetting } from './settings.js';
import { trainLengthTiles } from './platformLength.js';

/** Layer used by a vehicle kind. */
export function layerOf(v) {
  return v.kind === 'train' ? 'rail' : v.kind === 'aircraft' ? 'air' : v.roadType === 'tram' ? 'tram' : 'road';
}

/**
 * Station tile kind a vehicle uses: 'rail' for trains, 'bus' for PASS/MAIL road vehicles, else 'truck'.
 */
export function stopKindFor(v) {
  if (v.kind === 'train') return 'rail';
  if (v.kind === 'aircraft') return 'airport';
  if (v.kind === 'ship') return 'ship';
  if (v.roadType === 'tram') return 'tram'; // trams: tram stops, and bus stops too (see stopKindOk)
  return v.cargoId === 'PASS' || v.cargoId === 'MAIL' ? 'bus' : 'truck';
}

/** True when a station tile of kind `k` is a stop for vehicle `v`. Trams also stop at bus stops on tram track. */
export function stopKindOk(v, k) {
  return k === stopKindFor(v) || (v.roadType === 'tram' && k === 'bus');
}

/**
 * Goal tiles for a vehicle's current order (station tiles of the right kind).
 * @returns {{x:number,y:number}[]}
 */
export function orderGoals(state, v) {
  const order = v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
  if (!order) return [];
  const st = findStation(state, order.stationId);
  if (!st) return [];
  const kind = stopKindFor(v);
  if (kind === 'airport') return airGoals(state, st, v);
  if (kind === 'ship') return shipGoals(state.map, st);
  // waypoints (cmdWaypoint.js) are goal tiles too (go via: the path ends there): rail for trains, road for road vehicles
  // Single pass into one array: same predicate, same tile order as the old filter().map().
  const out = [];
  for (const t of st.tiles) {
    if (stopKindOk(v, t.kind) || (t.kind === 'waypoint' && (kind === 'rail' ? !t.road : !!t.road && v.roadType !== 'tram'))) out.push({ x: t.x, y: t.y });
  }
  return out;
}

/**
 * Aircraft goals: the runway centre tiles (or helipads) of an airport station that this vehicle may use.
 * Planes never take a heliport; small airports only take small planes; helicopters use any.
 */
function airGoals(state, st, v) {
  const { map } = state;
  const model = v && MODEL_BY_ID[v.modelId];
  const heli = !!v && isHelicopter(v);
  const out = [], pads = [];
  for (const t of st.tiles) {
    if (t.kind !== 'airport') continue;
    const b = map.tiles[t.y * map.width + t.x].building;
    if (!model || !vehicleFitsAirport(model, airportTypeId(b))) continue;
    if (heli && b && b.part === 'helipad' && HELI_PAD_TYPES.has(airportTypeId(b))) pads.push({ x: t.x, y: t.y });
    else if (isRunwayCentre(b)) out.push({ x: t.x, y: t.y });
  }
  if (!pads.length) return out;
  // helicopters: every helipad of the station; the free ones first (a busy pad is taken only when all are busy)
  const free = [];
  for (const p of pads) if (!ftaTileOccupied(state, v, p.x, p.y)) free.push(p);
  return free.length ? free : pads;
}

/** True when a station has a goal this aircraft may use (a plane has no goal at a heliport). */
export function stationFitsVehicle(state, st, v) {
  if (v.kind !== 'aircraft') return true;
  return airGoals(state, st, v).length > 0;
}

/** Goal tiles: company depots of the vehicle's kind (or one depot when depotId given). */
export function depotGoals(state, v, depotId) {
  const kind = v.kind === 'train' ? 'rail' : v.kind === 'aircraft' ? 'air' : v.kind === 'ship' ? 'ship' : 'road';
  const model = v.kind === 'aircraft' ? MODEL_BY_ID[v.modelId] : null;
  const own = v.ownerId ?? null; // OpenTTD FindClosest*Depot: only the vehicle owner's depots (a fixed id was owner-checked when ordered)
  // Single pass, same short-circuit order as the old filter().map(); the depot id / owner test is hoisted out of the loop.
  const anyDepot = depotId === undefined;
  const out = [];
  for (const d of state.depots) {
    if (d.kind !== kind) continue;
    if (anyDepot ? (d.ownerId ?? null) !== own : d.id !== depotId) continue;
    if (model && !vehicleFitsAirport(model, airportTypeId(d))) continue;
    out.push({ x: d.x, y: d.y });
  }
  return out;
}

/**
 * Extend a path ending on a station tile further along the platform (same station, straight).
 */
function extendAlongPlatform(state, path) {
  if (path.length < 2) return path;
  const { map } = state;
  const last = path[path.length - 1], prev = path[path.length - 2];
  const bit = dirBetween(prev.x, prev.y, last.x, last.y);
  const d = DIRS.find((q) => q.bit === bit);
  const b0 = map.tiles[last.y * map.width + last.x].building;
  if (!d || !b0 || b0.type !== 'station') return path;
  let cx = last.x, cy = last.y;
  for (let i = 0; i < 64; i++) {
    const nx = cx + d.dx, ny = cy + d.dy;
    if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) break;
    const a = map.tiles[cy * map.width + cx], b = map.tiles[ny * map.width + nx];
    if (!b.building || b.building.type !== 'station' || b.building.stationId !== b0.stationId) break;
    if (!(a.rail & d.bit) || !(b.rail & OPPOSITE[d.bit])) break;
    path.push({ x: nx, y: ny });
    cx = nx; cy = ny;
  }
  return path;
}

/**
 * Where a train stops on the platform of its order's station (OpenTTD GetTrainStopLocation, train_cmd.cpp).
 * The path reaches platform tile g coming from the entry end (the platform end behind g, on the path's side).
 * The head's stop tile is measured from that entry end: 'near' = the train's tail at the entry end (OpenTTD
 * OrderStopLocation::NearEnd, stop = train length), 'middle' = centred (Middle: L - (L - T) / 2), absent or
 * 'far' = the far end (FarEnd: stop = L; the default and the only choice when the train is as long as the
 * platform). Lazy: stopAt exists only on orders that set it; absent keeps the far-end path unchanged.
 */
function trainStopPath(state, v, path) {
  const order = v.orders && v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
  const stopAt = order && (order.stopLocation !== undefined ? order.stopLocation : (order.stopAt !== undefined ? order.stopAt : undefined));
  if (stopAt !== 'near' && stopAt !== 'middle') return extendAlongPlatform(state, path);
  if (path.length < 2) return path;
  const { map } = state;
  const g = path[path.length - 1], prev = path[path.length - 2];
  const b0 = map.tiles[g.y * map.width + g.x].building;
  if (!b0 || b0.type !== 'station' || b0.stationId !== order.stationId || b0.kind !== 'rail') return extendAlongPlatform(state, path);
  const dx = Math.sign(g.x - prev.x), dy = Math.sign(g.y - prev.y);
  const isPlat = (x, y) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    const b = map.tiles[y * map.width + x].building;
    return !!b && b.type === 'station' && b.stationId === b0.stationId && b.kind === 'rail' && b.axis === b0.axis;
  };
  let fwd = 0, back = 0;
  while (isPlat(g.x + dx * (fwd + 1), g.y + dy * (fwd + 1))) fwd++;
  while (isPlat(g.x - dx * (back + 1), g.y - dy * (back + 1))) back++;
  const n = fwd + back + 1; // platform run length in tiles
  const t = trainLengthTiles(v);
  if (t >= n) return extendAlongPlatform(state, path); // as long as the platform: far end
  const h = stopAt === 'near' ? t : n - (n - t) / 2; // head position from the entry end, in tiles
  const j = Math.min(n - 1, Math.max(0, Math.ceil(h - 1e-9) - 1)); // head tile index from the entry end
  const k = j - back; // head tile offset from g along the travel direction (negative = behind g)
  if (k >= 0) {
    // Append in place: `path` is the freshly planned array owned by this call (extendAlongPlatform already
    // mutates it the same way), so no defensive copy is needed; contents and order are unchanged.
    for (let i = 1; i <= k; i++) path.push({ x: g.x + dx * i, y: g.y + dy * i });
    return path;
  }
  // the head stops behind g: cut the path at that tile when it is on the path (else far end)
  const want = { x: g.x + dx * k, y: g.y + dy * k };
  const cut = path.findIndex((p) => p.x === want.x && p.y === want.y);
  if (cut >= 0) { path.length = cut + 1; return path; } // same prefix as slice(0, cut+1), no copy
  return extendAlongPlatform(state, path);
}

/**
 * Reverse a train's consist in place: its rear becomes its head (sets v.flipped).
 * Returns the new head tile.
 */
/**
 * May this train turn around now? (OpenTTD difficulty.train_flip_reverse_allowed.) 'all' (default): always.
 * 'endOfLine': only when the train's tile has a single rail link (a dead end). 'none': never.
 * Road vehicles and non-trains are never restricted.
 */
export function canFlipTrain(state, v) {
  if (v.kind !== 'train') return true;
  const mode = getSetting(state, 'trainFlipReverse');
  if (mode !== 'endOfLine' && mode !== 'none') return true;
  if (mode === 'none') return false;
  const W = state.map.width;
  const t = state.map.tiles[v.ty * W + v.tx];
  if (!t) return false;
  let links = 0;
  for (const d of DIRS) if (t.rail & d.bit) links++;
  return links === 1;
}

export function flipTrain(v) {
  const k = Math.min(Math.ceil(v.wagons * 0.5), v.history.length - 1);
  if (k <= 0) { v.flipped = !v.flipped; return v.history[0]; }
  // Build the reversed prefix directly. Must be a new array: planRoute keeps the old v.history in `saved`
  // for rollback, so it must not be mutated or reused here.
  const n = k + 1;
  const part = new Array(n);
  for (let i = 0; i < n; i++) part[i] = v.history[k - i];
  v.history = part;
  v.flipped = !v.flipped;
  v.tx = part[0].x; v.ty = part[0].y;
  return part[0];
}

/**
 * Path from a vehicle's head tile to the nearest goal: track/road search, or for aircraft a
 * straight Bresenham line to the nearest goal (no connectivity needed).
 * @returns {{x:number,y:number}[]|null}
 */
/** True when a train's locomotive is electric: it may only use electrified rail (pathfinder opts.electric). */
export function needsElectric(v, state) {
  if (v.kind !== 'train') return false;
  if (state && getSetting(state, 'disableElrails')) return false; // OpenTTD disable_elrails: no catenary requirement
  const m = MODEL_BY_ID[v.modelId];
  return !!m && m.traction === 'electric';
}

/** Track type (config/railTypes.js) a train's locomotive runs on: 0 plain rail (default), 2 monorail, 3 maglev. */
export function trainTrack(v) {
  if (v.kind !== 'train') return 0;
  const m = MODEL_BY_ID[v.modelId];
  return (m && m.railType) || 0;
}

export function findVehiclePath(state, v, goals) {
  if (v.kind === 'ship') return findShipPath(state.map, { x: v.tx, y: v.ty }, goals, { turnCost: getSetting(state, 'shipTurnCost') });
  if (v.kind !== 'aircraft') return findPath(state.map, { x: v.tx, y: v.ty }, goals, layerOf(v), { electric: needsElectric(v, state), trk: trainTrack(v), pathCosts: getSetting(state, 'pathCosts'), state, vehicle: v });
  if (!goals.length) return null;
  let best = goals[0];
  for (const g of goals) if (manhattan(v.tx, v.ty, g.x, g.y) < manhattan(v.tx, v.ty, best.x, best.y)) best = g;
  return airLine(v.tx, v.ty, best.x, best.y);
}

/**
 * Plan a route for a vehicle from its head tile to goals; handles train reversal.
 * Sets v.path/pathIndex/progress on success.
 * @returns {boolean} found
 */
export function planRoute(state, v, goals) {
  const layer = layerOf(v);
  const start = { x: v.tx, y: v.ty };
  let path = findVehiclePath(state, v, goals);
  if (!path) return false;
  const behind = v.history[1];
  if (v.kind === 'train' && path.length > 1 && behind && path[1].x === behind.x && path[1].y === behind.y) {
    // the route leads back the way we came: reverse the consist and plan from the rear
    const saved = { history: v.history, flipped: v.flipped, tx: v.tx, ty: v.ty };
    const head = flipTrain(v);
    const alt = findPath(state.map, head, goals, layer, { electric: needsElectric(v, state), trk: trainTrack(v), pathCosts: getSetting(state, 'pathCosts'), state, vehicle: v });
    if (alt) path = alt;
    else Object.assign(v, saved);
  }
  if (v.kind === 'train') path = trainStopPath(state, v, path);
  v.path = path;
  v.pathIndex = 0;
  v.progress = 0;
  return true;
}
