/**
 * OpenGFX road sprites. Ported from OpenTTD src/road_cmd.cpp (GPL-2.0): GetRoadSpriteOffset (flat
 * offsets indexed by RoadBits, slope offsets NE=11, SE=12, SW=13, NW=14) and GetRoadGroundSprite
 * (grass = SPR_ROAD_Y(1332) + offset, paved = 1313 + offset). OpenTTD RoadBits: NW=1, SW=2, SE=4, NE=8.
 * Our road mask: N=1 (OpenTTD NE), E=2 (SE), S=4 (SW), W=8 (NW).
 */
const ROAD_SLOPE_OFFSET = { NE: 11, SE: 12, SW: 13, NW: 14 };
/** Road axis on each diagonal slope: X (our N|S) on NE/SW, Y (our E|W) on SE/NW. */
const SLOPE_AXIS_MASK = { NE: 5, SE: 10, SW: 5, NW: 10 };
/** road_cmd.cpp offsets[bits] for flat roads, bits = OpenTTD RoadBits. */
const FLAT_OFFSET = [0, 18, 17, 7, 16, 0, 10, 5, 15, 8, 1, 4, 9, 3, 6, 2];

/** Our road mask (N=1,E=2,S=4,W=8) -> OpenTTD RoadBits (NE=8, SE=4, SW=2, NW=1). */
function toOttdRoadBits(m) {
  return ((m & 1) << 3) | ((m & 2) << 1) | ((m & 4) >> 1) | ((m & 8) >> 3);
}

/**
 * Flat road sprite (OpenTTD GetRoadSpriteOffset + GetRoadGroundSprite) for a road mask.
 * @param {number} mask road mask N=1,E=2,S=4,W=8
 * @param {boolean} paved town / avenue pavement
 * @returns {number} sprite id or -1
 */
export function roadSprite(mask, paved) {
  if (!mask) return -1;
  return (paved ? 1313 : 1332) + FLAT_OFFSET[toOttdRoadBits(mask)];
}

/**
 * Sloped road sprite id for a straight road on a diagonal slope, or -1.
 * @param {number} mask road mask N=1,E=2,S=4,W=8
 * @param {string|null} slope 'NE'|'SE'|'SW'|'NW' from rail.js twoCornerSlope
 * @param {boolean} paved
 * @returns {number}
 */
export function roadSlopeId(mask, slope, paved) {
  if (!slope || SLOPE_AXIS_MASK[slope] !== mask) return -1;
  return (paved ? 1313 : 1332) + ROAD_SLOPE_OFFSET[slope];
}
