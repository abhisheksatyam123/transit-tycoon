/**
 * Per-tick vehicle state machine: movement along paths, arrival, loading, lost handling.
 * Queueing (blocking.js): a vehicle does not enter a tile still occupied by a vehicle moving the same way
 * ahead of it, so it queues behind it (oncoming traffic passes; a road stop bay blocks both ways), and
 * vehicles loading at a stop block the bay. A vehicle blocked by a moving vehicle for BLOCK_TIMEOUT_TICKS turns
 * around (trains reverse, road vehicles back up one tile), then waits another full timeout.
 * Signals are not simulated; head-on trains on single track pass each other.
 */
import { TICKS_PER_DAY } from './constants.js';
import { landSpeedStep, airSpeedStep, gradeMph, DIAGONAL_STEP } from './loco/vehicleMotion.js';
import { curveSpeedLimitKmh, realisticTrainSpeedStep } from './loco/trainRealistic.js';
import { KMH_TO_TILES_PER_TICK } from './loco/vehicleMotion.js';
import { connected } from './network.js';
import { findStation, findDepot } from './state.js';
import { historyNeeded, vehicleModel } from './vehicles.js';
import { layerOf, stopKindOk, orderGoals, depotGoals, planRoute, findVehiclePath, flipTrain } from './routing.js';
import { altitudeAt, isRunwayCentre } from './aircraft.js';
import { isHelicopter, airportTypeId } from './airportTypes.js';
import { airSlotFree, airTookRunway, holdFlyLeg } from './airportFsa.js';
import { ftaHeliFor, heliDepartPath, heliAnyFree, ftaGroundFor, ftaBlocked, ftaPartTiles, ftaTileOccupied, ftaRunwayBusy, takeoffViaTerminal, taxiPath, clearGround, setGroundPath, ftaCanLand, ftaParked, ftaClaimed } from './airportGround.js';
import { trainEntersCrossing } from './trainCollision.js'; // vehicleCollisions setting (off by default)
import { maybeCrashLanding } from './planeCrash.js'; // planeCrashes setting (off by default)
import { shipLinkOk, shipSpeedStep } from './shipPath.js';
import { shipArrive } from './shipOrders.js';
import { servicePerformed, serviceDueNow } from './service.js';
import { refitCore } from './refit.js';
import { autorenewVehicle } from './autorenew.js';
import { dayNumber } from './date.js';
import { getSetting } from './settings.js';
import { currentOrder, advanceOrder, arriveAtStation, loadingTick, stopMode, isDepotOrder, isNearestDepotOrder } from './orders.js';
import { resolveConditionals } from './condOrders.js';
import { notify } from './news.js';
import { dirBetween } from './constants.js';
import { BLOCK_TIMEOUT_TICKS, occupancyLayer, blockerOn, vehiclesOn, trainInBlock } from './blocking.js';
import { guardedBlock } from './signals.js';
import { typedGate, releaseReservations } from './pathSignals.js';
import { overtakeEnabled, overtakeBlocker, tryOvertake, overtakeTick, overtakeSpeed } from './roadOvertake.js';
import { CROSSING_HOLD, entersBarred } from './levelCrossing.js';

/** Ticks between path retries for lost vehicles. */
export const LOST_RETRY_TICKS = 2 * TICKS_PER_DAY;

/**
 * Advance one vehicle by one tick.
 * @param {{state:object, emit:Function}} ctx
 * @param {object} v vehicle
 */
