/**
 * OpenGFX level crossing sprites. Ported from OpenTTD src/road_cmd.cpp DrawTile_Road crossing branch
 * (SPR_CROSSING_OFF_X_RAIL = 1370 + road axis offset; open gates are animated, so the off state is
 * drawn) (GPL-2.0). Road N|S = X axis, E|W = Y axis.
 */
const SPR_CROSSING_OFF_X_RAIL = 1370;

/**
 * Crossing sprite for a road mask and a perpendicular rail mask, or -1. barred = barriers closed
 * (OTTD road_cmd.cpp: the barred sprite is the open one + 2 / + 3).
 * @param {number} road road mask (N|S = 5 or E|W = 10)
 * @param {number} rail rail mask (must be the other axis)
 * @param {boolean} [barred]
 * @returns {number}
 */
export function crossingId(road, rail, barred = false) {
  const k = barred ? 2 : 0;
  if (road === 5 && rail === 10) return SPR_CROSSING_OFF_X_RAIL + k;
  if (road === 10 && rail === 5) return SPR_CROSSING_OFF_X_RAIL + 1 + k;
  return -1;
}
