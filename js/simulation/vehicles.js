/**
 * Vehicle creation and visual segments (locomotive + trailing wagons).
 */
import { MODEL_BY_ID, ALL_VEHICLE_MODELS } from '../config/vehicles.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { getSetting } from './settings.js';
import { isTropic, isToyland } from './climate.js';
import { KMH_TO_TILES_PER_TICK, AIR_KMH_TO_TILES_PER_TICK } from './loco/vehicleMotion.js';
import { SEGMENT_SPACING, MAX_WAGONS, dirBetween } from './constants.js';
import { allocId } from './state.js';
import { defaultServiceFields } from './service.js';
import { previewBlocks } from './enginePreview.js';
import { articParts, partOffsets, partFills, articSpan } from './articulated.js';
import { holdDrawPos } from './airportHold.js';
import { isHelicopter } from './airportTypes.js';

/**
 * Whether a model can be bought in `year` (OpenLoco era rule): introduced (introYear <= year) and not yet
 * obsolete (obsoleteYear > year, when the model declares one). Existing vehicles are never affected.
 */
export function purchasable(model, year, neverExpire = false) {
  return !!model && model.introYear <= year && (neverExpire || !(model.obsoleteYear <= year));
}

/** TY5: temperate kinds with OpenTTD toyland equivalents (buses, steam/diesel locos); wagons keep their cargo coverage. */
const TOYLAND_REPLACED_KINDS = new Set(['bus', 'engine']);

/**
 * T29: opt-in models (config EXTRA_VEHICLE_MODELS, optIn) are offered only when a valuables source exists
 * (a bank on the map, or the extraIndustries setting). Default games never see them.
 */
