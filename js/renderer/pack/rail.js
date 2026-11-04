/**
 * OpenGFX rail track sprites for our rail mask (N=1, E=2, S=4, W=8 edge links).
 * Ported from OpenTTD src/rail_cmd.cpp DrawTrackBits / RailTrackOffset (GPL-2.0).
 * OpenTTD TrackBits: X (NE-SW) = our N|S, Y (NW-SE) = our E|W, UPPER = N+W, LOWER = S+E,
 * RIGHT = N+E, LEFT = S+W (see scratchpad/r4-contract.md).
 * Sprites (OpenGFX base-1005-rail-infra.pnml): 1011 Y, 1012 X, 1013 UPPER, 1014 LOWER, 1015 RIGHT,
 * 1016 LEFT (grass ground + track), 1017 crossing X+Y, 1035 HORZ (UPPER+LOWER), 1036 VERT (RIGHT+LEFT),
 * stubs 1007 N, 1008 S, 1009 E, 1010 W (track only, transparent).
 */

const SPR_FLAT_GRASS = 3981;
const STUB = { 1: 1007, 4: 1008, 2: 1009, 8: 1010 };

/**
 * Sprite list for a rail mask. The first entry is the full-tile ground (grass+track or grass), the
 * rest are transparent overlays.
 * @param {number} mask N=1,E=2,S=4,W=8
 * @param {boolean} grassGround true when the terrain is grass-like (track sprites carry grass)
 * @returns {number[]}
 */
export function railIds(mask, grassGround = true) {
  if (!mask) return [];
  // Grass-ground track sprites already carry their ground; other grounds use the same track art.
  if (mask === 15) return [1017];
  if (mask === 5) return [1012];
  if (mask === 10) return [1011];
  if (mask === 9) return [1013];
  if (mask === 6) return [1014];
  if (mask === 3) return [1015];
  if (mask === 12) return [1016];
  const out = [grassGround ? SPR_FLAT_GRASS : SPR_FLAT_GRASS];
  for (const b of [1, 2, 4, 8]) if (mask & b) out.push(STUB[b]);
  return out;
}

/**
 * Ground-bits name for the diagonal pieces, exposed for tests.
 * @param {number} mask
 * @returns {string|null} 'UPPER'|'LOWER'|'RIGHT'|'LEFT'|null
 */
export function cornerPiece(mask) {
  return { 9: 'UPPER', 6: 'LOWER', 3: 'RIGHT', 12: 'LEFT' }[mask] || null;
}

/**
 * OpenTTD slope name of a tile from our corner heights [hN,hE,hS,hW] (screen corners, OpenTTD
 * N/E/S/W corner bits N=8 E=4 S=2 W=1). Only the four two-corner diagonal slopes are returned
 * (NE = N+E raised, SE = E+S, SW = S+W, NW = W+N); flat, single-corner, 3-corner or steep
 * tiles return null and keep the warped fallback.
 * @param {number[]} c
 * @returns {'NE'|'SE'|'SW'|'NW'|null}
 */
export function twoCornerSlope(c) {
  if (!c || c.length !== 4 || !c.every(Number.isInteger)) return null;
  const lo = Math.min(...c);
  if (c.some((h) => h - lo > 1)) return null;
  const bits = c.map((h) => h - lo);
  const key = bits[0] * 8 + bits[1] * 4 + bits[2] * 2 + bits[3];
  return { 12: 'NE', 6: 'SE', 3: 'SW', 9: 'NW' }[key] || null;
}

/** OpenTTD RailTrackOffset / track_y offsets for the diagonal slopes (rail_cmd.cpp table). */
const SLOPE_TRACK_OFFSET = { NE: 20, SE: 21, SW: 22, NW: 23 };
/** Track axis on a diagonal slope: X (our N|S) on NE/SW, Y (our E|W) on SE/NW. */
const SLOPE_AXIS_MASK = { NE: 5, SE: 10, SW: 5, NW: 10 };

/**
 * Sloped track sprite (1011 + offset) for a straight rail on a diagonal slope, or -1.
 * @param {number} mask rail mask N=1,E=2,S=4,W=8
 * @param {string|null} slope from twoCornerSlope
 * @returns {number}
 */
export function railSlopeId(mask, slope) {
  if (!slope || SLOPE_AXIS_MASK[slope] !== mask) return -1;
  return 1011 + SLOPE_TRACK_OFFSET[slope];
}
