/**
 * Moscow building styles (interim heuristic until real building data is baked). Pure and
 * deterministic: the style depends on the tile's distance from the Kremlin (tiles, 200 m each)
 * and on the Moscow City core, drawn from the game rng. Renderer draws styles in houses.js.
 */
import { tl, TS } from './moscowScale.js';

/** Distance bands (tiles from the Kremlin): inside Garden Ring, Garden-TTK, TTK-MKAD, outside MKAD. */
export const ZONE_RADII = { garden: tl(18), ttk: tl(45), mkad: tl(100) };

/** Allowed level range per style [min, max] (level drives population, style drives looks). */
export const STYLE_LEVELS = {
  historic: [3, 3],
  stalinka: [4, 4],
  khrushchyovka: [2, 2],
  panel: [2, 3],
  modern: [4, 4],
  glass: [4, 4],
  cottage: [1, 1],
  industrial: [1, 2],
  warehouse: [1, 2],
  mall: [1, 2],
};

/** Landuse char to house style override (retail 'm' malls, commercial 'c' warehouses, industrial 'i'). */
export const LANDUSE_STYLE = { m: 'mall', c: 'warehouse', i: 'industrial' };

/** Weighted style mixes per zone (weights sum to 1; cumulative pick in key order). */
const MIX = {
  garden: { historic: 0.5, stalinka: 0.4, glass: 0.1 },
  ttk: { stalinka: 0.22, historic: 0.2, khrushchyovka: 0.46, panel: 0.12 },
  mkad: { khrushchyovka: 0.4, panel: 0.45, modern: 0.1, industrial: 0.03, mall: 0.02 },
  outer: { cottage: 0.4, panel: 0.3, modern: 0.1, industrial: 0.1, warehouse: 0.06, mall: 0.04 },
};

/**
 * Zone name for a tile at distance `r` (tiles) from the Kremlin.
 * @param {number} r
 * @param {boolean} inCity inside the Moscow City core
 * @returns {'garden'|'ttk'|'mkad'|'outer'|'city'}
 */
export function zoneOf(r, inCity) {
  if (inCity) return 'city';
  if (r <= ZONE_RADII.garden) return 'garden';
  if (r <= ZONE_RADII.ttk) return 'ttk';
  if (r <= ZONE_RADII.mkad) return 'mkad';
  return 'outer';
}

/**
 * Pick a style for a tile. Consumes exactly one rng draw (two for the zone mix).
 * @param {{next:()=>number}} rng game rng
 * @param {number} r distance from the Kremlin (tiles)
 * @param {boolean} inCity inside the Moscow City core
 * @returns {string} style id
 */
export function pickStyle(rng, r, inCity) {
  const zone = zoneOf(r, inCity);
  if (zone === 'city') return 'glass';
  const mix = MIX[zone];
  const u = rng.next();
  let acc = 0, last = 'panel';
  for (const [style, w] of Object.entries(mix)) {
    acc += w;
    last = style;
    if (u < acc) return style;
  }
  return last;
}

/** Clamp a level into the style's allowed range (unknown style: unchanged). */
export function clampLevel(style, level) {
  const range = STYLE_LEVELS[style];
  if (!range) return level;
  return Math.max(range[0], Math.min(range[1], level));
}

/** Distance (tiles) of (x,y) from (kx,ky). */
export function tileDist(x, y, kx, ky) {
  return Math.hypot(x - kx, y - ky);
}