export function vehicleTick(ctx, v) {
  if (v.kind === 'aircraft' && v.state !== 'running' && v.state !== 'broken') v.alt = 0;
  if (v.blockedTicks && v.state !== 'running') clearBlock(v);
  if (v.resv) releaseReservations(ctx.state, v); // path signal reservations (pathSignals.js); only when held
  switch (v.state) {
    case 'depot':
    case 'stopped':
      return;
    case 'broken':
      v.speed = 0;
      if (--v.breakdownTicks <= 0) { v.breakdownTicks = 0; v.state = 'running'; }
      return;
    case 'lost':
      if (ctx.state.tick >= v.retryTick) replan(ctx, v);
      return;
    case 'loading':
      if (loadingTick(ctx, v)) {
        if (v.intermediate) { // stop 'all' at a passed station: the order is still pending, continue to it
          delete v.intermediate;
          v.atStationId = null;
          v.state = 'running';
          replan(ctx, v);
          return;
        }
        advanceOrder(v);
        v.atStationId = null;
        v.state = 'running';
        if (v.serviceDue) startServiceTrip(ctx, v); // the stop is finished: service before the next order
        replan(ctx, v);
      }
      return;
    case 'running':
      if (v.overtakeId !== undefined) overtakeTick(ctx, v); // OpenTTD overtaking state (roadOvertake.js)
      if (v.kind === 'ship') { moveShip(ctx, v); return; }
      if (v.kind === 'aircraft' && v.ftaGroundEnd != null) { // FTA ground phase (airportGround.js)
        if (v.pathIndex > v.ftaGroundEnd) clearGround(v); // airborne (or taxi finished): flight rules again
        else if (ftaBlocked(ctx.state, v)) { v.ftaWait = (v.ftaWait || 0) + 1; v.speed = 0; v.alt = 0; return; }
        else if (v.ftaWait) delete v.ftaWait;
      }
      if (v.kind === 'aircraft' && v.hold && heliHoldPadFree(ctx, v)) { delete v.hold; replan(ctx, v); return; } // holding helicopter: a pad opened
      move(ctx, v);
      if (v.kind === 'aircraft') { v.alt = v.ftaGroundEnd != null ? 0 : altitudeAt(v, isHelicopter(v)); if (v.hold) v.alt = 1; } // holding: cruise height
      return;
    default:
  }
}

/**
 * Plan a new route for the vehicle towards its depot target or current order.
 * Sets state to 'running', 'stopped' (no orders) or 'lost' (no path).
 * @returns {boolean} true when a route exists
 */
export function replan(ctx, v) {
  const { state } = ctx;
  let goals;
  const noDepotTrip = v.goingToDepot === null || v.goingToDepot === undefined;
  if (noDepotTrip && v.orders.length && skipNotDueDepotOrders(state, v)) { v.state = 'stopped'; v.speed = 0; v.path = []; v.pathIndex = 0; v.progress = 0; return false; }
  // conditional orders (condOrders.js): evaluated only here, when the vehicle advances to them
  if (noDepotTrip && v.orders.length && !resolveConditionals(state, v)) { v.state = 'stopped'; v.speed = 0; v.path = []; v.pathIndex = 0; v.progress = 0; return false; }
  const order = noDepotTrip && v.orders.length ? currentOrder(v) : null;
  const toDepotOrder = isDepotOrder(order);
  if (v.kind === 'aircraft' && noDepotTrip && v.orders.length && !toDepotOrder && ftaReplan(ctx, v)) return true;
  if (v.goingToDepot !== null && v.goingToDepot !== undefined) {
    goals = depotGoals(state, v, v.goingToDepot);
    if (!goals.length) { v.goingToDepot = null; return replan(ctx, v); }
  } else if (toDepotOrder) { // go-to-depot order: the order's depot; a removed depot order is skipped
    // nearest: every depot of the vehicle's kind (planRoute takes the cheapest reachable one); else the fixed depot
    goals = depotGoals(state, v, isNearestDepotOrder(order) ? undefined : order.depotId);
    if (!goals.length) { // the depot is gone: skip that order (all depot orders gone -> nothing to do)
      if (v.orders.every((o) => isDepotOrder(o))) { v.state = 'stopped'; v.speed = 0; v.path = []; v.pathIndex = 0; v.progress = 0; return false; }
      advanceOrder(v);
      return replan(ctx, v);
    }
  } else {
    if (!v.orders.length) { v.state = 'stopped'; v.speed = 0; v.path = []; v.pathIndex = 0; v.progress = 0; return false; }
    goals = orderGoals(state, v);
  }
  if (goals.length && planRoute(state, v, goals)) {
    v.state = 'running';
    v.lostSince = null;
    return true;
  }
  if (v.state !== 'lost') {
    v.state = 'lost';
    v.lostSince = state.tick;
    const order = currentOrder(v);
    const st = order && findStation(state, order.stationId);
    notify(ctx, `${v.name} is lost: no route to ${v.goingToDepot != null ? 'depot' : st ? st.name : 'destination'}.`, 'bad', v.tx, v.ty, 'advice');
  }
  v.speed = 0;
  v.path = [{ x: v.tx, y: v.ty }];
  v.pathIndex = 0;
  v.progress = 0;
  v.retryTick = state.tick + LOST_RETRY_TICKS;
  return false;
}

