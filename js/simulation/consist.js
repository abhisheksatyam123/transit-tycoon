/**
 * Train consists (OpenTTD consist editor, simplified). A train has one engine and `v.wagons` wagons.
 * Plain trains (all wagons the same model and cargo) keep only the single-model fields (wagonModelId, cargoId,
 * capacity). A mixed train (e.g. 3 coal hoppers + 2 coaches) also has `v.consist`: one {modelId, cargoId} per
 * wagon, in running order from the engine. Its load is kept per cargo in `v.loads[cargoId]` (see orders.js).
 * `v.consist` is deleted again as soon as the consist is uniform, so plain trains and old saves are unchanged.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { vehiclePrice } from './prices.js';
import { getSetting } from './settings.js';
import { KMH_TO_TILES_PER_TICK } from './loco/vehicleMotion.js';
import { engineList } from './consistEngines.js';

export { engineList };

/** Wagon list of a train: [{modelId, cargoId}] per wagon (uniform trains derive it from the single-model fields). */
export function wagonList(v) {
  if (v.consist) return v.consist.map((w) => ({ modelId: w.modelId, cargoId: w.cargoId }));
  if (!v.wagons) return [];
  const modelId = v.wagonModelId || (MODEL_BY_ID.wag_coach && MODEL_BY_ID.wag_coach.id);
  return Array.from({ length: v.wagons }, () => ({ modelId, cargoId: v.cargoId }));
}

/**
 * Effective speed cap of a train in tiles/tick, including its wagons.
 * OpenTTD vehicle.wagon_speed_limits / train_cmd.cpp ConsistChanged: the train is limited by the slowest
 * part; a wagon speed of 0 (or absent) means no limit. Setting off (default) returns v.maxSpeed untouched.
 * Pure: reads the models and the setting only, so add/remove/reorder/autoreplace need no cache invalidation.
 */
export function consistMaxSpeedTiles(state, v) {
  if (!v || v.kind !== 'train') return v ? v.maxSpeed : 0;
  // Extra engines (multiEngineConsists): the consist never runs faster than its slowest engine, even when the
  // wagon-speed limit setting is off (OpenTTD train_cmd.cpp:194-199 skips wagons, never engines).
  let cap = Infinity;
  if (v.engines && v.engines.length) {
    for (const id of engineList(v)) {
      const m = MODEL_BY_ID[id];
      const s = m && m.speed;
      if (s > 0 && s < cap) cap = s;
    }
  }
  if (getSetting(state, 'wagonSpeedLimits') !== true) {
    if (cap === Infinity) return v.maxSpeed;
    const tiles = cap * KMH_TO_TILES_PER_TICK;
    return tiles < v.maxSpeed ? tiles : v.maxSpeed;
  }
  if (v.consist && v.consist.length) {
    for (const w of v.consist) {
      const m = MODEL_BY_ID[w.modelId];
      const s = m && m.speed;
      if (s > 0 && s < cap) cap = s;
    }
  } else if (v.wagons > 0) {
    // Same fallback as wagonList: a plain train without a wagon model is a coach train.
    const id = v.wagonModelId || (MODEL_BY_ID.wag_coach && MODEL_BY_ID.wag_coach.id);
    const m = MODEL_BY_ID[id];
    const s = m && m.speed;
    if (s > 0) cap = s;
  }
  if (cap === Infinity) return v.maxSpeed;
  const tiles = cap * KMH_TO_TILES_PER_TICK;
  return tiles < v.maxSpeed ? tiles : v.maxSpeed;
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
