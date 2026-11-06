/**
 * Vehicle commands: buy, orders, start/stop, send to depot, sell.
 */
import { vehiclePrice } from './prices.js';
import { findDepot, findVehicle } from './state.js';
import { spend, earn } from './economy.js';
import { checkMoney } from './trackRules.js';
import { resolvePurchase, createVehicle, purchasable, modelAvailable } from './vehicles.js';
import { MAX_WAGONS } from './constants.js';
import { allocId } from './state.js';
import { normaliseOrders, setOrderField } from './orders.js';
import { stopKindFor, depotGoals, findVehiclePath, flipTrain } from './routing.js';
import { replan, enterDepot } from './movement.js';
import { syncSharers, joinSharedOrders, leaveOrderGroup } from './sharedOrders.js';
import { applyServiceInterval, MAX_SERVICE_INTERVAL } from './service.js';
import { dayNumber } from './date.js';
import { MODEL_BY_ID } from '../config/vehicles.js';

/**
 * Buy a vehicle in a depot. spec = {modelId, wagonModelId?, wagons?, cargoId?}.
 * @returns {{ok:true,cost:number,vehicle:object|null}|{ok:false,error:string}}
 */
export function buyVehicle(ctx, depotId, spec, opts = {}) {
  const { state } = ctx;
  const depot = findDepot(state, depotId);
  if (!depot) return { ok: false, error: 'Unknown depot' };
  if (spec && MODEL_BY_ID[spec.modelId] && !modelAvailable(state, MODEL_BY_ID[spec.modelId])) return { ok: false, error: 'Model not yet available' };
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
  if (o.waitDays > 0) orders[index].waitDays = o.waitDays;
  if (o.travelDays > 0) orders[index].travelDays = o.travelDays;
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
  delete v.departTick;
  delete v.arriveTick;
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
  if (src.groupId != null) v.groupId = src.groupId; // clones join the source's vehicle group
  if (opts.shareOrders) joinSharedOrders(state, v, src, (s) => allocId(s));
  return { ok: true, cost: r.cost, vehicle: v };
}

/**
 * Set the timetable of one order: `waitDays` (minimum days held at the station) and `travelDays`
 * (scheduled days from the previous stop). 0 or absent clears the field. Shared orders: all members.
 */
export function setOrderTimetable(ctx, id, index, times = {}, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (!v.orders[index]) return { ok: false, error: 'No such order' };
  const patch = {};
  for (const k of ['waitDays', 'travelDays']) {
    if (times[k] === undefined) continue;
    const n = Math.round(Number(times[k]));
    if (!Number.isFinite(n) || n < 0 || n > 365) return { ok: false, error: `${k} must be 0-365 days` };
    patch[k] = n;
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  setOrderField(state, v, index, patch);
  return { ok: true, cost: 0 };
}

/** Turn autofill of the timetable on or off for one vehicle (on = one round of orders is recorded). */
export function setTimetableAutofill(ctx, id, on, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (on && v.orders.length) { v.autofill = true; v.autofillLeft = v.orders.length; }
  else { delete v.autofill; delete v.autofillLeft; }
  return { ok: true, cost: 0 };
}

/** Clear the recorded lateness of a vehicle (OpenTTD reset lateness). */
export function resetLateness(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  delete v.lateDays;
  return { ok: true, cost: 0 };
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

/** Refit cost factor: share of the model's (inflated) purchase price, per refit (OpenTTD charges a % of value). */
export const REFIT_COST_FRACTION = 0.1;

/**
 * Cargo a vehicle may be refitted to: a road vehicle / aircraft model's `cargos`, or a train's wagon model's
 * `cargos` (all wagons of a train carry one cargo). Null when the vehicle has no cargo model.
 */
export function refitCargos(v) {
  const m = MODEL_BY_ID[v.modelId];
  if (!m) return null;
  if (m.kind === 'engine') {
    const w = v.wagonModelId ? MODEL_BY_ID[v.wagonModelId] : null;
    return w ? w.cargos : [];
  }
  return m.cargos || [];
}

/**
 * Refit a vehicle stopped in a depot to another cargo its model supports (OpenTTD refit, simplified).
 * Only when the vehicle is in a depot and empty; capacity follows the wagons (trains) or the model.
 * Costs REFIT_COST_FRACTION of the model's inflated purchase price (times wagons for trains, plus the engine).
 * @returns {{ok:true,cost:number,cargoId:string,capacity:number}|{ok:false,error:string}}
 */
export function refitVehicle(ctx, id, cargoId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.state !== 'depot') return { ok: false, error: 'Vehicle must be stopped in a depot to refit' };
  const model = MODEL_BY_ID[v.modelId];
  const supported = refitCargos(v);
  if (!model || !supported) return { ok: false, error: 'Vehicle cannot be refitted' };
  if (!supported.length) return { ok: false, error: 'Vehicle has no cargo to refit' };
  if (!supported.includes(cargoId)) return { ok: false, error: `Cannot carry ${cargoId}` };
  if (cargoId === v.cargoId) return { ok: false, error: 'Vehicle already carries that cargo' };
  if ((v.load ? v.load.amount || 0 : 0) > 0) return { ok: false, error: 'Unload the vehicle before refitting' };
  let capacity = v.capacity;
  let base = model.cost;
  if (model.kind === 'engine') {
    const w = MODEL_BY_ID[v.wagonModelId];
    capacity = w.capacity * (v.wagons || 0);
    base += w.cost * (v.wagons || 0);
  }
  const cost = vehiclePrice(state, Math.round(base * REFIT_COST_FRACTION));
  if (opts.dryRun) return { ok: true, cost, cargoId, capacity };
  const money = checkMoney(state, cost);
  if (money) return money;
  spend(state.company, 'vehicles', cost);
  v.cargoId = cargoId;
  v.capacity = capacity;
  return { ok: true, cost, cargoId, capacity };
}

/**
 * Wagon model a train's consist uses: its current wagon model, or (for a train with no wagons yet) the
 * wagon carrying its cargo, else the default coach. Null when none is available in `year`.
 */
function consistWagonFor(v, year) {
  let wagon = v.wagonModelId ? MODEL_BY_ID[v.wagonModelId] : null;
  if (!wagon && v.cargoId) wagon = Object.values(MODEL_BY_ID).find((m) => m.kind === 'wagon' && m.cargos.includes(v.cargoId));
  if (!wagon) wagon = MODEL_BY_ID.wag_coach;
  if (!wagon || wagon.kind !== 'wagon' || wagon.introYear > year || !purchasable(wagon, year)) return null;
  return wagon;
}

/**
 * Shared checks for changing a train's consist (add / remove wagons): a train, stopped in a depot,
 * empty, with a valid wagon model. Returns {ok, v, wagon, unit} where unit is the inflated price per wagon.
 */
function consistCheck(ctx, id, n) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains have wagons' };
  if (v.state !== 'depot') return { ok: false, error: 'Train must be stopped in a depot to change its wagons' };
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Wagon count must be a positive whole number' };
  if ((v.load ? v.load.amount || 0 : 0) > 0) return { ok: false, error: 'Unload the train before changing its wagons' };
  const wagon = consistWagonFor(v, state.date.year);
  if (!wagon) return { ok: false, error: 'No wagon model available' };
  return { ok: true, v, wagon, unit: vehiclePrice(state, wagon.cost) };
}

