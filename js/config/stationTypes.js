/**
 * Station styles (OpenLoco StationObject-like): per kind, a small catalogue of styles with
 * a construction cost factor, a designed/obsolete year window and a catchment bonus.
 * The DEFAULT style is always available and is what a tile without a stored `style` uses,
 * so existing games keep today's cost and catchment. Styles only change cost and catchment
 * here; `tint` is a hint for renderers that want a variant (roof colour of canopies and road-stop shelters, layers/objects.js).
 * Lazy storage: a station tile carries `style` only when it is not the default.
 */

export const DEFAULT_STYLE = 'standard';

/** @type {Record<'rail'|'bus'|'truck', {id:string,name:string,designed:number,obsolete:number|null,costFactor:number,catchBonus:number,tint:string|null}[]>} */
export const STATION_STYLES = {
  rail: [
    { id: 'standard', name: 'Standard platform', designed: 0, obsolete: null, costFactor: 1, catchBonus: 0, tint: null },
    { id: 'wooden', name: 'Wooden halt', designed: 1900, obsolete: 1960, costFactor: 0.6, catchBonus: 0, tint: '#8a5a2b' },
    { id: 'brick', name: 'Brick station', designed: 1930, obsolete: null, costFactor: 1.2, catchBonus: 0, tint: '#9b3d2e' },
    { id: 'modern', name: 'Modern concrete', designed: 1965, obsolete: null, costFactor: 1.8, catchBonus: 1, tint: '#9aa3ad' },
  ],
  bus: [
    { id: 'standard', name: 'Bus stop', designed: 0, obsolete: null, costFactor: 1, catchBonus: 0, tint: null },
    { id: 'shelter', name: 'Bus shelter', designed: 1930, obsolete: 1985, costFactor: 1.2, catchBonus: 0, tint: '#7a8a5a' },
    { id: 'modern', name: 'Modern bus station', designed: 1975, obsolete: null, costFactor: 1.6, catchBonus: 1, tint: '#3b6ea5' },
  ],
  truck: [
    { id: 'standard', name: 'Truck stop', designed: 0, obsolete: null, costFactor: 1, catchBonus: 0, tint: null },
    { id: 'covered', name: 'Covered truck stop', designed: 1950, obsolete: null, costFactor: 1.3, catchBonus: 0, tint: '#6b7f3a' },
  ],
};

/** Base catchment radius per kind (mirrors constants.js CATCHMENT). */
const BASE_CATCHMENT = { rail: 4, bus: 3, truck: 3 };

/**
 * Styles of `kind` offered in `year` (default first).
 * @returns {object[]}
 */
export function availableStyles(kind, year) {
  return (STATION_STYLES[kind] || []).filter((s) => s.id === DEFAULT_STYLE
    || (year >= s.designed && (s.obsolete == null || year < s.obsolete)));
}

/** Style record by kind and id (default when unknown or absent). */
export function styleById(kind, id) {
  const list = STATION_STYLES[kind] || [];
  return list.find((s) => s.id === (id || DEFAULT_STYLE)) || list[0];
}

/** True when a style exists for the kind and is buildable in `year`. */
export function styleAvailable(kind, id, year) {
  return availableStyles(kind, year).some((s) => s.id === (id || DEFAULT_STYLE));
}

/** Catchment radius of a station tile record ({kind, style?}). */
export function tileRadius(t) {
  const base = BASE_CATCHMENT[t.kind];
  if (base === undefined) return undefined;
  return base + styleById(t.kind, t.style).catchBonus;
}
