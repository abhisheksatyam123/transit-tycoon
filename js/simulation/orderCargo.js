/**
 * Order cargo acceptance (playtest P7): does a stop on a vehicle's orders take the cargo the vehicle carries?
 * Pure helpers shared by the Orders window (per-row warning) and diagnostics (Issues).
 * A stop that SUPPLIES a carried cargo (houses for PASS/MAIL, an industry that produces it) is a pickup stop
 * and is never flagged for that cargo.
 */
import { CARGO_BY_ID } from '../config/cargos.js';
import { INDUSTRY_BY_ID } from '../config/industries.js';
import { catchmentTiles } from './stations.js';

/** Cargo ids a vehicle carries (its main cargo plus any mixed-consist wagons), deduplicated. */
export function vehicleCargos(v) {
  const out = new Set();
  if (v && v.cargoId) out.add(v.cargoId);
  for (const w of (v && v.consist) || []) if (w && w.cargoId) out.add(w.cargoId);
  return [...out];
}

/** Cargo ids a station's catchment supplies (houses -> PASS/MAIL, producing industries). */
export function stationSupplies(state, st) {
  const out = new Set();
  if (!st) return out;
  const w = state.map.width;
  for (const p of catchmentTiles(state, st)) {
    const b = state.map.tiles[p.y * w + p.x].building;
    if (!b) continue;
    if (b.type === 'house') { out.add('PASS'); out.add('MAIL'); }
    if (b.type === 'industry') {
      const ind = (state.industries || []).find((i) => i.id === b.industryId);
      const type = ind && INDUSTRY_BY_ID[ind.typeId];
      for (const c of (type && type.produces) || []) out.add(c);
    }
  }
  return out;
}

/**
 * Carried cargos this station neither accepts nor supplies. Empty when the vehicle carries nothing
 * or the station serves at least one carried cargo.
 * @returns {string[]} cargo ids
 */
export function unservedCargos(state, v, st) {
  const carried = vehicleCargos(v);
  if (!carried.length || !st) return [];
  const sup = stationSupplies(state, st);
  return carried.filter((c) => !(st.accepts && st.accepts[c]) && !sup.has(c));
}

/** Display name of a cargo id. */
export function cargoLabel(id) {
  return (CARGO_BY_ID[id] && CARGO_BY_ID[id].name) || id;
}

/**
 * Warning text for an order row, or '' when the stop serves the vehicle.
 * @returns {string} e.g. 'Does not accept Passengers'
 */
export function orderCargoWarning(state, v, st) {
  const bad = unservedCargos(state, v, st);
  if (!bad.length) return '';
  return `Does not accept ${bad.map(cargoLabel).join(', ')}`;
}

/**
 * Vehicles whose carried cargo no stop on their orders accepts (Issues warning).
 * @returns {{vehicleId:number, cargoId:string, message:string}[]}
 */
export function acceptanceProblems(state) {
  const out = [];
  for (const v of state.vehicles || []) {
    const carried = vehicleCargos(v);
    if (!carried.length || !(v.orders || []).length) continue;
    const sts = v.orders.map((o) => (state.stations || []).find((s) => s.id === o.stationId)).filter(Boolean);
    if (!sts.length) continue;
    for (const c of carried) {
      if (sts.some((st) => st.accepts && st.accepts[c])) continue;
      out.push({ vehicleId: v.id, cargoId: c,
        message: `Vehicle ${v.name}: no stop on its orders accepts ${cargoLabel(c)}` });
    }
  }
  return out;
}