/** A service-only go-to-depot order whose vehicle is not due for service is skipped (advance past it). */
function depotOrderNotDue(state, v, o) {
  return isDepotOrder(o) && o.serviceOnly && !serviceDueNow(state, v);
}

/**
 * Skip the current order(s) while they are service-only depot orders that are not due (bounded by the list).
 * @returns {boolean} true when every order is such a skipped depot order (nothing left to drive to)
 */
function skipNotDueDepotOrders(state, v) {
  for (let k = 0; k < v.orders.length; k++) {
    if (!depotOrderNotDue(state, v, currentOrder(v))) return false;
    advanceOrder(v);
  }
  return true;
}

/**
 * FTA ground start (OpenTTD AircraftEventHandler_AtTerminal / TakeOff): at its own airport the aircraft taxis to a
 * terminal (hangar -> terminal); elsewhere it taxis to the runway and takes off. Returns false (old flight rules)
 * for helicopters, other airport types and planes not standing on an FTA airport tile.
 */
function ftaReplan(ctx, v) {
  const { state } = ctx;
  const b = state.map.tiles[v.ty * state.map.width + v.tx].building;
  if (ftaHeliFor(v, b)) return heliReplan(ctx, v, b);
  if (!ftaGroundFor(v, b)) return false;
  const order = currentOrder(v);
  const st = order && findStation(state, order.stationId);
  const here = findStation(state, b.stationId);
  if (!st || !here) return false;
  delete v.hold;
  if (st.id === here.id) { // at its own airport: taxi to a terminal (free one if there is one)
    const terms = ftaPartTiles(state, here, 'terminal');
    const free = terms.filter((t) => !ftaClaimed(state, v, t.x, t.y));
    if (!free.length) return false; // all terminals taken: the old flight rules (circle until a slot frees)
    const p = taxiPath(state, here, v.tx, v.ty, free, (x, y) => ftaParked(state, v, x, y));
    if (!p) return false;
    setGroundPath(v, { path: p, groundEnd: p.length - 1 });
    return true;
  }
  const goals = orderGoals(state, v);
  const p = goals.length ? takeoffViaTerminal(state, here, v.tx, v.ty, goals, (x, y) => ftaParked(state, v, x, y), v) : null;
  if (!p) return false;
  setGroundPath(v, p);
  return true;
}

/**
 * A holding helicopter at a pad-type airport re-checks the helipads every tick (not only at its loop corners), so a
 * freed pad goes to the first helicopter that sees it instead of whichever one happens to be at a corner.
 */
function heliHoldPadFree(ctx, v) {
  const { state } = ctx;
  const ab = state.map.tiles[v.hold.y * state.map.width + v.hold.x].building;
  if (!ftaHeliFor(v, ab)) return false;
  const order = currentOrder(v);
  const hst = order && findStation(state, order.stationId);
  return !!hst && heliAnyFree(state, v, hst);
}

/**
 * Helicopter departure (OpenTTD helicopter TakeOff): from a hangar it taxis to a free helipad and lifts off there;
 * from a pad it lifts off at once. Returns false (flight rules) when it stays at its own station or no pad is free.
 */
function heliReplan(ctx, v, b) {
  const { state } = ctx;
  const order = currentOrder(v);
  const st = order && findStation(state, order.stationId);
  const here = findStation(state, b.stationId);
  if (!st || !here || st.id === here.id) return false;
  delete v.hold;
  const goals = orderGoals(state, v);
  const p = goals.length ? heliDepartPath(state, here, v, b, goals, (x, y) => ftaParked(state, v, x, y)) : null;
  if (!p) return false;
  setGroundPath(v, p);
  return true;
}

/**
 * FTA landing at the runway centre of st (OpenTTD LANDING -> ENDLANDING -> terminal): holds while the runway is
 * taken or no terminal tile is free, else taxis to the nearest free terminal (the loading starts there).
 * @returns {boolean} true when handled (holding or taxiing); false for no FTA ground path (use the old arrival)
 */
function ftaLand(ctx, v, st, b) {
  const { state } = ctx;
  if (ftaRunwayBusy(state, st, v)) { holdFlyLeg(state, v, v.tx, v.ty); return true; }
  const free = ftaPartTiles(state, st, 'terminal').filter((t) => !ftaClaimed(state, v, t.x, t.y));
  const p = free.length ? taxiPath(state, st, v.tx, v.ty, free, (x, y) => ftaParked(state, v, x, y)) : null;
  if (!p) { holdFlyLeg(state, v, v.tx, v.ty); return true; }
  delete v.hold;
  if (maybeCrashLanding(ctx, v, st)) return true; // landing crash: vehicle removed
  setGroundPath(v, { path: p, groundEnd: p.length - 1 });
  return true;
}

