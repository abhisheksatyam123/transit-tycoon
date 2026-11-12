/**
 * Engine list of a consist (leaf module: imports only the model table, so vehicleMotion.js and
 * trainRealistic.js can use it without an import cycle; consist.js re-exports engineList).
 *
 * engineList(v) = model ids of the engines pulling a vehicle, lead engine first. Today a train has exactly
 * one engine (v.modelId); multi-engine consists (spec phase 2) will append extra ids. Non-trains have none.
 * Lists are shared, frozen arrays (no per-tick allocation in the motion hot path).
 *
 * Engine weight (tons) and multihead come from the engine model: `weight` (absent = 60, the historical
 * TT engine constant) and `multihead` (absent = singlehead). Only the defaults are used today.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';

/** Historical TT engine weight (t); used whenever an engine model has no `weight`. */
export const DEFAULT_ENGINE_WEIGHT = 60;

const NO_ENGINES = Object.freeze([]);
const SINGLE = new Map();
/**
 * Extra engines attached behind the lead engine are capped so a consist has at most 4 engines total
 * (OpenTTD has no cap; TT uses this to keep the depot editor and the motion model sane).
 * An extra engine does NOT count toward maxTrainWagons or the vehicle limit: the train's wagons are
 * unchanged and vehicleLimit.js counts consists, not engines (OpenTTD would count engines).
 */
export const MAX_EXTRA_ENGINES = 3;
/** Frozen engine-list cache for multi-engine consists, keyed by the lazy v.engines array then by lead model. */
const MULTI = new WeakMap();

/**
 * Engine model ids of a vehicle, lead first. Pure.
 * `v.engines` (spec phase 2, lazy) holds the extra engine ids behind the lead engine; it is absent for every
 * train bought with the multiEngineConsists setting off, so the single-engine path is unchanged.
 */
export function engineList(v) {
  if (!v || v.kind !== 'train') return NO_ENGINES;
  const extra = v.engines;
  if (extra && extra.length) {
    let byModel = MULTI.get(extra);
    if (!byModel) { byModel = new Map(); MULTI.set(extra, byModel); }
    let list = byModel.get(v.modelId);
    if (!list) {
      list = Object.freeze([v.modelId, ...extra]);
      byModel.set(v.modelId, list);
    }
    return list;
  }
  let list = SINGLE.get(v.modelId);
  if (!list) {
    list = Object.freeze([v.modelId]);
    SINGLE.set(v.modelId, list);
  }
  return list;
}

/**
 * Vehicles in the running consist (engines + wagons). Extra engines are only present when the setting is on,
 * so every caller is unchanged for ordinary single-engine trains. Non-trains count as one vehicle.
 */
export function consistUnits(v) {
  if (!v) return 0;
  if (v.kind !== 'train') return 1;
  return engineList(v).length + (v.wagons || 0);
}

/**
 * Number of extra engines behind the lead engine. Reads v.engines only when it is present, so default-off
 * code never touches the lazy field.
 */
export function extraEngineCount(v) {
  return v && v.kind === 'train' && v.engines ? v.engines.length : 0;
}

/** Weight (t) of one engine model; absent `weight` = DEFAULT_ENGINE_WEIGHT. */
export function engineWeight(model) {
  return model && model.weight != null ? model.weight : DEFAULT_ENGINE_WEIGHT;
}

/** Weight (t) of one engine by model id (unknown ids = default weight). */
export function engineWeightById(modelId) {
  return engineWeight(MODEL_BY_ID[modelId]);
}

/** True when the engine model is multihead (absent = singlehead). */
export function isMultihead(model) {
  return !!(model && model.multihead);
}
