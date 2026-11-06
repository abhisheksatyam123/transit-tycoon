/**
 * Vehicle creation and visual segments (locomotive + trailing wagons).
 */
import { MODEL_BY_ID } from '../config/vehicles.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { getSetting } from './settings.js';
import { KMH_TO_TILES_PER_TICK, AIR_KMH_TO_TILES_PER_TICK } from './loco/vehicleMotion.js';
import { SEGMENT_SPACING, MAX_WAGONS, dirBetween } from './constants.js';
import { allocId } from './state.js';
import { defaultServiceFields } from './service.js';

/**
 * Whether a model can be bought in `year` (OpenLoco era rule): introduced (introYear <= year) and not yet
 * obsolete (obsoleteYear > year, when the model declares one). Existing vehicles are never affected.
 */
export function purchasable(model, year) {
  return !!model && model.introYear <= year && !(model.obsoleteYear <= year);
}

/**
 * T29: opt-in models (config EXTRA_VEHICLE_MODELS, optIn) are offered only when a valuables source exists
 * (a bank on the map, or the extraIndustries setting). Default games never see them.
 */
export function modelAvailable(state, model) {
  if (!model || !model.optIn) return true;
  if (model.optIn === 'electric') return !!state && hasElectrifiedTrack(state);
  if (model.optIn === 'tram') return !!state && hasTramTrack(state);
  if (getSetting(state, 'extraIndustries')) return true;
  return !!state && state.industries.some((i) => INDUSTRY_BY_ID[i.typeId] && INDUSTRY_BY_ID[i.typeId].produces.includes('VALU'));
}

/** True when at least one tile of the map carries tram track. Lazy scan; tram models need it. */
export function hasTramTrack(state) {
  const tiles = state.map && state.map.tiles;
  if (!tiles) return false;
  for (let i = 0; i < tiles.length; i++) if (tiles[i].tram) return true;
  return false;
}

/** True when at least one tile of the map is electrified (catenary). Lazy scan; electric models need it. */
export function hasElectrifiedTrack(state) {
  const tiles = state.map && state.map.tiles;
  if (!tiles) return false;
  for (let i = 0; i < tiles.length; i++) if (tiles[i].elec) return true;
  return false;
}

/** Display prefix per vehicle class. */
function classOf(model) {
  return model.kind === 'engine' ? 'Train' : model.kind === 'bus' ? 'Bus' : model.kind === 'aircraft' ? 'Aircraft' : model.kind === 'ship' ? 'Ship' : 'Truck';
}

/**
 * Resolve and validate a purchase spec into a vehicle template (no state mutation).
 * @param {object} depot depot record
 * @param {{modelId:string,wagonModelId?:string,wagons?:number,cargoId?:string}} spec
 * @param {number} year current year
 * @returns {{ok:true,cost:number,template:object}|{ok:false,error:string}}
 */
export function resolvePurchase(depot, spec, year) {
  const model = MODEL_BY_ID[spec && spec.modelId];
  if (!model || model.kind === 'wagon') return { ok: false, error: 'Unknown vehicle model' };
  if (model.introYear > year) return { ok: false, error: 'Model not yet available' };
  if (!purchasable(model, year)) return { ok: false, error: 'Model is obsolete' };
  const isTrain = model.kind === 'engine';
  const depotFor = isTrain ? 'rail' : model.kind === 'aircraft' ? 'air' : model.kind === 'ship' ? 'ship' : 'road';
  // trams are bought in road depots (depotFor 'road'); the depot must touch tram track (checked in cmdVehicle)
  if (depot.kind !== depotFor) return { ok: false, error: 'Wrong depot type for this vehicle' };
  let cost = model.cost, running = model.running, capacity = model.capacity, cargoId = null;
  let wagonModelId = null, wagons = 0;
  if (isTrain) {
    wagons = spec.wagons === undefined ? 3 : Math.floor(spec.wagons);
    if (!(wagons >= 0 && wagons <= MAX_WAGONS)) return { ok: false, error: `Wagons must be 0..${MAX_WAGONS}` };
    if (wagons > 0) {
      let wagon = spec.wagonModelId ? MODEL_BY_ID[spec.wagonModelId] : null;
      if (!wagon && spec.cargoId) wagon = Object.values(MODEL_BY_ID).find((m) => m.kind === 'wagon' && m.cargos.includes(spec.cargoId));
      if (!wagon && !spec.wagonModelId) wagon = MODEL_BY_ID.wag_coach;
      if (!wagon || wagon.kind !== 'wagon') return { ok: false, error: 'Unknown wagon model' };
      if (wagon.introYear > year) return { ok: false, error: 'Wagon not yet available' };
      if (!purchasable(wagon, year)) return { ok: false, error: 'Wagon is obsolete' };
      cargoId = spec.cargoId || wagon.cargos[0];
      if (!wagon.cargos.includes(cargoId)) return { ok: false, error: `${wagon.name} cannot carry ${cargoId}` };
      wagonModelId = wagon.id;
      cost += wagon.cost * wagons;
      running += wagon.running * wagons;
      capacity = wagon.capacity * wagons;
    }
  } else {
    cargoId = spec.cargoId || model.cargos[0];
    if (!model.cargos.includes(cargoId)) return { ok: false, error: `${model.name} cannot carry ${cargoId}` };
  }
  return { ok: true, cost, template: { model, wagonModelId, wagons, cargoId, capacity, running } };
}

/**
 * Create a vehicle in a depot from a resolved template and add it to state.
 * @returns {object} vehicle
 */
