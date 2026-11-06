/**
 * Airport types (OpenTTD airport specs, scaled to this game):
 *  - city:     6x4 footprint, the original airport. Records without an `airportType` field are city, so
 *              existing saves and the world hash are unchanged.
 *  - small:    4x3 footprint, from 1930, cheaper. Planes with more than SMALL_MAX_CAPACITY seats are refused.
 *  - heliport: 1x1 helipad, from 1963. Helicopters only; planes are refused.
 * Layout cells are {dx,dy,part} with origin top-left. Parts: runway, apron, terminal, tower, hangar, helipad.
 * `goal` is the tile aircraft aim for (runway centre, or the helipad).
 */
import { COSTS } from '../config/costs.js';
import { MODEL_BY_ID } from '../config/vehicles.js';

export const DEFAULT_AIRPORT_TYPE = 'city';
/** Largest seat count a plane may have to use a small airport. */
export const SMALL_MAX_CAPACITY = 80;

const CITY_LAYOUT = (() => {
  const cells = { '0,0': 'hangar', '0,4': 'terminal', '0,5': 'tower', '1,4': 'terminal', '1,5': 'terminal' };
  const out = [];
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 6; dx++) out.push({ dx, dy, part: cells[`${dy},${dx}`] || (dy === 2 ? 'runway' : 'apron') });
  }
  return out;
})();

// row 0: hangar, apron, apron, terminal; row 1: runway; row 2: apron
const SMALL_LAYOUT = (() => {
  const out = [];
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 4; dx++) {
      let part = dy === 1 ? 'runway' : 'apron';
      if (dy === 0 && dx === 0) part = 'hangar';
      if (dy === 0 && dx === 3) part = 'terminal';
      out.push({ dx, dy, part });
    }
  }
  return out;
})();

const HELIPORT_LAYOUT = [{ dx: 0, dy: 0, part: 'helipad' }];

/**
 * Airport type table. `catchment` = station catchment radius (tiles). City keeps 6 so existing saves and the
 * Moscow sim are unchanged (OpenTTD airport_defaults.h uses 5 for city, 4 for country/small and heliport).
 * `depotPart` marks the tile that holds the air depot (hangar, or the helipad). */
export const AIRPORT_TYPES = {
  city: { id: 'city', name: 'City Airport', w: 6, h: 4, catchment: 6, cost: COSTS.airport, introYear: 0, layout: CITY_LAYOUT, goal: { dx: 2, dy: 2, part: 'runway' }, depotPart: 'hangar' },
  small: { id: 'small', name: 'Small Airport', w: 4, h: 3, catchment: 4, cost: 25000, introYear: 1930, layout: SMALL_LAYOUT, goal: { dx: 1, dy: 1, part: 'runway' }, depotPart: 'hangar' },
  heliport: { id: 'heliport', name: 'Heliport', w: 1, h: 1, catchment: 4, cost: 12000, introYear: 1963, layout: HELIPORT_LAYOUT, goal: { dx: 0, dy: 0, part: 'helipad' }, depotPart: 'helipad' },
};

/** Type id of an airport record, station tile building or air depot (absent = city). */
export function airportTypeId(rec) {
  const id = rec && rec.airportType;
  return id && AIRPORT_TYPES[id] ? id : DEFAULT_AIRPORT_TYPE;
}

/** Type spec for an id (unknown ids fall back to city). */
export function airportType(id) {
  return AIRPORT_TYPES[id] || AIRPORT_TYPES[DEFAULT_AIRPORT_TYPE];
}

/**
 * Whether a vehicle model may use an airport of this type.
 * Helicopters: any airport incl. heliports. Planes: not heliports; small airports only take small planes.
 * @param {{helicopter?:boolean,capacity?:number}} model
 * @param {string} [typeId]
 */
export function vehicleFitsAirport(model, typeId) {
  if (!model) return false;
  if (model.helicopter) return true;
  const t = airportTypeId({ airportType: typeId });
  if (t === 'heliport') return false;
  if (t === 'small') return (model.capacity || 0) <= SMALL_MAX_CAPACITY;
  return true;
}

/** True for a helicopter model (or a vehicle carrying one). */
export function isHelicopter(v) {
  const m = v && MODEL_BY_ID[v.modelId || v.id];
  return !!(m && m.helicopter);
}

/** Footprint layout of an airport type id (unknown ids: city). */
export function airportLayoutFor(typeId) {
  return airportType(typeId).layout;
}
