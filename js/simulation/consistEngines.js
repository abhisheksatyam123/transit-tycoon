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

/** Engine model ids of a vehicle, lead first. Pure. */
export function engineList(v) {
  if (!v || v.kind !== 'train') return NO_ENGINES;
  let list = SINGLE.get(v.modelId);
  if (!list) {
    list = Object.freeze([v.modelId]);
    SINGLE.set(v.modelId, list);
  }
  return list;
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
