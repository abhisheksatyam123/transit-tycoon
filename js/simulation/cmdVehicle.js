/**
 * Vehicle commands: buy, orders, start/stop, send to depot, sell.
 */
import { vehiclePrice } from './prices.js';
import { findDepot, findVehicle } from './state.js';
import { spend, earn } from './economy.js';
import { checkMoney } from './trackRules.js';
import { resolvePurchase, createVehicle } from './vehicles.js';
import { allocId } from './state.js';
import { normaliseOrders } from './orders.js';
import { stopKindFor, depotGoals, findVehiclePath, flipTrain } from './routing.js';
import { replan, enterDepot } from './movement.js';
import { syncSharers, joinSharedOrders, leaveOrderGroup } from './sharedOrders.js';
import { applyServiceInterval, MAX_SERVICE_INTERVAL } from './service.js';
import { dayNumber } from './date.js';

/**
 * Buy a vehicle in a depot. spec = {modelId, wagonModelId?, wagons?, cargoId?}.
 * @returns {{ok:true,cost:number,vehicle:object|null}|{ok:false,error:string}}
 */
export function buyVehicle(ctx, depotId, spec, opts = {}) {
  const { state } = ctx;
  const depot = findDepot(state, depotId);
  if (!depot) return { ok: false, error: 'Unknown depot' };
  const r = resolvePurchase(depot, spec || {}, state.date.year);
  if (!r.ok) return r;
  r.cost = vehiclePrice(state, r.cost); // inflated; recorded as v.value so sell-back stays consistent
  const money = checkMoney(state, r.cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost: r.cost, vehicle: null };
  const v = createVehicle(state, depot, r.template, r.cost);
  spend(state.company, 'vehicles', r.cost);
  return { ok: true, cost: r.cost, vehicle: v };
}

/**
 * Replace a vehicle's orders. Running vehicles re-route to the (new) current order.
 */
export function setOrders(ctx, id, orders, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  const r = normaliseOrders(state, v, orders, stopKindFor);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0 };
  v.orders = r.orders;
  v.orderIndex = 0;
  syncSharers(ctx, v);
  if ((v.state === 'running' || v.state === 'lost') && v.goingToDepot == null) replan(ctx, v);
  return { ok: true, cost: 0 };
}

/**
 * Modify the load / unload flags of one order (OpenTTD ModifyOrder). `flags` may set
 * `load` ('normal'|'full'|'none') and/or `unload` ('normal'|'all'|'transfer'|'none');
 * omitted keys keep their current value. Re-validates the whole list.
 */
export function modifyOrder(ctx, id, index, flags, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (!v.orders[index]) return { ok: false, error: 'No such order' };
  const orders = v.orders.map((o) => ({ ...o }));
  const o = orders[index];
  const load = flags.load !== undefined ? flags.load : (o.load || (o.full ? 'full' : 'normal'));
  const unload = flags.unload !== undefined ? flags.unload : (o.unload || 'normal');
  orders[index] = { stationId: o.stationId, load, unload };
  const r = normaliseOrders(state, v, orders, stopKindFor);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0 };
  // unlike setOrders, keep the current order index
  v.orders = r.orders;
  syncSharers(ctx, v);
  if ((v.state === 'running' || v.state === 'lost') && v.goingToDepot == null) replan(ctx, v);
  return { ok: true, cost: 0 };
}

/**
 * Skip the vehicle to another order (OpenTTD skip). A loaded or loading vehicle leaves its
 * station without finishing the current order; the cargo stays aboard.
 */
export function skipToOrder(ctx, id, index, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (!v.orders.length || !Number.isInteger(index) || index < 0 || index >= v.orders.length) {
    return { ok: false, error: 'No such order' };
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (v.state === 'depot' || v.state === 'stopped') {
    v.orderIndex = index;
    return { ok: true, cost: 0 };
  }
  v.orderIndex = index;
  v.atStationId = null;
  if (v.state === 'loading') {
    v.state = 'running';
    v.loadingTicks = 0;
    replan(ctx, v);
  } else if ((v.state === 'running' || v.state === 'lost') && v.goingToDepot == null) {
    replan(ctx, v);
  }
  return { ok: true, cost: 0 };
}

/**
 * Start a vehicle (leave depot / resume). Requires orders unless heading to a depot.
 */
export function startVehicle(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.state !== 'depot' && v.state !== 'stopped') return { ok: false, error: 'Vehicle is already running' };
  if (!v.orders.length && v.goingToDepot == null) return { ok: false, error: 'Vehicle has no orders' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (v.state === 'depot') {
    v.history = [{ x: v.tx, y: v.ty }];
    v.path = [];
  }
  if (v.path.length && v.pathIndex < v.path.length - 1) v.state = 'running';
  else replan(ctx, v);
  return { ok: true, cost: 0, state: v.state };
}

/** Stop a vehicle where it is. */
export function stopVehicle(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.state === 'depot' || v.state === 'stopped') return { ok: false, error: 'Vehicle is already stopped' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (v.state === 'loading') { v.state = 'running'; v.atStationId = null; v.path = []; }
  v.state = 'stopped';
  v.speed = 0;
  return { ok: true, cost: 0 };
}

/**
 * Send a vehicle to the nearest reachable depot of its kind (it stops inside).
 */
export function sendToDepot(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is already in a depot' };
  const goals = depotGoals(state, v);
  const path = goals.length ? findVehiclePath(state, v, goals) : null;
  if (!path) return { ok: false, error: 'No reachable depot' };
  const end = path[path.length - 1];
  const depot = state.depots.find((d) => d.x === end.x && d.y === end.y);
  if (opts.dryRun) return { ok: true, cost: 0, depotId: depot.id };
  v.goingToDepot = depot.id;
  delete v.serviceTrip;
  v.atStationId = null;
  if (path.length === 1) { enterDepot(ctx, v, depot.id); return { ok: true, cost: 0, depotId: depot.id }; }
  v.state = 'running';
  replan(ctx, v);
  return { ok: true, cost: 0, depotId: depot.id };
}

/**
 * Sell a vehicle that is stopped inside a depot; refunds its current value.
 */
export function sellVehicle(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.state !== 'depot') return { ok: false, error: 'Vehicle must be stopped in a depot' };
  if (opts.dryRun) return { ok: true, cost: -v.value };
  leaveOrderGroup(state, v);
  state.vehicles = state.vehicles.filter((x) => x !== v);
  earn(state.company, v.value, 'vehicles');
  // keep the ledger byType as net expense for vehicles
  state.company.ledger.current.income -= v.value;
  state.company.ledger.current.byType.vehicles -= 2 * v.value;
  state.company.ledger.current.expenses -= v.value;
  return { ok: true, cost: -v.value };
}