/** Move a ship along its water path (shipPath.js): no queueing, no signals; links are open water tiles. */
function moveShip(ctx, v) {
  const { state } = ctx;
  if (!v.path.length || v.pathIndex >= v.path.length - 1) { onPathEnd(ctx, v); return; }
  if (v.progress === 0 && !shipLinkOk(state.map, v)) { replan(ctx, v); return; }
  v.speed = shipSpeedStep(v, v.maxSpeed);
  v.progress += v.speed;
  if (v.blockedTicks) clearBlock(v);
  const keep = historyNeeded(v);
  while (v.progress >= 1) {
    v.progress -= 1;
    v.pathIndex++;
    const p = v.path[v.pathIndex];
    v.tx = p.x; v.ty = p.y;
    v.history.unshift({ x: p.x, y: p.y });
    if (v.history.length > keep) v.history.length = keep;
    if (v.pathIndex >= v.path.length - 1) { v.progress = 0; onPathEnd(ctx, v); return; }
    if (!shipLinkOk(state.map, v)) { v.progress = 0; replan(ctx, v); return; }
  }
}

/**
 * Orders with a stop mode (OpenTTD ONSF_*), checked on each tile a train or road vehicle enters mid-path:
 * - 'all' (stop at all stations): a station of the vehicle's company on the path stops it; it loads / unloads
 *   there and then continues to the current order (orders.js loadingTick).
 * - 'via' (go via): entering the order's own station passes it: the order counts as reached, no stop.
 * @returns {boolean} true when the vehicle stopped or moved on to another order (its path was replaced)
 */
function passStation(ctx, v) {
  if (v.kind !== 'train' && v.kind !== 'road') return false;
  const order = currentOrder(v);
  if (!order || v.goingToDepot != null) return false;
  const mode = stopMode(order);
  if (mode === 'non') return false;
  const { state } = ctx;
  const t = state.map.tiles[v.ty * state.map.width + v.tx];
  const b = t.building;
  const wp = b && b.type === 'station' && b.kind === 'waypoint'; // rail waypoint: only its own go-via order counts
  const st = b && b.type === 'station' && (wp || stopKindOk(v, b.kind)) ? findStation(state, b.stationId) : null;
  // a station's platform tiles are consecutive: serve it once, not on every tile of it (v.passedStationId, lazy)
  if (!st || st.id !== v.passedStationId) delete v.passedStationId;
  if (!st || (st.ownerId ?? null) !== (v.ownerId ?? null)) return false;
  if (st.id === v.passedStationId) return false;
  if (st.id === order.stationId) {
    if (mode !== 'via') return false; // the destination itself: the normal path-end rules apply
    advanceOrder(v);
    replan(ctx, v);
    return true;
  }
  if (mode !== 'all' || wp) return false;
  v.passedStationId = st.id;
  arriveAtStation(ctx, v, st, true);
  return true;
}

