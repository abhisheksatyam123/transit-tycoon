/**
 * OpenGFX rail and road depot sprites. Ported from OpenTTD src/table/track_land.h (_depot_gfx_table:
 * NE = ground + SPR_RAIL_DEPOT_NE; SE = track Y + SPR_RAIL_DEPOT_SE_1/2; SW = track X +
 * SPR_RAIL_DEPOT_SW_1/2; NW = ground + SPR_RAIL_DEPOT_NW) and src/road_land.h (_road_depot). Depot
 * direction bit is our N=1 (OpenTTD NE), E=2 (SE), S=4 (SW), W=8 (NW) (GPL-2.0).
 */

/**
 * Sprite stack for a rail depot whose exit faces `dir`.
 * @param {number} dir 1|2|4|8
 * @returns {number[]} ids (first = ground)
 */
export function railDepotIds(dir) {
  switch (dir) {
    case 1: return [3981, 1067];
    case 2: return [1011, 1064, 1063];
    case 4: return [1012, 1066, 1065];
    case 8: return [3981, 1068];
    default: return [];
  }
}

/**
 * Road depot building overlay for a depot direction (road ground is drawn separately).
 * @param {number} dir 1|2|4|8
 * @returns {number} sprite id or -1
 */
export function roadDepotId(dir) {
  return { 1: 1409, 2: 1413, 4: 1412, 8: 1411 }[dir] ?? -1;
}
