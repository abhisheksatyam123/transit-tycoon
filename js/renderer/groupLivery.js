/**
 * Group livery lookup for the renderer (cmdGroup.js setGroupColour). Returns a Map groupId -> '#rrggbb' for the
 * groups that have a colour, or null when none does (the common case: the per-vehicle cost is then one null check).
 * Rebuilt only when the groups array, its length or company.groupColourRev changes (not per frame).
 */
let cache = { state: null, groups: null, len: -1, rev: -1, map: null };

/**
 * @param {any} state
 * @returns {Map<number,string>|null}
 */
export function groupColourMap(state) {
  const co = state && state.company;
  const groups = co && co.groups;
  if (!groups || !groups.length) return null;
  const rev = co.groupColourRev || 0;
  if (cache.state === state && cache.groups === groups && cache.len === groups.length && cache.rev === rev) return cache.map;
  let map = null;
  for (const g of groups) {
    if (!g.colour) continue;
    if (!map) map = new Map();
    map.set(g.id, g.colour);
  }
  cache = { state, groups, len: groups.length, rev, map };
  return map;
}

/**
 * Per-vehicle-type colour scheme lookup (cmdGroup.js setTypeColour). Returns {rail?,road?,tram?,air?,ship?} hex
 * strings for the types that have a colour, or null when none does (the common case). Rebuilt only when
 * company.typeColours (identity) or company.typeColourRev changes; the per-vehicle cost is one null check.
 * @param {any} state
 * @returns {Record<string,string>|null}
 */
let tcache = { state: null, map: undefined, rev: -1, out: null };
export function typeColourMap(state) {
  const co = state && state.company;
  const map = co && co.typeColours;
  if (!map) return null;
  const rev = co.typeColourRev || 0;
  if (tcache.state === state && tcache.map === map && tcache.rev === rev) return tcache.out;
  let out = null;
  for (const k of Object.keys(map)) {
    if (!map[k]) continue;
    if (!out) out = {};
    out[k] = map[k];
  }
  tcache = { state, map, rev, out };
  return out;
}

/**
 * Type key of a vehicle for the colour scheme: 'rail' (trains incl. metro), 'tram', 'road' (bus/truck), 'air', 'ship'.
 * @param {any} v
 * @returns {string|undefined}
 */
export function typeOfVehicle(v) {
  switch (v.kind) {
    case 'train': return 'rail';
    case 'road': return v.roadType === 'tram' ? 'tram' : 'road';
    case 'aircraft': return 'air';
    case 'ship': return 'ship';
    default: return undefined;
  }
}

/**
 * Colour override of a vehicle segment (renderer.js): player vehicles only; group colour > type colour > undefined
 * (= company colour, drawn by the sprite code). Rivals never take it (they carry their own livery).
 * @param {any} v vehicle
 * @param {Map<number,string>|null} gmap groupColourMap(state)
 * @param {Record<string,string>|null} tmap typeColourMap(state)
 * @returns {string|undefined}
 */
export function vehicleColourOverride(v, gmap, tmap) {
  if (v.ownerId != null) return undefined;
  let c = gmap && v.groupId != null ? gmap.get(v.groupId) : undefined;
  if (!c && tmap) c = tmap[typeOfVehicle(v)];
  return c || undefined;
}
