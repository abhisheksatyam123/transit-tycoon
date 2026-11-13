/**
 * Vehicle commands: buy, orders, start/stop, send to depot, sell.
 */
import { airportType, airportTypeId, vehicleFitsAirport } from './airportTypes.js';
import { vehiclePrice } from './prices.js';
import { findDepot, findVehicle } from './state.js';
import { spend, earn } from './economy.js';
import { checkMoney } from './trackRules.js';
import { resolvePurchase, createVehicle, purchasable, modelAvailable, refundValue } from './vehicles.js';
import { getSetting } from './settings.js';
import { listCapacity } from './consist.js';
import { allocId } from './state.js';
import { normaliseOrders, setOrderField, isDepotOrder, noteDepotDeparture, orderIdentity } from './orders.js';
import { isCond } from './condOrders.js';
import { stopKindFor, depotGoals, findVehiclePath, flipTrain, trainTrack, canFlipTrain } from './routing.js';
import { RAIL_TYPES } from '../config/railTypes.js';

/** Track type of a rail depot: its own tile's trk (set when built onto monorail/maglev track). */
function depotTrack(state, depot) {
  return state.map.tiles[depot.y * state.map.width + depot.x].trk | 0;
}
import { replan, enterDepot, serviceAtDepot, turnAround } from './movement.js';
import { syncSharers, joinSharedOrders, leaveOrderGroup } from './sharedOrders.js';
import { resetUnbunch, unbunchDepart } from './unbunch.js';
import { applyServiceInterval, MAX_SERVICE_INTERVAL } from './service.js';
import { dayNumber } from './date.js';
import { MODEL_BY_ID } from '../config/vehicles.js';
import { refitCargos, refitCore } from './refit.js';
import { DIRS, SEGMENT_SPACING } from './constants.js';
import { companyOf, ownerMismatch, companyById, stampOwner, RIVAL_OWNED } from './owner.js';
import { wagonList, setWagonList, wagonUnitPrice } from './consist.js';
import { engineList, extraEngineCount, MAX_EXTRA_ENGINES } from './consistEngines.js';
import { KMH_TO_TILES_PER_TICK } from './loco/vehicleMotion.js';
import { timetableComplete, roundTicks, orderGroupMembers, timetableEstimatesOn } from './ttSchedule.js';
import { TICKS_PER_DAY } from './constants.js';
import { vehicleLimitError, vehicleKindOfModel } from './vehicleLimit.js';
import { backupVehicleOrders, restoreVehicleOrders, clearDepotBackup } from './orderBackup.js';

/**
 * Buy a vehicle in a depot. spec = {modelId, wagonModelId?, wagons?, cargoId?}.
 * @returns {{ok:true,cost:number,vehicle:object|null}|{ok:false,error:string}}
 */
export function buyVehicle(ctx, depotId, spec, opts = {}) {
  const { state } = ctx;
  const depot = findDepot(state, depotId);
  if (!depot) return { ok: false, error: 'Unknown depot' };
  if (ownerMismatch(depot, opts)) return { ok: false, error: RIVAL_OWNED };
  if (!companyById(state, opts.owner ?? null)) return { ok: false, error: 'Unknown company' };
  if (spec && MODEL_BY_ID[spec.modelId] && !modelAvailable(state, MODEL_BY_ID[spec.modelId], opts.owner ?? null)) return { ok: false, error: 'Model not yet available' };
  if (spec && MODEL_BY_ID[spec.modelId] && MODEL_BY_ID[spec.modelId].kind === 'tram' && !depotOnTram(state, depot)) return { ok: false, error: 'Trams need a road depot next to tram track' };
  if (spec && depot.kind === 'rail') {
    // monorail / maglev trains only on their own track type (OpenTTD rail type compatibility, config/railTypes.js)
    const multi = getSetting(state, 'multiEngineConsists') === true;
    const ids = [spec.modelId, spec.wagonModelId];
    if (multi && Array.isArray(spec.engines)) ids.push(...spec.engines);
    const need = ids.map((id) => (id && MODEL_BY_ID[id] ? trainTrack({ kind: 'train', modelId: id }) : 0));
    const want = need.find((t) => t !== 0) || 0;
    if (need.some((t) => t !== 0 && t !== want)) return { ok: false, error: 'Engine and wagons need different track types' };
    // a depot on monorail/maglev track only takes trains of that type, and a monorail/maglev train only leaves from one
    const dtrk = depotTrack(state, depot);
    if (want && dtrk !== want) return { ok: false, error: `${RAIL_TYPES[want].name} trains need a ${RAIL_TYPES[want].name.toLowerCase()} depot` };
    if (!want && dtrk) return { ok: false, error: `Plain trains cannot leave a ${RAIL_TYPES[dtrk].name.toLowerCase()} depot` };
  }
  if (depot.kind === 'air' && spec && MODEL_BY_ID[spec.modelId] && !vehicleFitsAirport(MODEL_BY_ID[spec.modelId], airportTypeId(depot))) {
    return { ok: false, error: `${MODEL_BY_ID[spec.modelId].name} cannot use this ${airportType(airportTypeId(depot)).name.toLowerCase()}` };
  }
  const maxEngines = getSetting(state, 'multiEngineConsists') === true ? MAX_EXTRA_ENGINES : 0;
  if (maxEngines > 0 && spec && Array.isArray(spec.engines)) {
    for (const id of spec.engines) {
      const em = MODEL_BY_ID[id];
      if (em && em.kind === 'engine' && !modelAvailable(state, em, opts.owner ?? null)) return { ok: false, error: 'Model not yet available' };
    }
  }
  const r = resolvePurchase(depot, spec || {}, state.date.year, getSetting(state, 'neverExpireVehicles'), getSetting(state, 'maxTrainWagons'), getSetting(state, 'maxTrainLength'), maxEngines);
  if (!r.ok) return r;
  const limit = vehicleLimitError(state, vehicleKindOfModel(r.template.model), opts.owner ?? null);
  if (limit) return { ok: false, error: limit };
  r.cost = vehiclePrice(state, r.cost); // inflated; recorded as v.value so sell-back stays consistent
  const money = checkMoney(state, r.cost, companyById(state, opts.owner ?? null));
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost: r.cost, vehicle: null };
  const v = createVehicle(state, depot, r.template, r.cost);
  if (opts.owner != null) {
    stampOwner(state, v, opts.owner);
    const rival = companyById(state, opts.owner);
    if (rival) v.livery = rival.colour; // rival vehicles are drawn in the company colour (renderer reads info.livery)
  }
  spend(companyById(state, opts.owner ?? null), 'vehicles', r.cost);
  // OpenTTD CmdBuildVehicle -> OrderBackup::Restore: the player's sold-vehicle backup for this depot (player only)
  if (opts.owner == null && !opts.noRestore) restoreVehicleOrders(state, depot, v, (s) => allocId(s));
  return { ok: true, cost: r.cost, vehicle: v };
}