/** Move a running vehicle along its path. */
function move(ctx, v) {
  const { state } = ctx;
  if (!v.path.length || v.pathIndex >= v.path.length - 1) { onPathEnd(ctx, v); return; }
  const layer = layerOf(v);
  if (v.progress === 0 && !linkOk(state, layer, v)) { v.progress = 0; replan(ctx, v); return; }
  const tie = v.kind === 'aircraft' ? null : startTie(ctx, v);
  if (tie) { hold(ctx, v, tie); return; }
  const blocker = v.kind === 'aircraft' ? null : nextBlocker(ctx, v);
  if (v.kind === 'aircraft') {
    // planeSpeedFactor (OpenTTD vehicle.plane_speed, aircraft_cmd.cpp): speed limit divided by N; 1 = unchanged
    const pf = getSetting(state, 'planeSpeedFactor') || 1;
    v.speed = airSpeedStep(v, pf > 1 ? v.maxSpeed / pf : v.maxSpeed);
    // diagonal (Bresenham) steps are sqrt(2) tiles long (kMovementNibbleToDistance diagonal / straight)
    const a = v.path[v.pathIndex], b = v.path[v.pathIndex + 1];
    v.progress += a.x !== b.x && a.y !== b.y ? v.speed / DIAGONAL_STEP : v.speed;
  } else {
    const prevSpeed = v.speed;
    const grade = getSetting(state, 'gradients') ? gradeMph(state, v) : 0;
    // OTTD order max speed (GetMaxSpeed of the current order): the vehicle's cap while heading to that order.
    // Lazy: only an order with `maxSpeed` (km/h) lowers the cap; the common path is one array read.
    const cur = v.orders.length ? v.orders[v.orderIndex % v.orders.length] : null;
    let maxTiles = v.maxSpeed;
    if (cur && cur.maxSpeed > 0) { const c = cur.maxSpeed * KMH_TO_TILES_PER_TICK; if (c < maxTiles) maxTiles = c; }
    if (v.kind === 'train' && getSetting(state, 'trainAcceleration') === 'realistic') {
      // OTTD curve limit (train_cmd.cpp GetCurveSpeedLimit) caps the target; acceleration is the OTTD model
      const lim = curveSpeedLimitKmh(v) * KMH_TO_TILES_PER_TICK;
      const target = lim < maxTiles ? lim : maxTiles;
      v.speed = realisticTrainSpeedStep(v, vehicleModel(v), target, grade);
    } else {
      v.speed = landSpeedStep(v, vehicleModel(v), maxTiles, grade);
    }
    if (v.overtakeId !== undefined) v.speed = overtakeSpeed(v, prevSpeed, v.speed, maxTiles); // OTTD 512 vs 256
    if (blocker && v.progress + v.speed >= 1 && !breaksCycle(ctx, v)) { hold(ctx, v, blocker); return; }
    v.progress += v.speed;
  }
  if (v.blockedTicks) clearBlock(v);
  const keep = historyNeeded(v);
  while (v.progress >= 1) {
    v.progress -= 1;
    v.pathIndex++;
    const p = v.path[v.pathIndex];
    v.tx = p.x; v.ty = p.y;
    v.history.unshift({ x: p.x, y: p.y });
    if (v.history.length > keep) v.history.length = keep;
    if (ctx.collide && v.kind === 'train') trainEntersCrossing(ctx, v, p.x, p.y); // vehicleCollisions (trainCollision.js)
    if (v.pathIndex >= v.path.length - 1) { v.progress = 0; onPathEnd(ctx, v); return; }
    if (passStation(ctx, v)) { v.progress = 0; return; } // stop 'all' / 'via' at a station on the way
    if (!linkOk(state, layer, v)) { v.progress = 0; replan(ctx, v); return; }
  }
}

/** Road vehicle entering a barred level crossing from a tile that is not one (OpenTTD road vehicles stop before a barred crossing). */
export function crossingBarred(ctx, a, b) {
  const W = ctx.state.map.width;
  return entersBarred(ctx.barred, W, a.y * W + a.x, b.y * W + b.x);
}

/** Vehicle ahead on the next tile of the path that blocks v (see blocking.js), or null. */
function nextBlocker(ctx, v) {
  const layer = occupancyLayer(v);
  const p = v.path, i = v.pathIndex;
  if (!layer || !p || i + 1 >= p.length) return null;
  const a = p[i], b = p[i + 1];
  const dir = dirBetween(a.x, a.y, b.x, b.y);
  if (layer === 'road' && ctx.barred && crossingBarred(ctx, a, b)) return CROSSING_HOLD; // level crossing closed
  if (layer === 'road' && v.overtakeId !== undefined) return overtakeBlocker(ctx, v, b.x, b.y, dir); // passing the overtaken vehicle
  const same = blockerOn(ctx, v, layer, b.x, b.y, dir);
  if (layer === 'road' && same && overtakeEnabled(ctx.state) && tryOvertake(ctx, v, same)) return overtakeBlocker(ctx, v, b.x, b.y, dir);
  if (same || layer !== 'rail') return same;
  return signalBlocker(ctx, v, a, b) || typedGate(ctx, v, a, b);
}

/**
 * Signals (signals.js): a train entering a signal block from outside it is held while another train has a
 * body cell in that block. A train already inside the block, or stepping between tiles of one block, is
 * never held by the rule. Blocks without a signal are not guarded (returns null).
 */
function signalBlocker(ctx, v, a, b) {
  const { state } = ctx;
  const W = state.map.width;
  const toB = guardedBlock(state, b.y * W + b.x);
  if (toB < 0 || guardedBlock(state, a.y * W + a.x) === toB) return null;
  return trainInBlock(ctx, v, toB);
}

