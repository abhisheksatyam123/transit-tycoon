/**
 * Refit rules shared by the depot refit (cmdVehicle.refitVehicle) and refit depot orders (movement.js
 * serviceAtDepot). OpenTTD refit, simplified: the vehicle must be empty and carry one cargo.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { vehiclePrice } from './prices.js';
import { spend } from './economy.js';
import { checkMoney } from './trackRules.js';
import { companyOf } from './owner.js';

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
 * Refit an empty, single-cargo vehicle to another cargo its model supports. Does not check where the vehicle
 * is (callers do: the depot refit requires a stop in a depot, a refit order runs inside the depot visit).
 * Costs REFIT_COST_FRACTION of the model's inflated purchase price (times wagons for trains, plus the engine).
 * @returns {{ok:true,cost:number,cargoId:string,capacity:number}|{ok:false,error:string}}
 */
export function refitCore(ctx, v, cargoId, opts = {}) {
  const { state } = ctx;
  const model = MODEL_BY_ID[v.modelId];
  const supported = refitCargos(v);
  if (!model || !supported) return { ok: false, error: 'Vehicle cannot be refitted' };
  if (!supported.length) return { ok: false, error: 'Vehicle has no cargo to refit' };
  if (!supported.includes(cargoId)) return { ok: false, error: `Cannot carry ${cargoId}` };
  if (cargoId === v.cargoId) return { ok: false, error: 'Vehicle already carries that cargo' };
  if (v.consist) return { ok: false, error: 'Mixed consist: wagons carry their own cargo' };
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
  spend(companyOf(state, v), 'vehicles', cost);
  v.cargoId = cargoId;
  v.capacity = capacity;
  return { ok: true, cost, cargoId, capacity };
}
