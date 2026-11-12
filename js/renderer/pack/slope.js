/**
 * Slope helpers for OpenGFX ground sprites.
 * Ported from OpenTTD src/landscape.cpp `_slope_to_sprite_offset` (GPL-2.0): the raised-corner
 * bits are W=1, S=2, E=4, N=8 (OpenTTD SLOPE_* bits), which map 1:1 onto our corners
 * [N,E,S,W]. Slope sprite = base + bits, verified against the OpenGFX pixels.
 */

/** Raised-corner bits of a corner height array [hN,hE,hS,hW] relative to its minimum. */
export function slopeBits(c) {
  const m = Math.min(c[0], c[1], c[2], c[3]);
  return (c[0] > m ? 8 : 0) | (c[1] > m ? 4 : 0) | (c[2] > m ? 2 : 0) | (c[3] > m ? 1 : 0);
}