export function modelAvailable(state, model, ownerId = null) {
  if (previewBlocks(state, model, ownerId)) return false; // engine preview (enginePreview setting): exclusive to another company
  // TY5: temperate buses and steam/diesel locos are hidden in toyland games once a toyland model of the same kind is
  // purchasable (OpenTTD toyland engines); until then they stay the buyable fallback
  if (model && !model.optIn && isToyland(state) && TOYLAND_REPLACED_KINDS.has(model.kind) && state.date
    && ALL_VEHICLE_MODELS.some((m) => m.optIn === 'toyland' && m.kind === model.kind && purchasable(m, state.date.year, getSetting(state, 'neverExpireVehicles')))) return false;
  if (!model || !model.optIn) return true;
  if (model.optIn === 'articulated') return !!state && getSetting(state, 'articulatedRV') === true; // articulated road vehicles
  if (model.optIn === 'electric') return !!state && hasElectrifiedTrack(state);
  if (model.optIn === 'mono' || model.optIn === 'maglev') return !!state && hasTrackType(state, model.railType); // monorail / maglev trains
  if (model.optIn === 'tram') return !!state && hasTramTrack(state);
  if (model.optIn === 'tropic') return isTropic(state); // TP sub-tropical water tankers
  if (model.optIn === 'toyland') return isToyland(state); // TY2 toyland trucks, TY5 toyland buses/locos
  if (model.optIn === 'extraIndustries') return !!state && getSetting(state, 'extraIndustries') === true; // T-IN chain vehicles
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

/** True when at least one tile carries the given track type (tile.trk, config/railTypes.js). Lazy scan. */
export function hasTrackType(state, trk) {
  const tiles = state.map && state.map.tiles;
  if (!tiles || !trk) return false;
  for (let i = 0; i < tiles.length; i++) if (tiles[i].trk === trk) return true;
  return false;
}

/** Display prefix per vehicle class. */
function classOf(model) {
  return model.kind === 'engine' ? 'Train' : model.kind === 'bus' ? 'Bus' : model.kind === 'aircraft' ? 'Aircraft' : model.kind === 'ship' ? 'Ship' : model.kind === 'tram' ? 'Tram' : 'Truck';
}

/**
 * Resolve and validate a purchase spec into a vehicle template (no state mutation).
 * @param {object} depot depot record
 * @param {{modelId:string,wagonModelId?:string,wagons?:number,cargoId?:string}} spec
 * @param {number} year current year
 * @returns {{ok:true,cost:number,template:object}|{ok:false,error:string}}
 */
export function resolvePurchase(depot, spec, year, neverExpire = false, maxWagons = MAX_WAGONS, maxTrainLength = null) {
  const model = MODEL_BY_ID[spec && spec.modelId];
  if (!model || model.kind === 'wagon') return { ok: false, error: 'Unknown vehicle model' };
  if (model.introYear > year) return { ok: false, error: 'Model not yet available' };
  if (!purchasable(model, year, neverExpire)) return { ok: false, error: 'Model is obsolete' };
  const isTrain = model.kind === 'engine';
  const depotFor = isTrain ? 'rail' : model.kind === 'aircraft' ? 'air' : model.kind === 'ship' ? 'ship' : 'road';
  // trams are bought in road depots (depotFor 'road'); the depot must touch tram track (checked in cmdVehicle)
  if (depot.kind !== depotFor) return { ok: false, error: 'Wrong depot type for this vehicle' };
  let cost = model.cost, running = model.running, capacity = model.capacity, cargoId = null;
  let wagonModelId = null, wagons = 0;
  if (isTrain) {
    if (Array.isArray(spec.consist) && spec.consist.length) return resolveMixed(model, spec.consist, year, cost, running, neverExpire, maxWagons, maxTrainLength);
    wagons = spec.wagons === undefined ? 3 : Math.floor(spec.wagons);
    if (!(wagons >= 0 && wagons <= maxWagons)) return { ok: false, error: `Wagons must be 0..${maxWagons}` };
    if (maxTrainLength != null && ((wagons + 1) * SEGMENT_SPACING) > maxTrainLength + 1e-9) return { ok: false, error: 'Train is too long' };
    if (wagons > 0) {
      let wagon = spec.wagonModelId ? MODEL_BY_ID[spec.wagonModelId] : null;
      if (!wagon && spec.cargoId) wagon = Object.values(MODEL_BY_ID).find((m) => m.kind === 'wagon' && m.cargos.includes(spec.cargoId));
      if (!wagon && !spec.wagonModelId) wagon = MODEL_BY_ID.wag_coach;
      if (!wagon || wagon.kind !== 'wagon') return { ok: false, error: 'Unknown wagon model' };
      if (wagon.introYear > year) return { ok: false, error: 'Wagon not yet available' };
      if (!purchasable(wagon, year, neverExpire)) return { ok: false, error: 'Wagon is obsolete' };
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
 * Mixed consist (spec.consist = [{modelId, cargoId?}] per wagon, engine excluded): every wagon is checked like a
 * single-model purchase; the template carries the list so createVehicle can set v.consist.
 */
function resolveMixed(model, list, year, cost, running, neverExpire = false, maxWagons = MAX_WAGONS, maxTrainLength = null) {
  const consist = [];
  for (const w of list) {
    const wagon = MODEL_BY_ID[w && w.modelId];
    if (!wagon || wagon.kind !== 'wagon') return { ok: false, error: 'Unknown wagon model' };
    if (wagon.introYear > year) return { ok: false, error: 'Wagon not yet available' };
    if (!purchasable(wagon, year, neverExpire)) return { ok: false, error: 'Wagon is obsolete' };
    const cargoId = (w.cargoId) || wagon.cargos[0];
    if (!wagon.cargos.includes(cargoId)) return { ok: false, error: `${wagon.name} cannot carry ${cargoId}` };
    consist.push({ modelId: wagon.id, cargoId });
    cost += wagon.cost;
    running += wagon.running;
  }
  if (consist.length > maxWagons) return { ok: false, error: `Wagons must be 0..${maxWagons}` };
  if (maxTrainLength != null && ((consist.length + 1) * SEGMENT_SPACING) > maxTrainLength + 1e-9) return { ok: false, error: 'Train is too long' };
  const capacity = consist.reduce((s, w) => s + MODEL_BY_ID[w.modelId].capacity, 0);
  const uniform = consist.every((w) => w.modelId === consist[0].modelId && w.cargoId === consist[0].cargoId);
  const first = consist[0] || {};
  return { ok: true, cost, template: { model, wagonModelId: first.modelId || null, wagons: consist.length, cargoId: first.cargoId || null,
    capacity, running, consist: uniform ? null : consist } };
}

/**
 * OpenLoco GameCommands/Vehicles/CreateVehicle.cpp:163-165: a purchase's sell-back value (refundCost) is
 * cost - cost/8 (7/8 of the price, integer division). Used for new vehicles and wagons added to a train.
 */
export function refundValue(cost) {
  return cost - Math.floor(cost / 8);
}

/**
 * OpenLoco CreateVehicle.cpp:149-158 (first bogie): a model designed within the last two years starts with
 * reduced reliability. OL: reliability = objReliability*256; if designed+2 > currentYear, reduce by 1/8
 * twice (the original bug applies both reductions in every case); then +255 when nonzero. Our models have
 * no separate design year, so introYear stands in for `designed`. Computed in OL's 16-bit units (percent*256),
 * then mapped back to the 0..1 fraction. Only the purchase copy is reduced; baseReliability is unchanged.
 */
export function newVehicleReliability(model, year) {
  let r16 = Math.round((model.reliability || 0) * 25600);
  if (model.introYear != null && model.introYear + 2 > year) {
    r16 -= Math.floor(r16 / 8);
    r16 -= Math.floor(r16 / 8);
  }
  if (r16 !== 0) r16 += 255;
  return r16 / 25600;
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
    reliability: newVehicleReliability(model, state.date.year), baseReliability: model.reliability, breakdownTicks: 0,
    profitThisYear: 0, profitLastYear: 0, value: refundValue(cost), loadingTicks: 0,
    runningCost: template.running, lostSince: null, retryTick: 0,
    ...(model.kind === 'aircraft' ? { alt: 0 } : {}),
    ...defaultServiceFields(state), // service interval (setting default; absent when off)
  };
  if (template.consist) { v.consist = template.consist.map((w) => ({ ...w })); } // mixed consist (resolveMixed)
  state.vehicles.push(v);
  return v;
}

/**
 * OpenTTD vehicle.extend_vehicle_life: effective maximum age (days) for a vehicle or model.
 * Base is `maxAge` in days (vehicles carry it; models may carry years in `maxAge`).
 * Falls back to 20 years as OpenTTD default when absent. Adds setting (years 0..30).
 */
export function effectiveMaxAge(state, model) {
  const raw = model ? (model.maxAge ?? 20) : 20;
  const baseDays = raw < 100 ? raw * 365 : raw;
  return baseDays + Number(getSetting(state, 'extendVehicleLife') || 0) * 365;
}

/** Is a vehicle past its effective maximum age? */
export function isVehicleOld(state, v) {
  return (v.age || 0) > effectiveMaxAge(state, v);
}

/** Model record of a vehicle. */
export function vehicleModel(v) {
  return MODEL_BY_ID[v.modelId];
}

/** Speed of a vehicle in km/h (for display and ratings). */
export function speedKmh(v) {
  return Math.round(v.speed / (v.kind === 'aircraft' ? AIR_KMH_TO_TILES_PER_TICK : KMH_TO_TILES_PER_TICK));
}

/**
 * OpenTTD holding ring position of a holding plane (display only): the sim holds on its square loop of corners
 * (airportFsa.js holdFlyLeg); the drawn head follows the OTTD AirportMovingData holding nodes instead. The leg is
 * the plane's progress from the previous corner to its target corner. Null for helicopters or unknown types.
 */
function holdDrawPosFor(v) {
  const h = v.hold;
  if (!h || !h.t || isHelicopter(v)) return null;
  // sim corner order (airportFsa.js CORNERS): N, E, S, W. The target is the corner picked last (h.i - 1).
  const target = ((h.i - 1) % 4 + 4) % 4, from = (target + 3) % 4;
  const n = Math.max(1, v.path.length - 1);
  const f = ((v.pathIndex || 0) + (v.progress || 0)) / n; // progress along the current leg (tiles)
  return holdDrawPos(h.t, h.x, h.y, from, target, f);
}

/** Number of tiles of history a vehicle needs for its trailing segments. */
export function historyNeeded(v) {
  if (v.kind === 'train') return Math.ceil(v.wagons * SEGMENT_SPACING) + 3;
  const span = articSpan(v); // articulated road vehicle: followers need the path behind the head
  return span ? Math.ceil(span) + 3 : 3;
}

/**
 * Visual segments with float tile coordinates (integer coords = tile centre).
 * Front segment first. Vehicles inside a depot return [].
 * @returns {{x:number,y:number,dir:number,part:string,cargoId:string|null,loaded:boolean,fill:number}[]}
 */
export function getVehicleSegments(v) {
  if (v.state === 'depot') return [];
  const ap = articParts(v);
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
  if (ap) return articSegments(v, ap, pts, headDir);
  const parts = [];
  if (v.kind === 'train') {
    parts.push('loco');
    for (let i = 0; i < v.wagons; i++) parts.push('wagon');
    if (v.flipped) parts.reverse();
  } else if (v.kind === 'aircraft') parts.push('aircraft');
  else if (v.kind === 'ship') parts.push('ship');
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
  if (v.kind === 'aircraft' && v.hold && out.length) { // holding plane: drawn on the OTTD holding ring (display only)
    const hp = holdDrawPosFor(v);
    if (hp) { out[0].x = hp.x; out[0].y = hp.y; }
  }
  return out;
}

/** Segments of an articulated road vehicle: one per part, head first, each at its offset along the path. */
function articSegments(v, ap, pts, headDir) {
  const off = partOffsets(ap);
  const fills = partFills(ap, v.load.amount);
  const kind = v.roadType === 'bus' || v.roadType === 'tram' ? 'bus' : 'truck';
  const out = [];
  for (let k = 0; k < ap.length; k++) {
    const pos = pointAlong(pts, off[k]);
    const dir = pos.dir || headDir || 2;
    out.push({ x: pos.x, y: pos.y, dir, part: kind, cargoId: v.cargoId, loaded: fills[k] > 0, fill: fills[k] });
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
