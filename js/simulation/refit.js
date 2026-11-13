/**
 * Refit rules shared by the depot refit (cmdVehicle.refitVehicle) and refit depot orders (movement.js
 * depotOrderVisit). OpenTTD refit, simplified: the vehicle must be empty and carry one cargo.
 * `partialRefit` (opt-in, default off) lifts the empty-only rule for the player command and refit depot orders:
 * OpenTTD vehicle_cmd.cpp:476-477 keeps same-cargo load up to the new capacity and drops load on a cargo change.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { vehiclePrice } from './prices.js';
import { spend } from './economy.js';
import { checkMoney } from './trackRules.js';
import { companyOf } from './owner.js';
import { getSetting } from './settings.js';

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
 * Drop all cargo aboard (OpenTTD refit_cap = 0 on a cargo type change, vehicle_cmd.cpp:476-477): the cargo is
 * lost, nothing is paid for it. No money or profit field is touched.
 */
export function dropLoad(load) {
  load.amount = 0;
  load.fromStationId = null;
  delete load.feeder;
  delete load.dests;
}

/**
 * Keep at most `keep` units aboard (same-cargo refit to a smaller capacity): the excess is lost, and cargodist
 * destinations are pruned to the kept units so the packet stays consistent. The feeder share (cargo picked up
 * elsewhere) is prorated to the kept units, like cutLoad in orders.js; the excess share is lost with the cargo.
 */
export function truncateLoad(load, keep) {
  if (!load || !(load.amount > keep)) return;
  const original = load.amount;
  load.amount = keep;
  if (load.feeder) {
    const keptFeeder = Math.round((load.feeder * keep) / original);
    if (keptFeeder > 0) load.feeder = keptFeeder;
    else delete load.feeder;
  }
  if (!load.dests) return;
  let left = keep;
  for (const k of Object.keys(load.dests)) {
    const take = Math.min(load.dests[k] || 0, left);
    left -= take;
    if (take > 0) load.dests[k] = take;
    else delete load.dests[k];
  }
  if (!Object.keys(load.dests).length) delete load.dests;
}

/**
 * Refit a single-cargo vehicle to another cargo its model supports. Does not check where the vehicle
 * is (callers do: the depot refit requires a stop in a depot, a refit order runs inside the depot visit).
 * Costs REFIT_COST_FRACTION of the model's inflated purchase price (times wagons for trains, plus the engine);
 * a same-cargo refit (capacity change) is free, as OpenTTD charges a refit only on a cargo type change.
 * `opts.partial` (the `partialRefit` setting, resolved by the caller) allows a loaded vehicle: same cargo keeps
 * the load truncated to the new capacity, another cargo drops it (OpenTTD vehicle_cmd.cpp:476-477).
 * @returns {{ok:true,cost:number,cargoId:string,capacity:number}|{ok:false,error:string}}
 */
export function refitCore(ctx, v, cargoId, opts = {}) {
  const { state } = ctx;
  const model = MODEL_BY_ID[v.modelId];
  const supported = refitCargos(v);
  if (!model || !supported) return { ok: false, error: 'Vehicle cannot be refitted' };
  if (!supported.length) return { ok: false, error: 'Vehicle has no cargo to refit' };
  if (!supported.includes(cargoId)) return { ok: false, error: `Cannot carry ${cargoId}` };
  const partial = opts.partial === true;
  const sameCargo = cargoId === v.cargoId;
  if (sameCargo && !partial) return { ok: false, error: 'Vehicle already carries that cargo' };
  if (v.consist) return { ok: false, error: 'Mixed consist: wagons carry their own cargo' };
  if (!partial && (v.load ? v.load.amount || 0 : 0) > 0) return { ok: false, error: 'Unload the vehicle before refitting' };
  let capacity = v.capacity;
  let base = model.cost;
  // modelRefitCost (opt-in, default off): per-model permille of purchase price (model.refitCost, absent = 0),
  // cargo-carrying parts only (the locomotive is skipped unless it has its own refitCost). Off = flat 10%.
  const perModel = getSetting(state, 'modelRefitCost') === true;
  const part = (m) => Math.round((m.cost * (m.refitCost ?? 0)) / 1000);
  let cost;
  if (model.kind === 'engine') {
    const w = MODEL_BY_ID[v.wagonModelId];
    capacity = w.capacity * (v.wagons || 0);
    base += w.cost * (v.wagons || 0);
  }
  if (perModel) {
    let parts = part(model);
    if (model.kind === 'engine') parts += part(MODEL_BY_ID[v.wagonModelId]) * (v.wagons || 0);
    cost = sameCargo ? 0 : vehiclePrice(state, parts);
  } else {
    cost = sameCargo ? 0 : vehiclePrice(state, Math.round(base * REFIT_COST_FRACTION));
  }
  if (opts.dryRun) return { ok: true, cost, cargoId, capacity };
  const money = checkMoney(state, cost);
  if (money) return money;
  spend(companyOf(state, v), 'vehicles', cost);
  if (partial && v.load) {
    if (sameCargo) truncateLoad(v.load, capacity);
    else dropLoad(v.load);
  }
  v.cargoId = cargoId;
  v.capacity = capacity;
  return { ok: true, cost, cargoId, capacity };
}
