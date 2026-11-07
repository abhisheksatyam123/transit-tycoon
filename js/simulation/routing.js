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
  const order = v.orders[v.orderIndex];
  if (!order) return [];
  const st = findStation(state, order.stationId);
  if (!st) return [];
  const kind = stopKindFor(v);
  if (kind === 'airport') return airGoals(state, st, v);
  if (kind === 'ship') return shipGoals(state.map, st);
  // waypoints (cmdWaypoint.js) are goal tiles too (go via: the path ends there): rail for trains, road for road vehicles
  return st.tiles.filter((t) => stopKindOk(v, t.kind) || (t.kind === 'waypoint' && (kind === 'rail' ? !t.road : !!t.road && v.roadType !== 'tram')))
    .map((t) => ({ x: t.x, y: t.y }));
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
  const free = pads.filter((p) => !ftaTileOccupied(state, v, p.x, p.y));
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
  return state.depots.filter((d) => d.kind === kind && (depotId === undefined || d.id === depotId)
    && (!model || vehicleFitsAirport(model, airportTypeId(d))))
    .map((d) => ({ x: d.x, y: d.y }));
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
 * Reverse a train's consist in place: its rear becomes its head (sets v.flipped).
 * Returns the new head tile.
 */
export function flipTrain(v) {
  const k = Math.min(Math.ceil(v.wagons * 0.5), v.history.length - 1);
  if (k <= 0) { v.flipped = !v.flipped; return v.history[0]; }
  const part = v.history.slice(0, k + 1).reverse();
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
export function needsElectric(v) {
  if (v.kind !== 'train') return false;
  const m = MODEL_BY_ID[v.modelId];
  return !!m && m.traction === 'electric';
}

export function findVehiclePath(state, v, goals) {
  if (v.kind === 'ship') return findShipPath(state.map, { x: v.tx, y: v.ty }, goals);
  if (v.kind !== 'aircraft') return findPath(state.map, { x: v.tx, y: v.ty }, goals, layerOf(v), { electric: needsElectric(v), pathCosts: getSetting(state, 'pathCosts'), state, vehicle: v });
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
    const alt = findPath(state.map, head, goals, layer, { electric: needsElectric(v), pathCosts: getSetting(state, 'pathCosts'), state, vehicle: v });
    if (alt) path = alt;
    else Object.assign(v, saved);
  }
  if (v.kind === 'train') path = extendAlongPlatform(state, path);
  v.path = path;
  v.pathIndex = 0;
  v.progress = 0;
  return true;
}
