/**
 * Vehicle details specs (OpenTTD VehicleDetailsWindow "weight / power / max TE" line), pure helpers.
 * Only values TT really stores or derives from its models: no invented numbers.
 *  - weight (t): vehicleMotion.totalWeight (engine + wagons + cargo); empty = same without cargo.
 *  - power (hp): model.power, engines only (road vehicles have no stored power -> null).
 *  - max tractive effort (kN): trainRealistic formula, ENGINE_TONNES * GROUND_ACCELERATION * TRACTIVE_EFFORT / 256, trains with power only.
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { totalWeight } from './loco/vehicleMotion.js';
import { wagonList } from './consist.js';
import { GROUND_ACCELERATION, TRACTIVE_EFFORT } from './loco/trainRealistic.js';
import { engineWeight } from './consistEngines.js';

/**
 * @param {any} v vehicle
 * @param {any} model engine model (MODEL_BY_ID entry)
 * @returns {{weightLoaded:number, weightEmpty:number, power:number|null, tractiveKn:number|null}}
 */
export function modelTractiveKn(model) {
  const power = model && model.power ? model.power : null;
  return power ? Math.round(engineWeight(model) * GROUND_ACCELERATION * TRACTIVE_EFFORT / 256 / 100) / 10 : null;
}

export function vehicleSpecs(v, model) {
  const cargo = v.load ? v.load.amount || 0 : 0;
  const weightLoaded = totalWeight(v);
  const weightEmpty = weightLoaded - cargo;
  const power = model && model.power ? model.power : null;
  const isTrain = v.kind === 'train';
  const tractiveKn = isTrain ? modelTractiveKn(model) : null;
  return { weightLoaded, weightEmpty, power, tractiveKn };
}

/**
 * Train consist rows: engine first, then each wagon (model name, cargo, capacity).
 * @param {any} v train vehicle
 * @returns {{name:string, cargoId:string|null, capacity:number}[]}
 */
export function consistRows(v) {
  const rows = [];
  const eng = MODEL_BY_ID[v.modelId];
  rows.push({ name: eng ? eng.name : 'Engine', cargoId: null, capacity: 0 });
  for (const w of wagonList(v)) {
    const m = MODEL_BY_ID[w.modelId];
    rows.push({ name: m ? m.name : 'Wagon', cargoId: w.cargoId || null, capacity: m ? m.capacity : 0 });
  }
  return rows;
}