/**
 * Replace a vehicle's orders. Running vehicles re-route to the (new) current order.
 */
export function setOrders(ctx, id, orders, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  const r = normaliseOrders(state, v, orders, stopKindFor);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0 };
  const prev = v.orders;
  // Flag-only edits (the list is the same orders in the same order) keep the current order, like OpenTTD
  // ModifyOrder; only a genuine list replacement resets to the first order.
  const same = r.orders.length === prev.length && r.orders.every((o, i) => orderIdentity(o) === orderIdentity(prev[i]));
  v.orders = r.orders;
  // opts.keepIndex: an insertion after the current order must not send the vehicle back to order 0 (Orders > Insert)
  v.orderIndex = (same || opts.keepIndex) && v.orders.length ? Math.min(v.orderIndex, v.orders.length - 1) : 0;
  resetUnbunch(v);
  syncSharers(ctx, v, prev);
  if ((v.state === 'running' || v.state === 'lost') && v.goingToDepot == null) replan(ctx, v);
  return { ok: true, cost: 0 };
}

/**
 * Modify the load / unload flags of one order (OpenTTD ModifyOrder). `flags` may set
 * `load` ('normal'|'full'|'none'), `unload` ('normal'|'all'|'transfer'|'none') and/or `stop` ('non'|'all'|'via');
 * omitted keys keep their current value. Re-validates the whole list.
 */
