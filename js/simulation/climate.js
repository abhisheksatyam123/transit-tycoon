/**
 * Sub-arctic climate (opt-in, OpenTTD climate 'sub-arctic'). Temperate stays the default: a game is arctic only
 * when state.mapgen.climate === 'arctic' (lazy, absent otherwise, so default saves are unchanged).
 *
 * Ported from OpenTTD src/clear_cmd.cpp (TileLoopClearAlps: snow density from GetTileZ - GetSnowLine() + 1, clamped
 * to 0..3 = 1/4..full snow) and src/town_cmd.cpp (a town whose centre is at or above the snow line only grows when it
 * received FOOD last month). OpenTTD's snow line default is 10 of 15 height levels; ours is 0..7, so 5 (scaled).
 * GPL-2.0 (OpenTTD).
 */

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
 * @param {any} state
 * @param {{x:number,y:number,foodLastMonth?:number}} town
 * @returns {boolean}
 */
export function townGrowthAllowed(state, town) {
  if (!isArctic(state) || !town) return true;
  const map = state.map;
  const t = map && map.tiles ? map.tiles[town.y * map.width + town.x] : null;
  if (!t || t.height < snowLineOf(state)) return true;
  return (town.foodLastMonth || 0) > 0;
}