/**
 * Apply a wagon-count change to a train (both directions share the same bookkeeping).
 * `delta` > 0 adds wagons; < 0 removes them. Capacity, running cost, value and cargo follow the wagons.
 * History needs no edit here: the train's history grows as it moves (historyNeeded uses v.wagons).
 */
function applyWagonDelta(state, v, wagon, delta, unit) {
  const k = Math.abs(delta);
  v.wagonModelId = wagon.id;
  v.cargoId = v.cargoId || wagon.cargos[0];
  v.wagons += delta;
  v.capacity = wagon.capacity * v.wagons;
  v.runningCost = (v.runningCost || 0) + delta * wagon.running;
  if (delta > 0) v.value = (v.value || 0) + unit * k;
  return k;
}

/**
 * Buy n more wagons for a train stopped in a depot (OpenTTD-style consist edit, simplified to one wagon
 * model per train). Price per wagon = the purchase price of its wagon model, inflated (vehiclePrice).
 * Limit: total wagons <= MAX_WAGONS. The train must be empty and its cargo carried by the wagon model.
 * @returns {{ok:true,cost:number,wagons:number,capacity:number}|{ok:false,error:string}}
 */
export function addWagons(ctx, id, n, opts = {}) {
  const { state } = ctx;
  const c = consistCheck(ctx, id, n);
  if (!c.ok) return c;
  const { v, wagon, unit } = c;
  if (v.wagons + n > MAX_WAGONS) return { ok: false, error: `A train can have at most ${MAX_WAGONS} wagons` };
  if (v.cargoId && !wagon.cargos.includes(v.cargoId)) return { ok: false, error: `${wagon.name} cannot carry ${v.cargoId}` };
  const cost = unit * n;
  const capacity = wagon.capacity * (v.wagons + n);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, wagons: v.wagons + n, capacity };
  spend(state.company, 'vehicles', cost);
  applyWagonDelta(state, v, wagon, n, unit);
  return { ok: true, cost, wagons: v.wagons, capacity: v.capacity };
}

/**
 * Sell n wagons from a train stopped in a depot. Refund = the inflated per-wagon price (what addWagons
 * charges), capped at the train's value; v.value is reduced by the same amount. Minimum 0 wagons
 * (an engine may run alone, as resolvePurchase allows). The train must be empty.
 * @returns {{ok:true,cost:number,wagons:number,capacity:number}|{ok:false,error:string}}
 */
export function removeWagons(ctx, id, n, opts = {}) {
  const { state } = ctx;
  const c = consistCheck(ctx, id, n);
  if (!c.ok) return c;
  const { v, wagon, unit } = c;
  if (n > v.wagons) return { ok: false, error: `Only ${v.wagons} wagon(s) to remove` };
  // refund = the removed wagons' share of the train's current (depreciated) value: a new train refunds the
  // purchase price, an old one less (OpenTTD sells parts at their depreciated value)
  const engine = MODEL_BY_ID[v.modelId];
  const fullPrice = (engine ? vehiclePrice(state, engine.cost) : 0) + unit * v.wagons;
  const refund = fullPrice > 0 ? Math.min(v.value || 0, Math.round(((v.value || 0) * unit * n) / fullPrice)) : 0;
  if (opts.dryRun) return { ok: true, cost: refund, wagons: v.wagons - n, capacity: wagon.capacity * (v.wagons - n) };
  earn(state.company, refund, 'vehicles');
  applyWagonDelta(state, v, wagon, -n, unit);
  v.value = (v.value || 0) - refund;
  return { ok: true, cost: refund, wagons: v.wagons, capacity: v.capacity };
}
