/**
 * Per-tick vehicle state machine: movement along paths, arrival, loading, lost handling.
 * Collisions and signals are not simulated (vehicles may overlap).
 */
import { TICKS_PER_DAY } from './constants.js';
import { ACCEL_TICKS } from '../config/vehicles.js';
import { connected } from './network.js';
import { findStation, findDepot } from './state.js';
import { historyNeeded } from './vehicles.js';
import { layerOf, stopKindFor, orderGoals, depotGoals, planRoute } from './routing.js';
import { altitudeAt } from './aircraft.js';
import { currentOrder, advanceOrder, arriveAtStation, loadingTick } from './orders.js';
import { notify } from './news.js';

/** Ticks between path retries for lost vehicles. */
export const LOST_RETRY_TICKS = 2 * TICKS_PER_DAY;

/**
 * Advance one vehicle by one tick.
 * @param {{state:object, emit:Function}} ctx
 * @param {object} v vehicle
 */
export function vehicleTick(ctx, v) {
  if (v.kind === 'aircraft' && v.state !== 'running' && v.state !== 'broken') v.alt = 0;
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
        advanceOrder(v);
        v.atStationId = null;
        v.state = 'running';
        replan(ctx, v);
      }
      return;
    case 'running':
      move(ctx, v);
      if (v.kind === 'aircraft') v.alt = altitudeAt(v);
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
  if (v.goingToDepot !== null && v.goingToDepot !== undefined) {
    goals = depotGoals(state, v, v.goingToDepot);
    if (!goals.length) { v.goingToDepot = null; return replan(ctx, v); }
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
    notify(ctx, `${v.name} is lost: no route to ${v.goingToDepot != null ? 'depot' : st ? st.name : 'destination'}.`, 'bad', v.tx, v.ty);
  }
  v.speed = 0;
  v.path = [{ x: v.tx, y: v.ty }];
  v.pathIndex = 0;
  v.progress = 0;
  v.retryTick = state.tick + LOST_RETRY_TICKS;
  return false;
}

/** Move a running vehicle along its path. */
function move(ctx, v) {
  const { state } = ctx;
  if (!v.path.length || v.pathIndex >= v.path.length - 1) { onPathEnd(ctx, v); return; }
  const layer = layerOf(v);
  if (v.progress === 0 && !linkOk(state, layer, v)) { v.progress = 0; replan(ctx, v); return; }
  const accel = v.maxSpeed / ACCEL_TICKS[v.kind];
  v.speed = Math.min(v.maxSpeed, v.speed + accel);
  v.progress += v.speed;
  const keep = historyNeeded(v);
  while (v.progress >= 1) {
    v.progress -= 1;
    v.pathIndex++;
    const p = v.path[v.pathIndex];
    v.tx = p.x; v.ty = p.y;
    v.history.unshift({ x: p.x, y: p.y });
    if (v.history.length > keep) v.history.length = keep;
    if (v.pathIndex >= v.path.length - 1) { v.progress = 0; onPathEnd(ctx, v); return; }
    if (!linkOk(state, layer, v)) { v.progress = 0; replan(ctx, v); return; }
  }
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
    const hangar = b && b.type === 'station' && b.part === 'hangar';
    if (b && ((b.type === 'depot' && b.depotId === v.goingToDepot) || (hangar && b.depotId === v.goingToDepot))) {
      enterDepot(ctx, v, b.depotId);
      return;
    }
    replan(ctx, v);
    return;
  }
  const order = currentOrder(v);
  if (order && b && b.type === 'station' && b.stationId === order.stationId && b.kind === stopKindFor(v)) {
    const st = findStation(state, order.stationId);
    if (st) { arriveAtStation(ctx, v, st); return; }
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
  v.reliability = v.baseReliability ?? v.reliability;
  v.breakdownTicks = 0;
}