export function modifyOrder(ctx, id, index, flags, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (!v.orders[index]) return { ok: false, error: 'No such order' };
  if (isDepotOrder(v.orders[index])) return { ok: false, error: 'Depot orders have no load or unload flags' };
  if (v.orders[index].cond != null) return { ok: false, error: 'Conditional orders have no load or unload flags' };
  const orders = v.orders.map((o) => ({ ...o }));
  const o = orders[index];
  const load = flags.load !== undefined ? flags.load : (o.load || (o.full ? 'full' : 'normal'));
  const unload = flags.unload !== undefined ? flags.unload : (o.unload || 'normal');
  const stop = flags.stop !== undefined ? flags.stop : (o.stop || 'non');
  orders[index] = { stationId: o.stationId, load, unload };
  if (stop !== 'non') orders[index].stop = stop;
  if (o.waitDays > 0) orders[index].waitDays = o.waitDays;
  if (o.travelDays > 0) orders[index].travelDays = o.travelDays;
  const stopLoc = flags.stopLocation !== undefined ? flags.stopLocation : (flags.stopAt !== undefined ? flags.stopAt : (o.stopLocation !== undefined ? o.stopLocation : o.stopAt));
  if (stopLoc !== undefined) {
    if (stopLoc !== 'near') orders[index].stopLocation = stopLoc;
    if (stopLoc !== 'far') orders[index].stopAt = stopLoc;
  }
  if (o.maxSpeed > 0) orders[index].maxSpeed = o.maxSpeed;
  const r = normaliseOrders(state, v, orders, stopKindFor);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0 };
  // unlike setOrders, keep the current order index
  v.orders = r.orders;
  resetUnbunch(v);
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
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (!v.orders.length || !Number.isInteger(index) || index < 0 || index >= v.orders.length) {
    return { ok: false, error: 'No such order' };
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (v.state === 'depot' || v.state === 'stopped') {
    v.orderIndex = index;
    return { ok: true, cost: 0 };
  }
  v.orderIndex = index;
  v.atStationId = null; delete v.intermediate;
  delete v.departTick;
  delete v.arriveTick;
  if (v.state === 'loading') {
    v.state = 'running';
    v.loadingTicks = 0;
    delete v.unloadPending; // gradual unloading of the stop is abandoned
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
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.state !== 'depot' && v.state !== 'stopped') return { ok: false, error: 'Vehicle is already running' };
  if (!v.orders.length && v.goingToDepot == null) return { ok: false, error: 'Vehicle has no orders' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (v.state === 'depot') {
    v.history = [{ x: v.tx, y: v.ty }];
    v.path = [];
    noteDepotDeparture(ctx.state, v); // timetable: a halt in the depot is not travel time
  }
  if (v.ubHold) { delete v.ubHold; unbunchDepart(ctx.state, v); } // started by hand: leave now (the hold is dropped)
  if (v.path.length && v.pathIndex < v.path.length - 1) v.state = 'running';
  else replan(ctx, v);
  return { ok: true, cost: 0, state: v.state };
}

/** Stop a vehicle where it is. */
export function stopVehicle(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.state === 'depot' || v.state === 'stopped') return { ok: false, error: 'Vehicle is already stopped' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (v.state === 'loading') { v.state = 'running'; v.atStationId = null; delete v.intermediate; v.path = []; }
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
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is already in a depot' };
  const goals = depotGoals(state, v);
  const path = goals.length ? findVehiclePath(state, v, goals) : null;
  if (!path) return { ok: false, error: 'No reachable depot' };
  const end = path[path.length - 1];
  const depot = state.depots.find((d) => d.x === end.x && d.y === end.y);
  if (opts.dryRun) return { ok: true, cost: 0, depotId: depot.id };
  v.goingToDepot = depot.id;
  delete v.serviceTrip;
  v.atStationId = null; delete v.intermediate;
  if (path.length === 1) { enterDepot(ctx, v, depot.id); return { ok: true, cost: 0, depotId: depot.id }; }
  v.state = 'running';
  replan(ctx, v);
  return { ok: true, cost: 0, depotId: depot.id };
}

/**
 * Send a vehicle for servicing (OpenTTD DEPOT_SERVICE): the nearest reachable depot of its kind, where it is
 * serviced and leaves again on its orders without stopping (a service trip, as with service intervals).
 * Vehicles already heading to a depot are refused (OpenTTD ignores them in the mass action).
 */
export function sendForService(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is already in a depot' };
  if (v.state === 'stopped') return { ok: false, error: 'Vehicle is stopped' }; // servicing must not start it
  if (v.goingToDepot != null) return { ok: false, error: 'Vehicle is already heading to a depot' };
  const goals = depotGoals(state, v);
  const path = goals.length ? findVehiclePath(state, v, goals) : null;
  if (!path) return { ok: false, error: 'No reachable depot' };
  const end = path[path.length - 1];
  const depot = state.depots.find((d) => d.x === end.x && d.y === end.y);
  if (opts.dryRun) return { ok: true, cost: 0, depotId: depot.id };
  v.goingToDepot = depot.id;
  v.serviceTrip = true;
  v.atStationId = null; delete v.intermediate;
  if (path.length === 1) { v.state = 'running'; serviceAtDepot(ctx, v); return { ok: true, cost: 0, depotId: depot.id }; }
  v.state = 'running';
  replan(ctx, v);
  return { ok: true, cost: 0, depotId: depot.id };
}

/**
 * Mass send (OpenTTD CmdMassSendVehicleToDepot): every listed vehicle that can be sent is sent to a depot,
 * either to stop in it (service=false) or for servicing (service=true). Vehicles already heading to a depot,
 * in a depot, or without a reachable depot are skipped.
 */
export function massSendToDepot(ctx, ids, service, opts = {}) {
  const list = Array.isArray(ids) ? ids : [];
  const fn = service ? sendForService : sendToDepot;
  let count = 0;
  for (const id of list) {
    const r = fn(ctx, id, { dryRun: true, owner: opts.owner });
    if (!r.ok) continue;
    count++;
    if (!opts.dryRun) fn(ctx, id, { owner: opts.owner });
  }
  if (!count) return { ok: false, error: 'No vehicles can be sent to a depot' };
  return { ok: true, cost: 0, count };
}

/**
 * Sell a vehicle that is stopped inside a depot; refunds its current value.
 */
export function sellVehicle(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.state !== 'depot') return { ok: false, error: 'Vehicle must be stopped in a depot' };
  if (opts.dryRun) return { ok: true, cost: -v.value };
  // OpenTTD CmdSellVehicle(backup_order): the depot window's single Sell keeps the orders (sell-all does not)
  if (opts.backupOrders && opts.owner == null) backupVehicleOrders(state, v);
  leaveOrderGroup(state, v);
  state.vehicles = state.vehicles.filter((x) => x !== v);
  earn(companyOf(state, v), v.value, 'vehicles');
  // keep the ledger byType as net expense for vehicles
  companyOf(state, v).ledger.current.income -= v.value;
  companyOf(state, v).ledger.current.byType.vehicles -= 2 * v.value;
  companyOf(state, v).ledger.current.expenses -= v.value;
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
  if (ownerMismatch(src, opts)) return { ok: false, error: RIVAL_OWNED };
  const depot = findDepot(state, src.depotId);
  if (!depot) return { ok: false, error: 'Vehicle has no depot to clone it in' };
  const spec = { modelId: src.modelId, wagonModelId: src.wagonModelId || undefined, wagons: src.wagons || 0, cargoId: src.cargoId || undefined };
  if (src.consist) spec.consist = src.consist.map((w) => ({ ...w })); // mixed consist: same wagons in the same order
  // multiEngineConsists: a clone keeps the lead-block engine list (lazy field, absent otherwise)
  if (src.engines && src.engines.length && getSetting(state, 'multiEngineConsists') === true) spec.engines = src.engines.slice();
  const r = buyVehicle(ctx, depot.id, spec, { dryRun: !!opts.dryRun, noRestore: true });
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
 * Copy or share another vehicle's orders onto an existing vehicle (OpenTTD CmdCloneOrder CO_COPY / CO_SHARE).
 * Both vehicles must be the player's, of the same vehicle type (rail / road of the same road kind / air / ship),
 * differ, and the source must have orders the target can use (validated like setOrders).
 * copy: the target leaves its shared group and gets its own deep copy of the orders (index reset to 0).
 * (The service interval is not copied: OpenTTD copy orders only touches the order list.)
 * share: the target joins the source's shared order list.
 * @returns {{ok:true,cost:number}|{ok:false,error:string}}
 */
export function copyOrders(ctx, targetId, sourceId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, targetId);
  const src = findVehicle(state, sourceId);
  if (!v || !src) return { ok: false, error: 'Unknown vehicle' };
  if (v === src) return { ok: false, error: 'Pick a different vehicle' };
  if (ownerMismatch(v, opts) || ownerMismatch(src, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== src.kind || (v.roadType || null) !== (src.roadType || null)) return { ok: false, error: 'Vehicles of different types cannot share orders' };
  if (!src.orders || !src.orders.length) return { ok: false, error: 'That vehicle has no orders' };
  const r = normaliseOrders(state, v, src.orders.map((o) => ({ ...o })), stopKindFor);
  if (!r.ok) return r;
  if (opts.dryRun) return { ok: true, cost: 0 };
  leaveOrderGroup(state, v);
  resetUnbunch(v);
  if (opts.share) {
    joinSharedOrders(state, v, src, (s) => allocId(s));
    v.orders = src.orders.map((o) => ({ ...o }));
    v.orderIndex = v.orders.length ? v.orderIndex % v.orders.length : 0;
  } else {
    v.orders = r.orders;
    v.orderIndex = 0;
  }
  if ((v.state === 'running' || v.state === 'lost') && v.goingToDepot == null) replan(ctx, v);
  return { ok: true, cost: 0 };
}

/**
 * Set the timetable of one order: `waitDays` (minimum days held at the station) and `travelDays`
 * (scheduled days from the previous stop). 0 or absent clears the field. Shared orders: all members.
 */
export function setOrderTimetable(ctx, id, index, times = {}, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (!v.orders[index]) return { ok: false, error: 'No such order' };
  // G7: conditional orders carry no timetable times. OpenTTD refuses a travel time on them
  // (CmdChangeTimetable MTF_TRAVEL_TIME); TT has no conditional-wait storage, so refuse edits rather
  // than keeping a partial wait that later normalisation would silently drop.
  if (isCond(v.orders[index]) && (times.travelDays !== undefined || times.waitDays !== undefined)) {
    return { ok: false, error: 'Conditional orders cannot have a timetable time' };
  }
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

/** Max speed limit of an order in km/h (OpenTTD order max speed): 1..1000; 0/null clears. */
export const MAX_ORDER_SPEED_KMH = 1000;

/**
 * Change or clear the timetable times and speed limit of one order, or of every order (`index` = 'all'), like
 * OpenTTD's timetable window (Change time / Clear time / Change speed / Clear speed; Ctrl = all orders).
 * `patch` may hold waitDays / travelDays (days 0-365) and maxSpeed (km/h 1-1000); a key that is undefined is
 * left alone, 0 or null clears it. Shared orders: all members.
 */
export function changeOrderTimes(ctx, id, index, patch = {}, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  const idxs = index === 'all' ? v.orders.map((_, i) => i) : [index];
  if (!idxs.length || idxs.some((i) => !v.orders[i])) return { ok: false, error: 'No such order' };
  const clean = {};
  for (const k of ['waitDays', 'travelDays']) {
    if (patch[k] === undefined) continue;
    const n = patch[k] === null ? 0 : Math.round(Number(patch[k]));
    if (!Number.isFinite(n) || n < 0 || n > 365) return { ok: false, error: `${k} must be 0-365 days` };
    clean[k] = n;
  }
  if (patch.maxSpeed !== undefined) {
    const n = patch.maxSpeed === null ? 0 : Math.round(Number(patch.maxSpeed));
    if (!Number.isFinite(n) || n < 0 || (n > 0 && n > MAX_ORDER_SPEED_KMH)) return { ok: false, error: `speed limit must be 1-${MAX_ORDER_SPEED_KMH} km/h` };
    clean.maxSpeed = n;
  }
  if (!Object.keys(clean).length) return { ok: false, error: 'Nothing to change' };
  // G8: aircraft cannot carry an order speed limit (OpenTTD CmdChangeTimetable refuses MTF_TRAVEL_SPEED)
  if (clean.maxSpeed !== undefined && v.kind === 'aircraft') return { ok: false, error: 'Aircraft cannot have an order speed limit' };
  // G7/G8: conditional orders carry no timetable times or speed limit (OpenTTD refuses travel/speed;
  // TT does not store conditional waits, so refuse them too rather than keep a partial value).
  if (index !== 'all' && isCond(v.orders[index])) {
    return { ok: false, error: 'Conditional orders cannot have timetable times or a speed limit' };
  }
  // Ctrl = all orders: apply only to the orders that can carry the change (conditionals are skipped)
  const apply = index === 'all' ? idxs.filter((i) => !isCond(v.orders[i])) : idxs;
  if (!apply.length) return { ok: false, error: 'No order can take that change' };
  if (opts.dryRun) return { ok: true, cost: 0, count: apply.length };
  for (const i of apply) setOrderField(state, v, i, clean);
  return { ok: true, cost: 0, count: apply.length };
}

/** Turn autofill of the timetable on or off for one vehicle (on = one round of orders is recorded). */
export function setTimetableAutofill(ctx, id, on, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (on && v.orders.length) {
    v.autofill = true; v.autofillLeft = v.orders.length;
    // G4 (timetableEstimates only): Ctrl-autofill keeps an existing wait unless the measured one is longer
    if (opts.preserveWait && timetableEstimatesOn(state)) v.autofillPreserve = true;
    else delete v.autofillPreserve;
  } else { delete v.autofill; delete v.autofillLeft; delete v.autofillPreserve; }
  return { ok: true, cost: 0 };
}

/**
 * Timetable start date (OpenTTD CmdSetTimetableStart): absolute tick, or null to clear. Before it the vehicle
 * waits at its first timetabled stop.
 */
export function setTimetableStart(ctx, id, startTick, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (startTick != null && (!Number.isFinite(Number(startTick)) || Number(startTick) < 0)) return { ok: false, error: 'Bad start date' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  if (startTick == null) delete v.ttStart;
  else v.ttStart = Math.round(Number(startTick));
  delete v.ttStarted; // a (re)set start date seeds the lateness counter on the next first arrival
  return { ok: true, cost: 0 };
}

/**
 * Spread the start dates of all vehicles sharing this order list evenly over the timetable round
 * (OpenTTD Ctrl+click on the start date). Needs a complete timetable (every order has travel days).
 */
export function spreadTimetableStart(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (!timetableComplete(v)) return { ok: false, error: 'Timetable incomplete: every non-conditional order needs a travel time before spreading' };
  const T = roundTicks(v.orders);
  const mem = orderGroupMembers(state, v);
  if (opts.dryRun) return { ok: true, cost: 0, count: mem.length };
  mem.forEach((w, k) => { w.ttStart = state.tick + Math.round(k * T / mem.length); });
  return { ok: true, cost: 0, count: mem.length, spacingDays: T / mem.length / TICKS_PER_DAY };
}

/** Clear the recorded lateness of a vehicle (OpenTTD reset lateness). */
export function resetLateness(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  const members = opts.applyToGroup ? orderGroupMembers(ctx.state, v) : [v];
  if (opts.dryRun) return { ok: true, cost: 0, count: members.length };
  // delete is idempotent: members whose timetable hasn't started (no lateDays/lateTicks recorded) stay as-is.
  members.forEach((w) => { delete w.lateDays; delete w.lateTicks; delete w.ttStarted; });
  return { ok: true, cost: 0, count: members.length };
}

/** Make a vehicle's order list independent again (keeps the orders it has now). */
export function unshareOrders(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
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
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
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
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains can be reversed' };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is in a depot' };
  if (v.state === 'loading') return { ok: false, error: 'Wait until the train has finished loading' };
  if (!canFlipTrain(ctx.state, v)) {
    return { ok: false, error: getSetting(ctx.state, 'trainFlipReverse') === 'none' ? 'Trains cannot reverse (difficulty setting)' : 'Trains can only reverse at the end of a line' };
  }
  if (opts.dryRun) return { ok: true, cost: 0 };
  flipTrain(v);
  v.speed = 0;
  v.path = [];
  v.pathIndex = 0;
  v.progress = 0;
  if (v.state === 'running' || v.state === 'lost') replan(ctx, v);
  return { ok: true, cost: 0, state: v.state };
}

/** Tiles a forced train may move before the force lapses if it has not reached the signal (OpenTTD TFP timeout). */
const FORCE_PROCEED_TILES = 64;
/** Path tiles searched ahead for the signal to pass (OpenTTD forces the next signal only). */
const FORCE_SEARCH_TILES = 64;

/**
 * Force a train to pass the next signal without waiting for it to clear (OpenTTD CmdForceTrainProceed,
 * "Ignore signal"). The train ignores exactly the next signal (block or path signal) on its planned route; the
 * flag (v.forceProceed, lazy) is removed once the train has left that tile or after a timeout. The same-tile
 * occupancy rule still applies: the train never enters a tile another vehicle occupies. Refused for
 * non-trains, stopped, loading, broken or depot vehicles, and when no signal lies ahead on the route.
 */
export function forceTrainProceed(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains can ignore a signal' };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is in a depot' };
  if (v.state === 'stopped') return { ok: false, error: 'Vehicle is stopped' };
  if (v.state === 'loading') return { ok: false, error: 'Wait until the train has finished loading' };
  if (v.state !== 'running' && v.state !== 'signal') return { ok: false, error: 'Vehicle cannot proceed' };
  const k = nextSignalKey(state, v);
  if (k < 0) return { ok: false, error: 'No signal ahead on the route' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  v.forceProceed = { k, left: FORCE_PROCEED_TILES };
  return { ok: true, cost: 0, state: v.state, tile: k };
}

/** Tile key of the first signal on v's planned route from its current tile on (a train held on a signal counts), or -1. */
function nextSignalKey(state, v) {
  const W = state.map.width;
  const p = v.path || [];
  const end = Math.min(p.length, v.pathIndex + FORCE_SEARCH_TILES);
  for (let i = v.pathIndex; i < end; i++) {
    const k = p[i].y * W + p[i].x;
    const t = state.map.tiles[k];
    if (t && t.signal) return k;
  }
  return -1;
}

/**
 * Turn a running road vehicle (bus, truck or tram) around (OpenTTD CmdTurnRoadVeh, "Turn around"). It backs
 * onto the tile it came from and re-plans to its current order (movement.js turnAround, the same mechanics as a
 * blocked vehicle turning). Refused like OpenTTD: stopped, broken down, loading, in a depot, on a one-way road,
 * inside a road stop or depot, on a bridge or tunnel, or with no road behind it yet.
 */
export function turnRoadVehicle(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== 'road') return { ok: false, error: 'Only road vehicles can turn around' };
  if (v.state === 'depot') return { ok: false, error: 'Vehicle is in a depot' };
  if (v.state === 'stopped') return { ok: false, error: 'Vehicle is stopped' };
  if (v.state === 'loading') return { ok: false, error: 'Wait until the vehicle has finished loading' };
  if (v.state === 'broken') return { ok: false, error: 'Vehicle is broken down' };
  if (v.state !== 'running') return { ok: false, error: 'Vehicle is lost' };
  if (v.overtakeId !== undefined) return { ok: false, error: 'Vehicle is overtaking' };
  const map = ctx.state.map;
  const t = map.tiles[v.ty * map.width + v.tx];
  if (!t) return { ok: false, error: 'Vehicle is off the map' };
  if (t.oneWay) return { ok: false, error: 'Cannot turn around on a one-way road' };
  if (t.building && (t.building.type === 'station' || t.building.type === 'depot')) return { ok: false, error: 'Cannot turn around in a road stop or depot' };
  if (t.playerTunnel || t.playerBridge || t.tunnel || t.bridgeDeck !== undefined) return { ok: false, error: 'Cannot turn around on a bridge or in a tunnel' };
  if (!v.history || !v.history[1]) return { ok: false, error: 'No road behind the vehicle to turn into' };
  if (opts.dryRun) return { ok: true, cost: 0 };
  turnAround(ctx, v);
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

export { refitCargos, REFIT_COST_FRACTION } from './refit.js';

/**
 * Refit a vehicle stopped in a depot to another cargo its model supports (OpenTTD refit, simplified).
 * Only when the vehicle is in a depot; empty unless the opt-in `partialRefit` setting is on
 * (rules in refit.js refitCore).
 * @returns {{ok:true,cost:number,cargoId:string,capacity:number}|{ok:false,error:string}}
 */
export function refitVehicle(ctx, id, cargoId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.state !== 'depot') return { ok: false, error: 'Vehicle must be stopped in a depot to refit' };
  // partialRefit (default off): OpenTTD allows refitting a loaded vehicle in a depot. The depot ORDER path
  // (movement.js depotOrderVisit) reads the same setting.
  const partial = getSetting(state, 'partialRefit') === true;
  return refitCore(ctx, v, cargoId, partial ? { ...opts, partial } : opts);
}

/**
 * Wagon model a train's consist uses: its current wagon model, or (for a train with no wagons yet) the
 * wagon carrying its cargo, else the default coach. Null when none is available in `year`.
 */
function consistWagonFor(v, year, neverExpire = false) {
  let wagon = v.wagonModelId ? MODEL_BY_ID[v.wagonModelId] : null;
  if (!wagon && v.cargoId) wagon = Object.values(MODEL_BY_ID).find((m) => m.kind === 'wagon' && m.cargos.includes(v.cargoId));
  if (!wagon) wagon = MODEL_BY_ID.wag_coach;
  if (!wagon || wagon.kind !== 'wagon' || wagon.introYear > year || !purchasable(wagon, year, neverExpire)) return null;
  return wagon;
}

/**
 * Shared checks for changing a train's consist (add / remove wagons): a train, stopped in a depot,
 * empty, with a valid wagon model. Returns {ok, v, wagon, unit} where unit is the inflated price per wagon.
 */
function consistCheck(ctx, id, n, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains have wagons' };
  if (v.state !== 'depot') return { ok: false, error: 'Train must be stopped in a depot to change its wagons' };
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: 'Wagon count must be a positive whole number' };
  if ((v.load ? v.load.amount || 0 : 0) > 0) return { ok: false, error: 'Unload the train before changing its wagons' };
  const wagon = consistWagonFor(v, state.date.year, getSetting(state, 'neverExpireVehicles'));
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
  if (v.consist) {
    const list = wagonList(v);
    if (delta > 0) for (let i = 0; i < k; i++) list.push({ modelId: wagon.id, cargoId: wagon.cargos[0] });
    else list.splice(list.length - k, k);
    setWagonList(state, v, list);
    if (delta > 0) v.value = (v.value || 0) + refundValue(unit) * k; // OL CreateVehicle.cpp:163-165 per car (7/8)
    return k;
  }
  v.wagonModelId = wagon.id;
  v.cargoId = v.cargoId || wagon.cargos[0];
  v.wagons += delta;
  v.capacity = wagon.capacity * v.wagons;
  v.runningCost = (v.runningCost || 0) + delta * wagon.running;
  if (delta > 0) v.value = (v.value || 0) + refundValue(unit) * k; // OL CreateVehicle.cpp:163-165 per car (7/8)
  return k;
}

