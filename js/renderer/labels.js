/**
 * Map name signs (OpenTTD style): town names and station names drawn in screen space.
 * Pure helpers (prefs, culling, geometry, styling) live here so they can be unit-tested; the draw
 * and hit-test code is in layers/labels.js. Display-only: never touches the simulation.
 */
import { companyById, companyOf } from '../simulation/owner.js';
import { COMPANY } from './palette.js';

export const LABEL_KEY = 'tt.labels';
/** Station signs are hidden below this zoom (they clutter the map when zoomed far out). */
export const STATION_SIGN_MIN_ZOOM = 0.75;
/** Town population is appended to the town sign from this zoom. */
export const TOWN_POP_MIN_ZOOM = 1;
/** Gap (CSS px) between the anchor point and the bottom of a sign. */
export const SIGN_GAP = 6;

/** @type {{towns:boolean, stations:boolean}|null} */
let cache = null;

/** @returns {{towns:boolean, stations:boolean}} label preferences (both ON by default). */
export function loadLabelPrefs() {
  if (cache) return cache;
  let o = null;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LABEL_KEY);
    o = raw ? JSON.parse(raw) : null;
  } catch { o = null; }
  cache = {
    towns: !(o && o.towns === false),
    stations: !(o && o.stations === false),
  };
  return cache;
}

/** Save one toggle ('towns' | 'stations'). */
export function setLabelPref(key, on) {
  const p = { ...loadLabelPrefs(), [key]: !!on };
  cache = p;
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(LABEL_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  return p;
}

/** Drop the cached prefs (tests). */
export function resetLabelPrefsCache() { cache = null; }

/** Town sign text: "Name" or "Name (pop)" at zoom >= TOWN_POP_MIN_ZOOM. */
export function townSignText(name, population, zoom) {
  if (zoom < TOWN_POP_MIN_ZOOM) return name;
  return `${name} (${Math.round(population || 0)})`;
}

/**
 * Sign box above an anchor point, centred horizontally, bottom edge SIGN_GAP above the anchor.
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function signRect(ax, ay, w, h) {
  return { x: ax - w / 2, y: ay - SIGN_GAP - h, w, h };
}

/** True when the box intersects the viewport [0,viewW]x[0,viewH] (margin in px). */
export function rectInView(r, viewW, viewH, margin = 0) {
  return r.x + r.w >= -margin && r.x <= viewW + margin && r.y + r.h >= -margin && r.y <= viewH + margin;
}

/** Point-in-box test for click hit testing. */
export function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** Whether station signs are drawn at this zoom. */
export function stationSignsVisible(zoom) {
  return zoom >= STATION_SIGN_MIN_ZOOM;
}

/**
 * Station sign colours by owner: the player's stations use the player colour; a rival's stations use
 * the rival's own colour (fallback: a neutral red-orange). Text is always white-on-colour.
 * @returns {{fill:string, rival:boolean}}
 */
export function stationSignStyle(state, st) {
  const owner = companyOf(state, st);
  const rival = st.ownerId != null && owner !== state.company;
  if (!rival) return { fill: COMPANY.primary, rival: false };
  const r = companyById(state, st.ownerId);
  return { fill: (r && r.colour) || '#d9482b', rival: true };
}