/**
 * Vehicles that start from the same depot tile in one tick: the lower id leaves first, the other waits
 * on its own first tile until the lower id has moved on (blocking.js indexes body cells only).
 */
function startTie(ctx, v) {
  if (v.pathIndex !== 0 || v.progress !== 0 || !v.path.length) return null;
  const layer = occupancyLayer(v);
  const list = layer ? vehiclesOn(ctx, layer, v.tx, v.ty) : null;
  if (!list) return null;
  for (const o of list) if (o !== v && o.id < v.id && o.pathIndex === 0 && o.state === 'running') return o;
  return null;
}

/**
 * Deadlock breaker: after half a day blocked, follow the blockedBy chain (up to 16 links). When it leads back
 * to v (vehicles waiting on each other in a cycle), the lowest id in the cycle proceeds and passes through.
 */
function breaksCycle(ctx, v) {
  if ((v.blockedTicks || 0) <= TICKS_PER_DAY / 2) return false;
  const occ = ctx.occupancy;
  let byId = occ && occ.byId;
  if (!byId) {
    byId = new Map();
    for (const o of ctx.state.vehicles) byId.set(o.id, o);
    if (occ) occ.byId = byId;
  }
  let minId = v.id, cur = v;
  for (let i = 0; i < 16; i++) {
    const next = cur.blockedBy === undefined ? null : byId.get(cur.blockedBy);
    if (!next || !next.blockedTicks) return false;
    if (next === v) return v.id === minId;
    if (next.id < minId) minId = next.id;
    cur = next;
  }
  return false;
}

function clearBlock(v) {
  delete v.blockedTicks;
  delete v.blockedBy;
}

/**
 * Hold a vehicle at the boundary of its current tile while the next tile is occupied. A vehicle held at the
 * last tile of a stop with a loading vehicle in its bay tries another free bay of the same stop. Trains and
 * vehicles blocked by a moving vehicle for BLOCK_TIMEOUT_TICKS turn around and re-plan (cooldown: the timeout
 * restarts after a turn). Blocked behind a loading vehicle they wait for it instead.
 */
function hold(ctx, v, blocker) {
  v.speed = 0;
  v.blockedTicks = (v.blockedTicks || 0) + 1;
  v.blockedBy = blocker.id;
  const last = v.pathIndex + 2 === v.path.length;
  if (last && blocker.state === 'loading' && v.blockedTicks % 8 === 1) tryFreeBay(ctx, v);
  // blocked for a full timeout by a moving vehicle: turn around once (blockedTicks restarts from 0 in turnAround)
  if (v.blockedTicks === BLOCK_TIMEOUT_TICKS && blocker.state !== 'loading') turnAround(ctx, v);
}

/** Re-route a vehicle waiting for a busy stop bay to a free goal tile of its current order. */
function tryFreeBay(ctx, v) {
  const { state } = ctx;
  if (v.goingToDepot !== null && v.goingToDepot !== undefined) return;
  const layer = occupancyLayer(v);
  const goals = orderGoals(state, v).filter((g) => !vehiclesOn(ctx, layer, g.x, g.y)?.some((o) => o !== v));
  if (goals.length) planRoute(state, v, goals);
}

/** Trains reverse end for end; road vehicles back up one tile along the way they came. Then they re-plan. */
export function turnAround(ctx, v) {
  clearBlock(v); // blockedTicks restarts from 0, so the next turnaround waits a full timeout too (cooldown)
  if (v.kind === 'train') {
    flipTrain(v);
    v.speed = 0; v.path = []; v.pathIndex = 0; v.progress = 0;
    replan(ctx, v);
    return;
  }
  const h1 = v.history[1];
  if (!h1) return;
  v.path = [{ x: v.tx, y: v.ty }, { x: h1.x, y: h1.y }];
  v.pathIndex = 0; v.progress = 0;
}

/** True when the link from path[pathIndex] to path[pathIndex+1] is still connected. */
function linkOk(state, layer, v) {
  if (v.kind === 'aircraft') return true;
  const a = v.path[v.pathIndex], b = v.path[v.pathIndex + 1];
  if (!b) return true;
  return connected(state.map, layer, a.x, a.y, b.x, b.y);
}