/**
 * Buy n more wagons for a train stopped in a depot (OpenTTD-style consist edit, simplified to one wagon
 * model per train). Price per wagon = the purchase price of its wagon model, inflated (vehiclePrice).
 * Limit: total wagons <= maxTrainWagons setting (default MAX_WAGONS). The train must be empty and its cargo carried by the wagon model.
 * @returns {{ok:true,cost:number,wagons:number,capacity:number}|{ok:false,error:string}}
 */
export function addWagons(ctx, id, n, opts = {}) {
  const { state } = ctx;
  const c = consistCheck(ctx, id, n, opts);
  if (!c.ok) return c;
  const { v, wagon, unit } = c;
  const maxWagons = getSetting(state, 'maxTrainWagons');
  if (v.wagons + n > maxWagons) return { ok: false, error: `A train can have at most ${maxWagons} wagons` };
  if (((v.wagons + n + 1 + extraEngineCount(v)) * SEGMENT_SPACING) > getSetting(state, 'maxTrainLength') + 1e-9) return { ok: false, error: 'Train is too long' };
  if (v.cargoId && !wagon.cargos.includes(v.cargoId)) return { ok: false, error: `${wagon.name} cannot carry ${v.cargoId}` };
  const cost = unit * n;
  const capacity = wagon.capacity * (v.wagons + n);
  const money = checkMoney(state, cost);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost, wagons: v.wagons + n, capacity };
  spend(companyOf(state, v), 'vehicles', cost);
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
  const c = consistCheck(ctx, id, n, opts);
  if (!c.ok) return c;
  const { v, wagon, unit } = c;
  if (n > v.wagons) return { ok: false, error: `Only ${v.wagons} wagon(s) to remove` };
  // refund = the removed wagons' share of the train's current (depreciated) value: a new train refunds the
  // purchase price, an old one less (OpenTTD sells parts at their depreciated value)
  const engine = MODEL_BY_ID[v.modelId];
  const fullPrice = (engine ? vehiclePrice(state, engine.cost) : 0) + (v.consist ? consistPrice(state, v) : unit * v.wagons);
  const refund = fullPrice > 0 ? Math.min(v.value || 0, Math.round(((v.value || 0) * unit * n) / fullPrice)) : 0;
  if (opts.dryRun) return { ok: true, cost: refund, wagons: v.wagons - n, capacity: wagon.capacity * (v.wagons - n) };
  earn(companyOf(state, v), refund, 'vehicles');
  applyWagonDelta(state, v, wagon, -n, unit);
  v.value = (v.value || 0) - refund;
  return { ok: true, cost: refund, wagons: v.wagons, capacity: v.capacity };
}

