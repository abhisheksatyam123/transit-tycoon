/**
 * Transparency toggles (OpenTTD transparency_gui.cpp, TransparencyOption): display-only, stored in this browser
 * (localStorage 'tt.transparency'), never in the save. Buildings, industries, stations, bridges, signs,
 * structures (map objects) and catenary draw semi-transparent; trees are hidden (OTTD 'invisible').
 * Ctrl+1..8 toggle them (input/input.js).
 * When every toggle is off, loadTransparency() returns null and the renderer does one null check per frame.
 */
export const TRANSPARENCY_KEY = 'tt.transparency';
/** Alpha of a transparent object (OTTD uses ~50%; 0.4 keeps buildings readable). */
export const TRANSPARENT_ALPHA = 0.4;
/** Ordered toggles: index+1 is the Ctrl+digit hotkey. */
export const TRANSPARENCY_OPTIONS = [
  { id: 'buildings', label: 'Buildings' },
  { id: 'trees', label: 'Trees' },
  { id: 'industries', label: 'Industries' },
  { id: 'stations', label: 'Stations' },
  { id: 'bridges', label: 'Bridges' },
  { id: 'signs', label: 'Signs' },
  // OpenTTD TransparencyOption TO_STRUCTURES (transparency.h ~22-33): map objects (transmitter, lighthouse, bought land).
  { id: 'structures', label: 'Structures' },
  // OpenTTD TransparencyOption TO_CATENARY: electrified rail and tram overhead wires.
  { id: 'catenary', label: 'Catenary' },
];

/** @type {Record<string, boolean>|null|undefined} undefined = not loaded yet */
let cache;

function parse(raw) {
  let o = null;
  try { o = raw ? JSON.parse(raw) : null; } catch { o = null; }
  const out = {};
  let any = false;
  for (const { id } of TRANSPARENCY_OPTIONS) {
    out[id] = !!(o && o[id] === true);
    if (out[id]) any = true;
  }
  return any ? out : null;
}

/** Current toggles, or null when all are off (cached; read once per frame, cheap). */
export function loadTransparency() {
  if (cache !== undefined) return cache;
  let raw = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(TRANSPARENCY_KEY); } catch { raw = null; }
  cache = parse(raw);
  return cache;
}

/** Turn one toggle on or off. Returns the new state (null when all off). */
export function setTransparency(id, on) {
  const cur = loadTransparency() || Object.fromEntries(TRANSPARENCY_OPTIONS.map((o) => [o.id, false]));
  const next = { ...cur, [id]: !!on };
  const any = TRANSPARENCY_OPTIONS.some((o) => next[o.id]);
  cache = any ? next : null;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(TRANSPARENCY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return cache;
}

/** Drop the cached prefs (tests). */
export function resetTransparencyCache() { cache = undefined; }

/**
 * Alpha for a map tile's static object under the toggles: 1 = normal, TRANSPARENT_ALPHA = faded, 0 = hidden.
 * @param {object} tile
 * @param {Record<string, boolean>} tr non-null toggles
 */
export function tileTransparency(tile, tr) {
  const b = tile.building;
  if (b) {
    if (b.type === 'house' && tr.buildings) return TRANSPARENT_ALPHA;
    if (b.type === 'industry' && tr.industries) return TRANSPARENT_ALPHA;
    if (b.type === 'station' && tr.stations) return TRANSPARENT_ALPHA;
    return 1;
  }
  // OpenTTD TO_STRUCTURES: map objects (cmdObject.js) are drawn by layers/objects.js drawObjectTile.
  if (tile.object && tr.structures) return TRANSPARENT_ALPHA;
  if (tile.terrain === 'forest' && tr.trees && !tile.rail && !tile.road) return 0;
  return 1;
}

/**
 * Alpha for overhead wires under the toggles (OpenTTD TO_CATENARY): 1 = normal, TRANSPARENT_ALPHA = faded.
 * @param {Record<string, boolean>|null} tr non-null toggles (or null)
 */
export function catenaryAlpha(tr) {
  return tr && tr.catenary ? TRANSPARENT_ALPHA : 1;
}