/**
 * Clone a vehicle (OpenLoco CloneVehicle): buys a vehicle of the same model / wagons / cargo in the
 * source's depot, at the normal price, and copies its orders. The copy also inherits the service interval.
 * shareOrders: the copy joins the source's shared order list (created when the source had none).
 * @returns {{ok:true,cost:number,vehicle:object|null}|{ok:false,error:string}}
 */
export function cloneVehicle(ctx, id, opts = {}) {
  const { state } = ctx;
  const src = findVehicle(state, id);
  if (!src) return { ok: false, error: 'Unknown vehicle' };
  const depot = findDepot(state, src.depotId);
  if (!depot) return { ok: false, error: 'Vehicle has no depot to clone it in' };
  const spec = { modelId: src.modelId, wagonModelId: src.wagonModelId || undefined, wagons: src.wagons || 0, cargoId: src.cargoId || undefined };
  const r = buyVehicle(ctx, depot.id, spec, { dryRun: !!opts.dryRun });
  if (!r.ok || opts.dryRun) return r;
  const v = r.vehicle;
  v.orders = src.orders.map((o) => ({ ...o }));
  v.orderIndex = 0;
  applyServiceInterval(state, v, src.serviceIntervalDays || 0);
  if (opts.shareOrders) joinSharedOrders(state, v, src, (s) => allocId(s));
  return { ok: true, cost: r.cost, vehicle: v };
}

/** Make a vehicle's order list independent again (keeps the orders it has now). */
export function unshareOrders(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.orderGroup == null) return { ok: false, error: 'Orders are not shared' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  leaveOrderGroup(state, v);
  return { ok: true, cost: 0 };
}

/** Set the service interval in days (0 = off). Stored only when non-zero (save compatible). */
export function setServiceInterval(ctx, id, days, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  const n = Math.round(Number(days));
  if (!Number.isFinite(n) || n < 0 || n > MAX_SERVICE_INTERVAL) return { ok: false, error: `Interval must be 0..${MAX_SERVICE_INTERVAL} days` };
  if (opts.dryRun) return { ok: true, cost: 0 };
  applyServiceInterval(state, v, n);
  if (n && v.lastServiceDay == null) v.lastServiceDay = dayNumber(state.date);
  return { ok: true, cost: 0 };
}

/**
 * Reverse a train (OpenTTD CMD_REVERSE_TRAIN_DIRECTION): the consist turns end for end at its
 * current position (flipTrain uses the recorded track history, so the rear becomes the head on
 * the same rails), then a running/lost train re-plans to its current order or depot.
 * The planner only turns the train back again if the new route runs into its own body.
 * Stopped trains keep their stop; they leave in the new direction when started.
 */
export function reverseVehicle(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains can be reversed' };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is in a depot' };
  if (v.state === 'loading') return { ok: false, error: 'Wait until the train has finished loading' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  flipTrain(v);
  v.speed = 0;
  v.path = [];
  v.pathIndex = 0;
  v.progress = 0;
  if (v.state === 'running' || v.state === 'lost') replan(ctx, v);
  return { ok: true, cost: 0, state: v.state };
}

/**
 * Start or stop many vehicles at once (OpenTTD CMD_MASS_START_STOP / OpenLoco mass start-stop).
 * ids: vehicle ids (e.g. the vehicles in one depot or the current vehicle-list filter).
 * Vehicles already in the wanted state, or that cannot change state, are skipped.
 * @returns {{ok:true,cost:number,count:number}|{ok:false,error:string}}
 */
export function massStartStop(ctx, ids, start, opts = {}) {
  const list = Array.isArray(ids) ? ids : [];
  let count = 0;
  for (const id of list) {
    const v = findVehicle(ctx.state, id);
    if (!v) continue;
    const fn = start ? startVehicle : stopVehicle;
    const r = fn(ctx, id, { dryRun: true });
    if (!r.ok) continue;
    count++;
    if (!opts.dryRun) fn(ctx, id);
  }
  if (!count) return { ok: false, error: start ? 'No vehicles to start' : 'No vehicles to stop' };
  return { ok: true, cost: 0, count };
}