/** Recompute a train's maxSpeed from its engine list (min speed, OpenTTD train_cmd.cpp:194-199). */
function refreshTrainMaxSpeed(v) {
  const lead = MODEL_BY_ID[v.modelId];
  let kmh = lead && lead.speed > 0 ? lead.speed : 0;
  for (const id of engineList(v)) {
    const m = MODEL_BY_ID[id];
    if (m && m.speed > 0 && (!kmh || m.speed < kmh)) kmh = m.speed;
  }
  if (kmh > 0) v.maxSpeed = kmh * KMH_TO_TILES_PER_TICK;
}

/**
 * Shared checks for changing the lead-block engine list (multiEngineConsists): a train, stopped in a depot,
 * empty, player-owned. Extra engines are capped at MAX_EXTRA_ENGINES so a consist has at most four engines.
 */
function engineConsistCheck(ctx, id, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains have engines' };
  if (getSetting(state, 'multiEngineConsists') !== true) return { ok: false, error: 'Multiple engines per train is turned off' };
  if (v.state !== 'depot') return { ok: false, error: 'Train must be stopped in a depot to change its engines' };
  if ((v.load ? v.load.amount || 0 : 0) > 0) return { ok: false, error: 'Unload the train before changing its engines' };
  return { ok: true, v };
}

