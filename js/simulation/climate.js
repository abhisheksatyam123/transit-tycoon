/**
 * Sub-arctic climate (opt-in, OpenTTD climate 'sub-arctic'). Temperate stays the default: a game is arctic only
 * when state.mapgen.climate === 'arctic' (lazy, absent otherwise, so default saves are unchanged).
 *
 * Ported from OpenTTD src/clear_cmd.cpp (TileLoopClearAlps: snow density from GetTileZ - GetSnowLine() + 1, clamped
 * to 0..3 = 1/4..full snow) and src/town_cmd.cpp (a town whose centre is at or above the snow line only grows when it
 * received FOOD last month). OpenTTD's snow line default is 10 of 15 height levels; ours is 0..7, so 5 (scaled).
 * GPL-2.0 (OpenTTD).
 */
import { getSetting } from './settings.js';

/** Default snow line in our height levels (0..7). */
export const DEFAULT_SNOW_LINE = 5;

/** @returns {boolean} true only for an explicit sub-arctic game. */
export function isArctic(state) {
  return !!(state && state.mapgen && state.mapgen.climate === 'arctic');
}

/** Snow line height (levels) of a game; the default when the game has none stored. */
export function snowLineOf(state) {
  const v = state && state.mapgen ? state.mapgen.snowLine : undefined;
  return Number.isInteger(v) ? v : DEFAULT_SNOW_LINE;
}

/**
 * Snow density index for a tile base height (OpenTTD TileLoopClearAlps). -1 = no snow; 0..3 = 1/4, 1/2, 3/4, full.
 * @param {number} z tile base height (levels; the lowest corner, OpenTTD GetTileZ)
 * @param {number} line snow line height
 */
export function snowDensity(z, line) {
  const k = z - line + 1;
  return k < 0 ? -1 : Math.min(k, 3);
}

/**
 * Snow density index of a tile in a game (-1 = no snow, always -1 in temperate games).
 * @param {any} state
 * @param {number} z tile base height
 */
export function tileSnowDensity(state, z) {
  return isArctic(state) ? snowDensity(z, snowLineOf(state)) : -1;
}

/**
 * OpenTTD town_cmd.cpp growth rule: a town centred at or above the snow line grows only if it received food
 * (FOOD cargo) in the last month. Towns below the line, and every town in temperate games, always may grow.
 *
 * climateGrowthOttd (opt-in, default false = the rule above, unchanged) uses OpenTTD UpdateTownGrowth exactly
 * (src/town_cmd.cpp:3941-3946): a funded town (fund_buildings_months != 0) skips the goal checks, and the winter
 * goal only blocks a town while population > 90 AND its activity is zero (old_act == 0). TT's equivalent of
 * 'active' is the same food delivery the gate already uses, so FOOD last month > 0 counts as active.
 * @param {any} state
 * @param {{x:number,y:number,population?:number,fundMonths?:number,foodLastMonth?:number}} town
 * @returns {boolean}
 */
export function townGrowthAllowed(state, town) {
  if (!isArctic(state) || !town) return true;
  const map = state.map;
  const t = map && map.tiles ? map.tiles[town.y * map.width + town.x] : null;
  if (!t || t.height < snowLineOf(state)) return true;
  const fed = (town.foodLastMonth || 0) > 0;
  if (getSetting(state, 'climateGrowthOttd') !== true) return fed;
  // OpenTTD: "if (t->fund_buildings_months == 0) { ...goal checks... }"
  if ((town.fundMonths || 0) > 0) return true;
  // OpenTTD TOWN_GROWTH_WINTER: TileHeight >= GetSnowLine() && old_act == 0 && population > 90 -> no growth.
  return fed || (town.population || 0) <= 90;
}

/** @returns {boolean} true only for an explicit toyland game (lazy, absent otherwise). Stage 1: ground, trees, houses. */
export function isToyland(state) {
  return !!(state && state.mapgen && state.mapgen.climate === 'toyland');
}

// ---- sub-tropical (opt-in 'tropic'; OpenTTD landscape.cpp CreateDesertOrRainForest, CalculateDesertLine) ----

