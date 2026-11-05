/**
 * Vehicle commands: buy, orders, start/stop, send to depot, sell.
 */
import { vehiclePrice } from './prices.js';
import { findDepot, findVehicle } from './state.js';
import { spend, earn } from './economy.js';
import { checkMoney } from './trackRules.js';
import { resolvePurchase, createVehicle } from './vehicles.js';
import { normaliseOrders } from './orders.js';
import { stopKindFor, depotGoals, findVehiclePath } from './routing.js';
import { replan, enterDepot } from './movement.js';

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
  if ((v.state === 'running' || v.state === 'lost') && v.goingToDepot == null) replan(ctx, v);
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
  state.vehicles = state.vehicles.filter((x) => x !== v);
  earn(state.company, v.value, 'vehicles');
  // keep the ledger byType as net expense for vehicles
  state.company.ledger.current.income -= v.value;
  state.company.ledger.current.byType.vehicles -= 2 * v.value;
  state.company.ledger.current.expenses -= v.value;
  return { ok: true, cost: -v.value };
}
