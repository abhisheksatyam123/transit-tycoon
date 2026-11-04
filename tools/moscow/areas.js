/**
 * Water, park/forest and inside-MKAD terrain rasterisation.
 * Terrain codes: 'g' land, 'w' water, 'p' park, 'f' forest.
 */
import { chainTiles, markTiles, fillRing, ringF } from './raster.js';
import { tag, waysOf } from './io.js';
import { polygonsOf, polygonMask } from './multipoly.js';
import { WIDTH, HEIGHT, projectF, TILE_M } from './proj.js';

/** Rivers/canals wide enough to show as a tile chain at 200 m/tile (others are narrow streams). */
export const WIDE_RIVERS = new Set(['Москва', 'Яуза', 'Канал имени Москвы', 'Водоотводный канал']);

/**
 * Rasterise wide rivers and canals (WIDE_RIVERS, not in tunnels) as 4-connected single-tile chains into `water`.
 * @param {Array<object>|null} rivers river layer elements (waterway=river/canal)
 * @param {Uint8Array} water mask (1 = water)
 * @returns {number} ways rasterised
 */
export function buildRivers(rivers, water) {
  let ways = 0;
  for (const w of waysOf(rivers)) {
    const wy = tag(w, 'waterway');
    if (wy !== 'river' && wy !== 'canal') continue;
    if (tag(w, 'tunnel')) continue; // culverted rivers (e.g. Neglinnaya) are underground
    if (!WIDE_RIVERS.has(tag(w, 'name') || '')) continue; // streams are far narrower than a 200 m tile
    ways++;
    markTiles(water, chainTiles(w.geometry), 1);
  }
  return ways;
}

/**
 * Fill water polygons (closed ways and multipolygon relations, natural=water, water=*) into `water`.
 * @param {Array<object>|null} els water layer elements
 * @param {Uint8Array} water
 * @returns {number} polygons filled
 */
export function buildWaterPolys(els, water) {
  let n = 0;
  for (const poly of polygonsOf(els)) {
    const { mask, n: k } = polygonMask(poly);
    if (!k) continue;
    for (let t = 0; t < mask.length; t++) if (mask[t]) water[t] = 1;
    n++;
  }
  return n;
}

/**
 * Fill park and forest polygons into `terrain` (park 'p', forest 'f') where terrain is land.
 * Skips water tiles.
 * @param {Array<object>|null} els parks layer elements
 * @param {Uint8Array} terrain 'g'/'p'/'f' codes as char codes
 * @param {Uint8Array} water
 * @returns {{parks:number, forests:number}}
 */
export function buildParks(els, terrain, water) {
  let parks = 0, forests = 0;
  const G = 'g'.charCodeAt(0), P = 'p'.charCodeAt(0), F = 'f'.charCodeAt(0);
  for (const poly of polygonsOf(els)) {
    const w = poly.el;
    const park = tag(w, 'leisure') === 'park';
    const forest = tag(w, 'landuse') === 'forest' || tag(w, 'natural') === 'wood'
      || tag(w, 'leisure') === 'nature_reserve' || tag(w, 'boundary') === 'national_park';
    if (!park && !forest) continue;
    const { mask, n } = polygonMask(poly);
    if (!n) continue;
    const val = park ? P : F;
    for (let t = 0; t < mask.length; t++) {
      if (!mask[t] || water[t]) continue;
      // parks win over forest; forest only overwrites plain grass
      if (terrain[t] === G || (park && terrain[t] === F)) terrain[t] = val;
    }
    if (park) parks++; else forests++;
  }
  return { parks, forests };
}

/**
 * Mark tiles inside MKAD: flood-fill from the border over non-MKAD tiles;
 * unreached tiles are inside. Falls back to a 17 km ellipse when MKAD is missing.
 * @param {number[]} mkadTiles chain tiles of MKAD ways
 * @returns {{inside:Uint8Array, method:string}}
 */
export function insideMkad(mkadTiles) {
  const n = WIDTH * HEIGHT;
  const inside = new Uint8Array(n);
  if (mkadTiles.length < 50) {
    const c = projectF(55.75, 37.62);
    for (let t = 0; t < n; t++) {
      const x = t % WIDTH, y = (t - x) / WIDTH;
      if (Math.hypot(x - c.x, y - c.y) * TILE_M < 17000) inside[t] = 1;
    }
    return { inside, method: 'ellipse-17km' };
  }
  const wall = new Uint8Array(n);
  for (const t of mkadTiles) wall[t] = 1;
  const seen = new Uint8Array(n);
  const stack = [];
  const seed = (t) => { if (!wall[t] && !seen[t]) { seen[t] = 1; stack.push(t); } };
  for (let x = 0; x < WIDTH; x++) { seed(x); seed((HEIGHT - 1) * WIDTH + x); }
  for (let y = 0; y < HEIGHT; y++) { seed(y * WIDTH); seed(y * WIDTH + WIDTH - 1); }
  while (stack.length) {
    const t = stack.pop();
    const x = t % WIDTH, y = (t - x) / WIDTH;
    if (x > 0) seed(t - 1);
    if (x < WIDTH - 1) seed(t + 1);
    if (y > 0) seed(t - WIDTH);
    if (y < HEIGHT - 1) seed(t + WIDTH);
  }
  for (let t = 0; t < n; t++) inside[t] = seen[t] || wall[t] ? 0 : 1;
  return { inside, method: 'mkad-flood' };
}

/**
 * Closed-ring test on a geometry (first point equals last).
 * @param {Array<{lat:number,lon:number}>} g
 * @returns {boolean}
 */
export function isClosed(g) {
  return g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
}

