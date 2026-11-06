/**
 * Airport types (OpenTTD airport specs, scaled to this game). Sizes, introduction years and catchments
 * follow OpenTTD airport_defaults.h (_origin_airport_specs):
 *  - city:         6x4 footprint (OTTD 6x6 city kept at 6x4), the original airport. Records without an
 *                  `airportType` field are city, so existing saves and the world hash are unchanged.
 *  - small:        4x3 (OTTD country), from 1930, cheaper. Planes with more than SMALL_MAX_CAPACITY seats refused.
 *  - heliport:     1x1 helipad (OTTD heliport), from 1963. Helicopters only.
 *  - commuter:     5x4 (OTTD), from 1983, catchment 4. Small planes and helicopters.
 *  - metropolitan: 6x6 (OTTD), from 1980, catchment 6. All planes and helicopters.
 *  - international: 7x7 (OTTD), from 1990, catchment 8. All planes and helicopters (OTTD's second hangar is
 *                  two hangars, one at each end of the footprint (OTTD's second hangar).
 *  - helidepot:    2x2 (OTTD), from 1976, catchment 4. Helicopters only, hangar + helipad.
 *  - helistation:  4x2 (OTTD), from 1980, catchment 4. Helicopters only, hangar + helipads.
 * The FTA state machine of OpenTTD is not ported: every type reuses the aircraft movement in aircraft.js.
 *
 * Layouts are ASCII grids (rows top to bottom, origin top-left). Codes: H hangar (air depot), T terminal,
 * W control tower, R runway, A apron, P helipad. `goal` is the tile aircraft aim for (runway centre, or the
 * helipad). `depotPart` marks the tile that holds the air depot (hangar, or the helipad of a heliport).
 */
import { COSTS } from '../config/costs.js';
import { MODEL_BY_ID } from '../config/vehicles.js';

export const DEFAULT_AIRPORT_TYPE = 'city';
/** Largest seat count a plane may have to use a small (or commuter) airport. */
export const SMALL_MAX_CAPACITY = 80;

const PART_CODE = { H: 'hangar', T: 'terminal', W: 'tower', R: 'runway', A: 'apron', P: 'helipad' };

/** Cells {dx,dy,part} from ASCII rows (all rows the same length). */
function gridLayout(rows) {
  const out = [];
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length; dx++) out.push({ dx, dy, part: PART_CODE[row[dx]] });
  });
  return out;
}

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

const COMMUTER_LAYOUT = gridLayout([
  'HAATT',
  'AAAAA',
  'RRRRR',
  'AAAAA',
]);
const METRO_LAYOUT = gridLayout([
  'HAATTW',
  'AAATTT',
  'RRRRRR',
  'AAAAAA',
  'AAAAAA',
  'AAAAAA',
]);
// two hangars (OTTD international has two air depots): top-left and bottom-left
const INTERNATIONAL_LAYOUT = gridLayout([
  'HAAATTW',
  'AAAATTT',
  'RRRRRRR',
  'AAAAAAA',
  'AAAAAAA',
  'HAAAAAA',
  'AAAAAAA',
]);
const HELIDEPOT_LAYOUT = gridLayout([
  'HP',
  'AA',
]);
const HELISTATION_LAYOUT = gridLayout([
  'HPAT',
  'PAAA',
]);

/**
 * Airport type table. `catchment` = station catchment radius (tiles). City keeps 6 so existing saves and the
 * Moscow sim are unchanged (OpenTTD airport_defaults.h uses 5 for city). `planes`: which planes may use it
 * ('all', 'small' = at most SMALL_MAX_CAPACITY seats, 'none' = helicopters only). `cost` scales with the tile
 * count (city 24 tiles = 60000; new types are priced by footprint size).
 */
export const AIRPORT_TYPES = {
  city: { id: 'city', name: 'City Airport', w: 6, h: 4, catchment: 6, cost: COSTS.airport, introYear: 0, planes: 'all', layout: CITY_LAYOUT, goal: { dx: 2, dy: 2, part: 'runway' }, depotPart: 'hangar' },
  small: { id: 'small', name: 'Small Airport', w: 4, h: 3, catchment: 4, cost: 25000, introYear: 1930, planes: 'small', layout: SMALL_LAYOUT, goal: { dx: 1, dy: 1, part: 'runway' }, depotPart: 'hangar' },
  heliport: { id: 'heliport', name: 'Heliport', w: 1, h: 1, catchment: 4, cost: 12000, introYear: 1963, planes: 'none', layout: HELIPORT_LAYOUT, goal: { dx: 0, dy: 0, part: 'helipad' }, depotPart: 'helipad' },
  commuter: { id: 'commuter', name: 'Commuter Airport', w: 5, h: 4, catchment: 4, cost: 42000, introYear: 1983, planes: 'small', layout: COMMUTER_LAYOUT, goal: { dx: 2, dy: 2, part: 'runway' }, depotPart: 'hangar' },
  metropolitan: { id: 'metropolitan', name: 'Metropolitan Airport', w: 6, h: 6, catchment: 6, cost: 85000, introYear: 1980, planes: 'all', layout: METRO_LAYOUT, goal: { dx: 2, dy: 2, part: 'runway' }, depotPart: 'hangar' },
  international: { id: 'international', name: 'International Airport', w: 7, h: 7, catchment: 8, cost: 130000, introYear: 1990, planes: 'all', layout: INTERNATIONAL_LAYOUT, goal: { dx: 3, dy: 2, part: 'runway' }, depotPart: 'hangar' },
  helidepot: { id: 'helidepot', name: 'Helidepot', w: 2, h: 2, catchment: 4, cost: 16000, introYear: 1976, planes: 'none', layout: HELIDEPOT_LAYOUT, goal: { dx: 1, dy: 0, part: 'helipad' }, depotPart: 'hangar' },
  helistation: { id: 'helistation', name: 'Helistation', w: 4, h: 2, catchment: 4, cost: 22000, introYear: 1980, planes: 'none', layout: HELISTATION_LAYOUT, goal: { dx: 1, dy: 0, part: 'helipad' }, depotPart: 'hangar' },
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
 * Helicopters: any airport incl. heliports and helidepots. Planes: per the type's `planes` rule
 * ('none' = helicopters only, 'small' = seats <= SMALL_MAX_CAPACITY, 'all').
 * @param {{helicopter?:boolean,capacity?:number}} model
 * @param {string} [typeId]
 */
export function vehicleFitsAirport(model, typeId) {
  if (!model) return false;
  if (model.helicopter) return true;
  const t = airportType(airportTypeId({ airportType: typeId }));
  if (t.planes === 'none') return false;
  if (t.planes === 'small') return (model.capacity || 0) <= SMALL_MAX_CAPACITY;
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