/** Handle the vehicle reaching the end of its path. */
function onPathEnd(ctx, v) {
  const { state } = ctx;
  const t = state.map.tiles[v.ty * state.map.width + v.tx];
  const b = t.building;
  if (v.goingToDepot !== null && v.goingToDepot !== undefined) {
    const hangar = b && b.type === 'station' && (b.part === 'hangar' || b.part === 'helipad');
    if (b && ((b.type === 'depot' && b.depotId === v.goingToDepot) || (hangar && b.depotId === v.goingToDepot))) {
      if (v.serviceTrip) { serviceAtDepot(ctx, v); return; }
      enterDepot(ctx, v, b.depotId);
      return;
    }
    replan(ctx, v);
    return;
  }
  const order = currentOrder(v);
  if (isDepotOrder(order)) { // go-to-depot order: visit the depot (service / refit) and go on
    const hangarHere = b && b.type === 'station' && (b.part === 'hangar' || b.part === 'helipad');
    const want = isNearestDepotOrder(order) ? b && b.depotId : order.depotId; // nearest: whichever depot the path ended at
    if (b && ((b.type === 'depot' || hangarHere) && b.depotId === want)) depotOrderVisit(ctx, v, order);
    else replan(ctx, v);
    return;
  }
  if (v.kind === 'ship') { // water stop: a dock beside the ship (loads) or a buoy (waypoint, passes on)
    if (shipArrive(ctx, v) === 'stop') return;
    replan(ctx, v);
    return;
  }
  if (v.kind === 'aircraft' && ftaGroundFor(v, b) && b.part === 'terminal' && ftaParked(state, v, v.tx, v.ty)) return; // terminal taken meanwhile: wait on the taxiway
  if (v.kind === 'aircraft') clearGround(v); // a finished ground path (landing taxi at the terminal)
  if (v.kind === 'aircraft' && v.hold && (v.tx !== v.hold.x || v.ty !== v.hold.y)) { // holding loop corner
    const hst = order && findStation(state, order.stationId);
    const ab = state.map.tiles[v.hold.y * state.map.width + v.hold.x].building;
    const free = ftaGroundFor(v, ab) ? ftaCanLand(state, v, hst)
      : ftaHeliFor(v, ab) ? heliAnyFree(state, v, hst) : airSlotFree(state, v, hst, ab);
    if (hst && ab && free) { delete v.hold; replan(ctx, v); return; }
    holdFlyLeg(state, v, v.hold.x, v.hold.y);
    return;
  }
  if (v.kind === 'aircraft' && order && b && b.type === 'station' && b.stationId === order.stationId && isRunwayCentre(b) && ftaGroundFor(v, b)) {
    const st = findStation(state, order.stationId);
    if (st && ftaLand(ctx, v, st, b)) return; // landed on the runway: taxi to a terminal (or hold)
  }
  if (order && b && b.type === 'station' && b.kind === 'waypoint' && b.stationId === order.stationId && (v.kind === 'train' || v.kind === 'road')) {
    advanceOrder(v); replan(ctx, v); return; // rail / road waypoint reached: passed, no stop (cmdWaypoint.js)
  }
  if (order && b && b.type === 'station' && b.stationId === order.stationId && stopKindOk(v, b.kind)) {
    const st = findStation(state, order.stationId);
    if (st && stopMode(order) === 'via') { advanceOrder(v); replan(ctx, v); return; } // go via: reached, no stop
    if (st) {
      if (v.kind === 'aircraft') { // no free terminal (or runway busy): circle until there is one
        const ground = ftaGroundFor(v, b); // FTA terminal reached on the ground: the slot was chosen by ftaLand
        if (!ground && !airSlotFree(state, v, st, b)) { holdFlyLeg(state, v, v.tx, v.ty); return; }
        delete v.hold;
        if (!ground) airTookRunway(state, v, st);
      }
      if (v.kind === 'aircraft' && maybeCrashLanding(ctx, v, st)) return; // landing crash: vehicle removed
      arriveAtStation(ctx, v, st); return;
    }
  }
  replan(ctx, v);
}

/**
 * Put a vehicle into a depot (stopped inside; serviced: reliability restored).
 */
export function enterDepot(ctx, v, depotId) {
  const depot = findDepot(ctx.state, depotId);
  v.state = 'depot';
  v.speed = 0;
  v.goingToDepot = null;
  v.depotId = depotId;
  if (depot) { v.tx = depot.x; v.ty = depot.y; }
  v.path = [];
  v.pathIndex = 0;
  v.progress = 0;
  v.history = [{ x: v.tx, y: v.ty }];
  v.flipped = false;
  // RX2b (OpenLoco audit #2): OpenLoco never restores reliability on a depot visit (it only decays daily and is set at
  // build / model replace), so with service intervals off a depot entry must not reset reliability to baseReliability.
  if (v.serviceIntervalDays) servicePerformed(ctx.state, v);
  else v.breakdownTicks = 0;
}