/** Desert share of the map (OpenTTD desert_coverage default 35 %). */
export const DESERT_COVERAGE = 0.35;

/** @returns {boolean} true only for an explicit sub-tropical game (lazy, absent otherwise). */
export function isTropic(state) {
  return !!(state && state.mapgen && state.mapgen.climate === 'tropic');
}

/**
 * Desert line (OpenTTD CalculateDesertLine): the lowest height level L such that the land below L covers about
 * DESERT_COVERAGE of all tiles (at least level 1). Derived from the heights, so it needs no save data.
 */
export function desertLine(map) {
  const hist = new Array(9).fill(0);
  for (const t of map.tiles) if (t.terrain !== 'water') hist[Math.min(8, t.height | 0)]++;
  const want = DESERT_COVERAGE * map.tiles.length;
  let below = 0;
  for (let L = 1; L <= 8; L++) {
    below += hist[L - 1];
    if (below >= want) return L;
  }
  return 8;
}

const zoneCache = new WeakMap();

/**
 * Sub-tropical zones of a map, derived deterministically (no save data). Per tile: 0 = other land or water,
 * 1 = desert, 2 = rainforest. Desert (OpenTTD _make_desert_or_rainforest_data test): land below the desert line whose
 * 3x3 block is all land below the line. Rainforest: non-desert land with no desert in its 3x3 block.
 * Cached per map object; call tropicZonesReset after the terrain or heights change.
 * @param {{width:number,height:number,tiles:any[]}} map
 * @returns {Uint8Array} zone per tile index
 */
export function tropicZones(map) {
  const cached = zoneCache.get(map);
  if (cached) return cached;
  const W = map.width, H = map.height, T = map.tiles;
  const line = desertLine(map);
  const zone = new Uint8Array(W * H);
  const dry = (j) => T[j].terrain !== 'water' && T[j].height < line;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!dry(i)) continue;
    let desert = true;
    for (let dy = -1; dy <= 1 && desert; dy++) for (let dx = -1; dx <= 1 && desert; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!dry(ny * W + nx)) desert = false;
    }
    if (desert) zone[i] = 1;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (T[i].terrain === 'water' || zone[i] === 1) continue;
    let rain = true;
    for (let dy = -1; dy <= 1 && rain; dy++) for (let dx = -1; dx <= 1 && rain; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (zone[ny * W + nx] === 1) rain = false;
    }
    if (rain) zone[i] = 2;
  }
  zoneCache.set(map, zone);
  return zone;
}

/** Forget the cached zones of a map (after terrain or height edits). */
export function tropicZonesReset(map) { zoneCache.delete(map); }

/** Zone of one tile: 0 other land / water, 1 desert, 2 rainforest (0 outside the map). */
export function tropicZoneAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
  return tropicZones(map)[y * map.width + x];
}

/**
 * Sub-tropical town growth rule (OpenTTD town_cmd.cpp: a town in the desert needs FOOD and WATER to grow). WATER (TP) is
 * the second half: a town centred in the desert grows only if it received FOOD and WATER last month. Towns outside the desert, and every town in other climates, always may grow.
 *
 * climateGrowthOttd (opt-in, default false = the rule above, unchanged) uses OpenTTD UpdateTownGrowth exactly
 * (src/town_cmd.cpp:3941-3949): a funded town skips the goal checks, and TOWN_GROWTH_DESERT only blocks a desert
 * town while population > 60 AND its activity is zero (old_act == 0; TT: FOOD+WATER delivered, the same activity
 * the gate already uses).
 * @param {any} state
 * @param {{x:number,y:number,population?:number,fundMonths?:number,foodLastMonth?:number,waterLastMonth?:number}} town
 * @returns {boolean}
 */
export function tropicGrowthAllowed(state, town) {
  if (!isTropic(state) || !town) return true;
  if (tropicZoneAt(state.map, town.x, town.y) !== 1) return true;
  const supplied = (town.foodLastMonth || 0) > 0 && (town.waterLastMonth || 0) > 0;
  if (getSetting(state, 'climateGrowthOttd') !== true) return supplied;
  if ((town.fundMonths || 0) > 0) return true;
  return supplied || (town.population || 0) <= 60;
}
