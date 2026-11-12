/**
 * Colour palette for terrain, cargo fallbacks, company, minimap and overlays.
 */

/** Terrain base colours (top face). */
export const TERRAIN = {
  grass: ['#5f9a3c', '#649f3f', '#5a9338', '#6aa443'],
  forest: ['#4c7f30', '#4a7a2e', '#4f8432', '#477629'],
  desert: ['#d8c27a', '#d3bb72', '#dcc887', '#cfb66c'],
  rock: ['#8a8a82', '#84847c', '#90908a', '#7e7e76'],
  snow: ['#eef3f7', '#e6edf3', '#f4f7fa', '#e1e9f0'],
  water: ['#2f6fa8', '#3274ad', '#2c6aa2', '#3579b3'],
};

/** Side-face (cliff) colours by terrain: [south-facing, east-facing]. */
export const FACES = {
  grass: ['#7a5a36', '#5f4529'],
  forest: ['#6e5132', '#563f27'],
  desert: ['#b59a5a', '#977f48'],
  rock: ['#6c6c66', '#55554f'],
  snow: ['#a9b4bf', '#8e99a5'],
  water: ['#24527d', '#1d4366'],
};

/** Minimap colours. */
export const MINIMAP = {
  grass: '#4f8a33', forest: '#2f5e22', desert: '#cdb46b', rock: '#7c7c74', snow: '#e5ecf2', water: '#2a5f93',
  road: '#9aa3ad', rail: '#c9a46a', house: '#e0b48a', industry: '#d05ad0', station: '#38bdf8', depot: '#f59e0b',
  vehicle: '#ffffff', viewport: '#38bdf8',
  landmark: '#f5c542', avenue: '#f59e0b', avenue2: '#fb923c',
  runway: '#f8fafc', apron: '#a8a29e',
};

/** Fallback cargo colours (core data may supply its own `color`). */

/** Company livery. `primary`/`dark` follow the player's chosen colour (setPlayerColour); default blue. */
export const COMPANY = { primary: '#1e6fd9', secondary: '#f2c230', dark: '#123f7a' };
const DEFAULT_PRIMARY = COMPANY.primary, DEFAULT_DARK = COMPANY.dark;

/** Player colour (companyColour.js) applied to the company livery; null = the default blue (unchanged game). */
let playerHex = null;

/** Darken a '#rrggbb' colour by 40% (the dark face of HQ/company blocks). */
function darkerHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(c * 0.6).toString(16).padStart(2, '0');
  return '#' + f((n >> 16) & 255) + f((n >> 8) & 255) + f(n & 255);
}

/**
 * Apply the player company colour to the livery (called per frame from the renderer; cheap when unchanged).
 * @param {string|null|undefined} hex '#rrggbb' or null/undefined for the default
 */
export function setPlayerColour(hex) {
  const h = typeof hex === 'string' && hex[0] === '#' && hex.length === 7 ? hex : null;
  if (h === playerHex) return;
  playerHex = h;
  COMPANY.primary = h || DEFAULT_PRIMARY;
  COMPANY.dark = h ? darkerHex(h) : DEFAULT_DARK;
}

/** The player's colour used for company-coloured sprites and labels (one getter). */
export function playerColour() { return COMPANY.primary; }

/** Livery of the player's own vehicles: the chosen colour, or null (keep the per-vehicle palette). */
export function playerVehicleColour() { return playerHex; }

/** House body/roof colour pairs by variant. */
export const HOUSE_COLOURS = [
  ['#e8dcc4', '#a8452f'], ['#d9c3a0', '#6b4b3a'], ['#c9d3dc', '#3f5872'], ['#efe6d2', '#8a3b2a'],
  ['#d7b98e', '#53606e'], ['#bfa58a', '#7a2f2f'], ['#e3d0b0', '#2f5d50'], ['#cfcfcf', '#7a5230'],
];

/** Overlay colours. */
export const OVERLAY = {
  hover: 'rgba(255,255,255,0.35)', hoverStroke: 'rgba(255,255,255,0.9)',
  valid: 'rgba(34,197,94,0.38)', validStroke: '#22c55e',
  invalid: 'rgba(239,68,68,0.38)', invalidStroke: '#ef4444',
  catchment: 'rgba(56,189,248,0.30)', catchmentStroke: 'rgba(56,189,248,0.9)',
  catchmentEdge: 'rgba(240,252,255,0.97)', catchmentEdgeDark: 'rgba(4,14,28,0.9)',
  select: 'rgba(250,204,21,0.3)', selectStroke: '#facc15',
};

/**
 * Darken/lighten a #rrggbb colour by factor (e.g. 0.8 darker, 1.2 lighter).
 * @param {string} hex
 * @param {number} f
 * @returns {string}
 */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