/**
 * Attach one singlehead engine behind the lead engine of a train stopped empty in a depot (multiEngineConsists).
 * The new engine must be a purchasable locomotive of the same track type. Price = inflated model cost.
 * @returns {{ok:true,cost:number,engines:number}|{ok:false,error:string}}
 */
export function addEngine(ctx, id, modelId, opts = {}) {
  const { state } = ctx;
  const c = engineConsistCheck(ctx, id, opts);
  if (!c.ok) return c;
  const { v } = c;
  const model = MODEL_BY_ID[modelId];
  if (!model || model.kind !== 'engine') return { ok: false, error: 'Unknown engine model' };
  if (!purchasable(model, state.date.year, getSetting(state, 'neverExpireVehicles')) || !modelAvailable(state, model, null)) {
    return { ok: false, error: `${model.name} is not available` };
  }
  const extra = extraEngineCount(v);
  if (extra + 1 > MAX_EXTRA_ENGINES) return { ok: false, error: `A train can have at most ${MAX_EXTRA_ENGINES + 1} engines` };
  if (((v.wagons || 0) + 2 + extra) * SEGMENT_SPACING > getSetting(state, 'maxTrainLength') + 1e-9) return { ok: false, error: 'Train is too long' };
  const depot = findDepot(state, v.depotId);
  if (!depot) return { ok: false, error: 'Train is not in a depot' };
  const leadTrk = trainTrack({ kind: 'train', modelId: v.modelId }) || 0;
  const trk = trainTrack({ kind: 'train', modelId: model.id }) || 0;
  const want = leadTrk || trk; // the lead engine decides the train's rail type (buyVehicle does the same)
  if (trk !== want) return { ok: false, error: 'Engine needs a different track type' };
  // Same depot rule as buyVehicle: plain engines need a plain-rail depot, monorail/maglev their own.
  if (depotTrack(state, depot) !== want) return { ok: false, error: 'Engine needs a different track type for this depot' };
  const unit = vehiclePrice(state, model.cost);
  const company = companyOf(state, v);
  const money = checkMoney(state, unit, company);
  if (money) return money;
  if (opts.dryRun) return { ok: true, cost: unit, engines: 2 + extra };
  spend(company, 'vehicles', unit);
  v.engines = v.engines ? [...v.engines, model.id] : [model.id];
  v.runningCost = (v.runningCost || 0) + model.running;
  v.value = (v.value || 0) + refundValue(unit); // OL CreateVehicle.cpp:163-165
  refreshTrainMaxSpeed(v);
  return { ok: true, cost: unit, engines: extra + 2 };
}

