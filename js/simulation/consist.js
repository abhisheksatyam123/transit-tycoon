/**
 * Train consists (OpenTTD consist editor, simplified). A train has one engine and `v.wagons` wagons.
 * Plain trains (all wagons the same model and cargo) keep only the single-model fields (wagonModelId, cargoId,
 * capacity). A mixed train (e.g. 3 coal hoppers + 2 coaches) also has `v.consist`: one {modelId, cargoId} per
 * wagon, in running order from the engine. Its load is kept per cargo in `v.loads[cargoId]` (see orders.js).
 * `v.consist` is deleted again as soon as the consist is uniform, so plain trains and old saves are unchanged.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { vehiclePrice } from './prices.js';

/** Wagon list of a train: [{modelId, cargoId}] per wagon (uniform trains derive it from the single-model fields). */
export function wagonList(v) {
  if (v.consist) return v.consist.map((w) => ({ modelId: w.modelId, cargoId: w.cargoId }));
  if (!v.wagons) return [];
  const modelId = v.wagonModelId || (MODEL_BY_ID.wag_coach && MODEL_BY_ID.wag_coach.id);
  return Array.from({ length: v.wagons }, () => ({ modelId, cargoId: v.cargoId }));
}

/** Capacity of a wagon list (sum of the wagon models' capacities). */
export function listCapacity(list) {
  return list.reduce((s, w) => s + (MODEL_BY_ID[w.modelId] ? MODEL_BY_ID[w.modelId].capacity : 0), 0);
}

/** Set the wagon list of a train: updates wagons / capacity / cargo fields; running cost and value by delta. */
export function setWagonList(state, v, list) {
  const old = wagonList(v);
  const runOf = (l) => l.reduce((s, w) => s + (MODEL_BY_ID[w.modelId] ? MODEL_BY_ID[w.modelId].running : 0), 0);
  v.runningCost = (v.runningCost || 0) + runOf(list) - runOf(old);
  const uniform = list.every((w) => w.modelId === list[0].modelId && w.cargoId === list[0].cargoId);
  v.wagons = list.length;
  v.capacity = listCapacity(list);
  if (!list.length) {
    v.wagonModelId = null;
    delete v.consist;
    return;
  }
  v.wagonModelId = list[0].modelId;
  v.cargoId = list[0].cargoId;
  if (uniform) { delete v.consist; if (v.loads && !Object.keys(v.loads).length) delete v.loads; }
  else v.consist = list.map((w) => ({ modelId: w.modelId, cargoId: w.cargoId }));
}

/** Inflated purchase price of one wagon model (what the depot charges for it). */
export function wagonUnitPrice(state, modelId) {
  const m = MODEL_BY_ID[modelId];
  return m ? vehiclePrice(state, m.cost) : 0;
}