/**
 * A go-to-depot order reached (OpenTTD OT_GOTO_DEPOT): a service-only order that is not due is skipped; otherwise
 * the vehicle is serviced in the depot (autoreplace/autorenew as on a service visit), refitted to the order's
 * cargo when empty, and leaves on its next order without stopping (same as a service trip).
 */
function depotOrderVisit(ctx, v, order) {
  const { state } = ctx;
  if (depotOrderNotDue(state, v, order)) { advanceOrder(v); replan(ctx, v); return; }
  const at = state.map.tiles[v.ty * state.map.width + v.tx].building;
  const depotId = at && at.depotId != null ? at.depotId : order.depotId; // the depot reached (nearest: resolved here)
  v.goingToDepot = depotId; // autorenew (keepRoute) finds the depot by goingToDepot
  const nv = autorenewVehicle(ctx, v, { serviceVisit: true });
  const cur = nv || v;
  cur.goingToDepot = null;
  if (cur.serviceIntervalDays) servicePerformed(state, cur);
  // RX2b (OpenLoco audit #2): no reliability restore without service intervals (OpenLoco has none on a depot visit).
  else cur.breakdownTicks = 0;
  // refit order: only an empty single-cargo vehicle is refitted (refit.js refitCore; the cost is charged)
  if (order.refit && cur.cargoId !== order.refit) {
    const r = refitCore(ctx, cur, order.refit);
    if (!r.ok) notify(ctx, `${cur.name} could not be refitted to ${order.refit}: ${r.error}.`, 'bad', cur.tx, cur.ty, 'advice');
  }
  cur.atStationId = null;
  delete cur.intermediate;
  advanceOrder(cur);
  if (order.halt) haltInDepot(state, cur, depotId); // stop in the depot; the next start continues with the next order
  else replan(ctx, cur);
}

/** Park a vehicle in a depot without a route (OpenTTD stop in depot); it leaves when started. */
function haltInDepot(state, v, depotId) {
  const depot = findDepot(state, depotId);
  v.state = 'depot';
  v.speed = 0;
  v.goingToDepot = null;
  v.depotId = depotId;
  if (depot) { v.tx = depot.x; v.ty = depot.y; }
  v.path = [];
  v.pathIndex = 0;
  v.progress = 0;
  v.history = [{ x: v.tx, y: v.ty }];
  v.flipped = false;
}

/**
 * Service at a depot without stopping (OpenTTD service-at-depot): reliability restored, the interval
 * restarts and the vehicle leaves again on its orders. Called when a service trip reaches the depot.
 */
export function serviceAtDepot(ctx, v) {
  // autoreplace / autorenew apply on a service visit too (the replacement continues the route)
  const nv = autorenewVehicle(ctx, v, { serviceVisit: true });
  const cur = nv || v;
  servicePerformed(ctx.state, cur);
  cur.goingToDepot = null;
  cur.atStationId = null;
  replan(ctx, cur);
}

/**
 * Send a vehicle with a due service to the nearest reachable depot of its kind (OpenTTD: the nearest depot
 * is chosen by the pathfinder, goals are all depots of the vehicle's kind). Only when breakdowns are enabled.
 * Sets goingToDepot and serviceTrip; the vehicle then resumes its orders without entering the depot.
 * Without a reachable depot the due service is postponed by one full interval.
 * @returns {boolean} true when a service trip was started
 */
export function startServiceTrip(ctx, v) {
  const { state } = ctx;
  if (getSetting(state, 'breakdowns') === 'none' || v.goingToDepot != null) return false;
  const goals = depotGoals(state, v);
  const path = goals.length ? findVehiclePath(state, v, goals) : null;
  if (!path) { v.serviceDue = false; v.lastServiceDay = dayNumber(state.date); return false; }
  const end = path[path.length - 1];
  const depot = state.depots.find((d) => d.x === end.x && d.y === end.y);
  if (!depot) return false;
  v.goingToDepot = depot.id;
  v.serviceTrip = true;
  v.serviceDue = false;
  return true;
}