/**
 * Detach one extra engine from a train stopped empty in a depot (default: the last extra engine).
 * Refund = the removed engine's share of the train's current (depreciated) value, like removeWagons.
 * @returns {{ok:true,cost:number,engines:number}|{ok:false,error:string}}
 */
export function removeEngine(ctx, id, index = null, opts = {}) {
  const { state } = ctx;
  const c = engineConsistCheck(ctx, id, opts);
  if (!c.ok) return c;
  const { v } = c;
  const extra = extraEngineCount(v);
  if (!extra) return { ok: false, error: 'The train has no extra engine to remove' };
  const i = index == null ? extra - 1 : Math.floor(index);
  if (!(i >= 0 && i < extra)) return { ok: false, error: 'Unknown engine' };
  const model = MODEL_BY_ID[v.engines[i]];
  const unit = model ? vehiclePrice(state, model.cost) : 0;
  // share of current value, exactly like removeWagons: all engines + all wagons priced at today's prices
  const lead = MODEL_BY_ID[v.modelId];
  let fullPrice = lead ? vehiclePrice(state, lead.cost) : 0;
  for (const eid of v.engines) { const em = MODEL_BY_ID[eid]; if (em) fullPrice += vehiclePrice(state, em.cost); }
  if (v.consist) fullPrice += consistPrice(state, v);
  if (!v.consist && v.wagons) {
    const wm = MODEL_BY_ID[v.wagonModelId || 'wag_coach'];
    if (wm) fullPrice += vehiclePrice(state, wm.cost) * v.wagons;
  }
  const refund = fullPrice > 0 ? Math.min(v.value || 0, Math.round(((v.value || 0) * unit) / fullPrice)) : 0;
  if (opts.dryRun) return { ok: true, cost: refund, engines: extra };
  earn(companyOf(state, v), refund, 'vehicles');
  const list = v.engines.slice();
  list.splice(i, 1);
  if (list.length) v.engines = list; else delete v.engines;
  if (model) v.runningCost = (v.runningCost || 0) - model.running;
  v.value = (v.value || 0) - refund;
  refreshTrainMaxSpeed(v);
  return { ok: true, cost: refund, engines: extra };
}

/** A road depot where trams can start: its tile or the tile it opens onto carries tram track. */
function depotOnTram(state, depot) {
  const { map } = state;
  const t = map.tiles[depot.y * map.width + depot.x];
  if (t.tram) return true;
  const d = DIRS.find((q) => q.bit === depot.dir);
  const nx = depot.x + (d ? d.dx : 0), ny = depot.y + (d ? d.dy : 0);
  if (!d || nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) return false;
  return !!map.tiles[ny * map.width + nx].tram;
}

/** Inflated price of all wagons of a mixed consist (what they cost to buy). */
export function consistPrice(state, v) {
  return wagonList(v).reduce((sum, w) => sum + wagonUnitPrice(state, w.modelId), 0);
}

/** Consist check for a mixed-consist edit: a train stopped in a depot (no load requirement: cargo follows its wagon). */
function trainInDepot(ctx, id, opts = {}) {
  const v = findVehicle(ctx.state, id);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  if (v.kind !== 'train') return { ok: false, error: 'Only trains have wagons' };
  if (v.state !== 'depot') return { ok: false, error: 'Train must be stopped in a depot to change its wagons' };
  return { ok: true, v };
}

/**
 * Add one wagon of model `modelId` to the end of a train (mixed consist when it differs from the others).
 * opts.cargoId picks the cargo (default: the wagon model's first cargo). The train must be empty.
 * @returns {{ok:true,cost:number,wagons:number,capacity:number}|{ok:false,error:string}}
 */