export function createVehicle(state, depot, template, cost) {
  const { model } = template;
  const prefix = classOf(model);
  const usedNums = new Set(state.vehicles.filter((v) => v.name.startsWith(prefix + ' ')).map((v) => v.unitNumber));
  let unit = 1;
  while (usedNums.has(unit)) unit++;
  const v = {
    id: allocId(state), name: `${prefix} ${unit}`, unitNumber: unit,
    kind: model.kind === 'engine' ? 'train' : model.kind === 'aircraft' ? 'aircraft' : model.kind === 'ship' ? 'ship' : 'road',
    roadType: model.kind === 'engine' || model.kind === 'aircraft' || model.kind === 'ship' ? null : model.kind, // 'tram' vehicles are kind 'road' running on the tram layer
    modelId: model.id, wagonModelId: template.wagonModelId, wagons: template.wagons,
    cargoId: template.cargoId, capacity: template.capacity,
    load: { amount: 0, sourceX: depot.x, sourceY: depot.y, sinceTick: state.tick, fromStationId: null },
    state: 'depot', tx: depot.x, ty: depot.y, path: [], pathIndex: 0, progress: 0,
    speed: 0, maxSpeed: model.speed * (model.kind === 'aircraft' ? AIR_KMH_TO_TILES_PER_TICK : KMH_TO_TILES_PER_TICK),
    history: [{ x: depot.x, y: depot.y }], flipped: false,
    orders: [], orderIndex: 0, depotId: depot.id, goingToDepot: null,
    age: 0, maxAge: (model.kind === 'engine' ? 25 : 15) * 365,
    reliability: model.reliability, baseReliability: model.reliability, breakdownTicks: 0,
    profitThisYear: 0, profitLastYear: 0, value: cost, loadingTicks: 0,
    runningCost: template.running, lostSince: null, retryTick: 0,
    ...(model.kind === 'aircraft' ? { alt: 0 } : {}),
    ...defaultServiceFields(state), // service interval (setting default; absent when off)
  };
  state.vehicles.push(v);
  return v;
}

/** Model record of a vehicle. */
export function vehicleModel(v) {
  return MODEL_BY_ID[v.modelId];
}

/** Speed of a vehicle in km/h (for display and ratings). */
export function speedKmh(v) {
  return Math.round(v.speed / (v.kind === 'aircraft' ? AIR_KMH_TO_TILES_PER_TICK : KMH_TO_TILES_PER_TICK));
}

/** Number of tiles of history a vehicle needs for its trailing segments. */
export function historyNeeded(v) {
  return v.kind === 'train' ? Math.ceil(v.wagons * SEGMENT_SPACING) + 3 : 3;
}

/**
 * Visual segments with float tile coordinates (integer coords = tile centre).
 * Front segment first. Vehicles inside a depot return [].
 * @returns {{x:number,y:number,dir:number,part:string,cargoId:string|null,loaded:boolean,fill:number}[]}
 */
export function getVehicleSegments(v) {
  if (v.state === 'depot') return [];
  const pts = [];
  const cur = v.path[v.pathIndex] || v.history[0] || { x: v.tx, y: v.ty };
  const next = v.path[v.pathIndex + 1];
  let headDir;
  if (next) {
    pts.push({ x: cur.x + (next.x - cur.x) * v.progress, y: cur.y + (next.y - cur.y) * v.progress });
    headDir = dirBetween(cur.x, cur.y, next.x, next.y);
  } else {
    pts.push({ x: cur.x, y: cur.y });
    const h1 = v.history[1];
    headDir = h1 ? dirBetween(h1.x, h1.y, cur.x, cur.y) : 0;
  }
  for (let i = next ? 0 : 1; i < v.history.length; i++) pts.push(v.history[i]);
  const parts = [];
  if (v.kind === 'train') {
    parts.push('loco');
    for (let i = 0; i < v.wagons; i++) parts.push('wagon');
    if (v.flipped) parts.reverse();
  } else if (v.kind === 'aircraft') parts.push('aircraft');
  else parts.push(v.roadType === 'bus' || v.roadType === 'tram' ? 'bus' : 'truck');
  const fill = v.capacity > 0 ? v.load.amount / v.capacity : 0;
  const perWagon = v.wagons > 0 ? v.capacity / v.wagons : v.capacity;
  const out = [];
  let wagonIndex = 0;
  for (let k = 0; k < parts.length; k++) {
    const pos = pointAlong(pts, k * SEGMENT_SPACING);
    const dir = pos.dir || headDir || 2;
    const part = parts[k];
    let loaded = false, segFill = 0;
    if (part === 'wagon') {
      segFill = Math.max(0, Math.min(1, (v.load.amount - wagonIndex * perWagon) / Math.max(1, perWagon)));
      loaded = segFill > 0;
      wagonIndex++;
    } else if (part !== 'loco') { segFill = fill; loaded = fill > 0; }
    out.push({ x: pos.x, y: pos.y, dir, part, cargoId: v.cargoId, loaded, fill: segFill, ...(v.kind === 'aircraft' ? { alt: v.alt || 0 } : {}) });
  }
  return out;
}

/** Walk `dist` along a newest-first polyline; returns point and travel direction. */
function pointAlong(pts, dist) {
  let remaining = dist;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const dir = dirBetween(Math.round(b.x), Math.round(b.y), Math.round(a.x), Math.round(a.y))
      || dirFromDelta(a.x - b.x, a.y - b.y);
    if (remaining <= len || i === pts.length - 2) {
      const t = len > 0 ? Math.min(1, remaining / len) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dir };
    }
    remaining -= len;
  }
  return { x: pts[0].x, y: pts[0].y, dir: 0 };
}

function dirFromDelta(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 2 : dx < 0 ? 8 : 0;
  return dy > 0 ? 4 : 1;
}
