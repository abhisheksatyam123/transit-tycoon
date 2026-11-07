/**
 * Road/rail corner geometry shared by the transport sprites (render-only).
 * A 2-bit corner (N+E, E+S, S+W, W+N) is either an arc (isolated 90° turn) or, when it is part of
 * a staircase (a neighbour across one of its edges is the point-reflected corner), a straight
 * 45° chamfer through the two edge midpoints. Staircase chamfers share their midpoints, so they
 * join into one straight diagonal.
 */

/** Edge midpoints per direction bit in tile space (N=1,E=2,S=4,W=8). */
export const EDGE = { 1: [0, -0.5], 2: [0.5, 0], 4: [0, 0.5], 8: [-0.5, 0] };
export const OPP = { 1: 4, 2: 8, 4: 1, 8: 2 };
export const BITS = [1, 2, 4, 8];

/** Variant flags (road sprites). */
export const V_CHAMFER = 1; // corner drawn as diagonal chamfer
export const V_BRIDGE = 2; // road deck over water: railings + posts
export const V_SEP = 4; // grade separated road deck over rails: parapet, no posts
export const V_RCHAMFER = 8; // (crossings only) rail corner drawn as chamfer
export const V_BARRED = 16; // (crossings only) barriers closed across the road (levelCrossing.js)

/** Half-extension (tile units) of a chamfer past its edge midpoints; clipped to the tile. */
const CHAMFER_EXT = 0.5;

/** Two-bit corner masks -> [bitA, bitB]. */
export const CORNER = { 3: [1, 2], 6: [2, 4], 12: [4, 8], 9: [8, 1] };

/**
 * Point reflection of a mask (N<->S, E<->W). The staircase neighbour of a corner is the reflected corner.
 * @param {number} m
 */
export function reflectMask(m) {
  return ((m & 1) << 2) | ((m & 4) >> 2) | ((m & 2) << 2) | ((m & 8) >> 2);
}

/**
 * Whether a 2-bit corner is a staircase step (chamfer). Neighbour masks as seen from the tile:
 * n = tile to the north (y-1), e = east (x+1), s = south (y+1), w = west (x-1).
 * @returns {number} 1 chamfer, 0 arc / not a corner
 */
export function chamferFlag(mask, n, e, s, w) {
  if (CORNER[mask] === undefined) return 0;
  const r = reflectMask(mask);
  return n === r || e === r || s === r || w === r ? 1 : 0;
}

/**
 * Centre line of a corner in tile space: a 2-point chord (chamfer, extended past both midpoints)
 * or an 11-point quarter arc around the shared corner vertex (radius 0.5).
 * @param {number} mask corner mask
 * @param {boolean} chamfer
 * @returns {number[][]}
 */
export function cornerLine(mask, chamfer) {
  const [a, b] = CORNER[mask];
  const pa = EDGE[a], pb = EDGE[b];
  if (chamfer) {
    const du = pb[0] - pa[0], dv = pb[1] - pa[1];
    const l = Math.hypot(du, dv);
    const tu = du / l, tv = dv / l;
    return [[pa[0] - tu * CHAMFER_EXT, pa[1] - tv * CHAMFER_EXT], [pb[0] + tu * CHAMFER_EXT, pb[1] + tv * CHAMFER_EXT]];
  }
  const cu = pa[0] + pb[0], cv = pa[1] + pb[1];
  const a0 = Math.atan2(pa[1] - cv, pa[0] - cu);
  let d = Math.atan2(pb[1] - cv, pb[0] - cu) - a0;
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = a0 + (d * i) / 10;
    pts.push([cu + Math.cos(t) * 0.5, cv + Math.sin(t) * 0.5]);
  }
  return pts;
}