export function addWagonModel(ctx, id, modelId, opts = {}) {
  const { state } = ctx;
  const c = trainInDepot(ctx, id, opts);
  if (!c.ok) return c;
  const { v } = c;
  const wagon = MODEL_BY_ID[modelId];
  if (!wagon || wagon.kind !== 'wagon') return { ok: false, error: 'Unknown wagon model' };
  if (wagon.introYear > state.date.year) return { ok: false, error: 'Wagon not yet available' };
  if (!purchasable(wagon, state.date.year, getSetting(state, 'neverExpireVehicles'))) return { ok: false, error: 'Wagon is obsolete' };
  const cargoId = opts.cargoId || wagon.cargos[0];
  if (!wagon.cargos.includes(cargoId)) return { ok: false, error: `${wagon.name} cannot carry ${cargoId}` };
  const list = wagonList(v);
  const maxWagons = getSetting(state, 'maxTrainWagons');
  if (list.length >= maxWagons) return { ok: false, error: `A train can have at most ${maxWagons} wagons` };
  if (((list.length + 1 + 1) * SEGMENT_SPACING) > getSetting(state, 'maxTrainLength') + 1e-9) return { ok: false, error: 'Train is too long' };
  const cost = wagonUnitPrice(state, modelId);
  const money = checkMoney(state, cost);
  if (money) return money;
  list.push({ modelId, cargoId });
  if (opts.dryRun) return { ok: true, cost, wagons: list.length, capacity: listCapacity(list) };
  spend(companyOf(state, v), 'vehicles', cost);
  setWagonList(state, v, list);
  v.value = (v.value || 0) + refundValue(cost); // OL CreateVehicle.cpp:163-165 (7/8 of the price)
  return { ok: true, cost, wagons: v.wagons, capacity: v.capacity };
}

/**
 * Sell the wagon at `index` of a train (mixed or not). Refund = its share of the train's depreciated value (as in
 * removeWagons). The train must be stopped in a depot and empty of the sold wagon's cargo.
 * @returns {{ok:true,cost:number,wagons:number,capacity:number}|{ok:false,error:string}}
 */
export function sellWagon(ctx, id, index, opts = {}) {
  const { state } = ctx;
  const c = trainInDepot(ctx, id, opts);
  if (!c.ok) return c;
  const { v } = c;
  const list = wagonList(v);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return { ok: false, error: 'No such wagon' };
  if ((v.load ? v.load.amount || 0 : 0) > 0) return { ok: false, error: 'Unload the train before changing its wagons' };
  const unit = wagonUnitPrice(state, list[index].modelId);
  const engine = MODEL_BY_ID[v.modelId];
  const fullPrice = (engine ? vehiclePrice(state, engine.cost) : 0) + consistPrice(state, v);
  const refund = fullPrice > 0 ? Math.min(v.value || 0, Math.round(((v.value || 0) * unit) / fullPrice)) : 0;
  list.splice(index, 1);
  if (opts.dryRun) return { ok: true, cost: refund, wagons: list.length, capacity: listCapacity(list) };
  earn(companyOf(state, v), refund, 'vehicles');
  setWagonList(state, v, list);
  v.value = (v.value || 0) - refund;
  return { ok: true, cost: refund, wagons: v.wagons, capacity: v.capacity };
}

/**
 * Move the wagon at `index` one place towards the engine (delta -1) or away (+1). Only the order of the wagons
 * changes; the train must be stopped in a depot.
 * @returns {{ok:true,index:number}|{ok:false,error:string}}
 */
export function moveWagon(ctx, id, index, delta, opts = {}) {
  const c = trainInDepot(ctx, id, opts);
  if (!c.ok) return c;
  const { v } = c;
  const list = wagonList(v);
  const to = index + (delta < 0 ? -1 : 1);
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return { ok: false, error: 'No such wagon' };
  if (to < 0 || to >= list.length) return { ok: false, error: 'Wagon is already at the end' };
  if (opts.dryRun) return { ok: true, index: to };
  [list[index], list[to]] = [list[to], list[index]];
  setWagonList(ctx.state, v, list);
  return { ok: true, index: to };
}

/**
 * Reorder a wagon within a train's consist (OpenTTD CMD_MoveRailVehicle, simplified to within-consist).
 * Moves the wagon at fromIndex to toIndex (0 = closest to engine). The train must be stopped in a depot.
 * Lazy: only mutates the wagon order (consist/list fields) via setWagonList; old saves with no consist are fine.
 * @returns {{ok:true,fromIndex:number,toIndex:number,wagons:number}|{ok:false,error:string}}
 */
export function reorderWagon(ctx, id, fromIndex, toIndex, opts = {}) {
  const c = trainInDepot(ctx, id, opts);
  if (!c.ok) return c;
  const { v } = c;
  const list = wagonList(v);
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= list.length) return { ok: false, error: 'No such wagon' };
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= list.length) return { ok: false, error: 'Invalid target position' };
  if (fromIndex === toIndex) return { ok: true, fromIndex, toIndex, wagons: list.length, cost: 0 };
  if (opts.dryRun) return { ok: true, fromIndex, toIndex, wagons: list.length, cost: 0 };
  const [w] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, w);
  setWagonList(ctx.state, v, list);
  return { ok: true, fromIndex, toIndex, wagons: v.wagons, cost: 0 };
}


/**
 * Clear the order backup associated with a vehicle's depot (OpenTTD ClearOrderBackup).
 * Deletes the depot's stored order backup lazily; no-op if absent. dryRun returns the
 * would-be result without mutating state.
 * @returns {{ok:true,cost:number,cleared:boolean}|{ok:false,error:string}}
 */
export function clearOrderBackup(ctx, vehicleId, opts = {}) {
  const { state } = ctx;
  const v = findVehicle(state, vehicleId);
  if (!v) return { ok: false, error: 'Unknown vehicle' };
  if (ownerMismatch(v, opts)) return { ok: false, error: RIVAL_OWNED };
  // Clear vehicle-level backup if present (lazily), and/or the depot-keyed backup
  // (state.orderBackups[depotId]) associated with this vehicle's depot. No-op if absent.
  const hadV = v.backupOrders != null;
  let did = v.depotId ?? null;
  if (did == null && v.state === 'depot') {
    const d = state.depots.find((x) => x.x === v.x && x.y === v.y);
    if (d) did = d.id;
  }
  const hadD = did != null && state.orderBackups && state.orderBackups[did] != null;
  if (!hadV && !hadD) return { ok: true, cost: 0, cleared: false };
  if (opts.dryRun) return { ok: true, cost: 0, cleared: true };
  if (hadV) delete v.backupOrders;
  if (hadD) clearDepotBackup(state, did);
  return { ok: true, cost: 0, cleared: true };
}
