/**
 * Measured OpenGFX sprite tables (temperate). Derived from the sprite pixels with
 * scratchpad/ogfx/slopefit.mjs and edgefit2.mjs, not from OpenTTD bit names, so they match
 * the screen. Screen directions: N = upper-right edge, E = lower-right, S = lower-left, W = upper-left.
 */

/**
 * Slope sprite (3981 + k) raised corners, screen order [N,E,S,W] (1 = raised by one level).
 * Index k = bits N=8, E=4, S=2, W=1 of the raised set (k = 8*N + 4*E + 2*S + W).
 * Sprites 3981-3988 flat-ish (raises on E/S), 3989-3995 raised on N, 3996-3999 steep-like.
 * Measured raise set per sprite id (see slopefit.mjs).
 */
export const SLOPE_RAISE = {
  3981: [0, 0, 0, 0], 3982: [0, 0, 0, 1], 3983: [0, 0, 1, 0], 3984: [0, 0, 1, 1],
  3985: [0, 1, 0, 0], 3986: [0, 1, 0, 1], 3987: [0, 1, 1, 0], 3988: [0, 1, 1, 1],
  3989: [1, 0, 0, 0], 3990: [1, 0, 0, 1], 3991: [1, 0, 1, 0], 3992: [1, 0, 1, 1],
  3993: [1, 1, 0, 0], 3994: [1, 1, 0, 1], 3995: [1, 1, 1, 0],
};

/**
 * Road sprite per measured screen-edge set (paved city 1313+, grass 1332+). Keys are edge letters
 * from the list N E S W; a value is the sprite id offset from the grass base (1332).
 */
export const ROAD_BY_EDGES = {
  EW: 0, NS: 1, NESW: 2, NEW: 3, NSW: 4, ESW: 5, NES: 6, SW: 7, NW: 8, NE: 9, ES: 10,
  N: 15, E: 16, S: 17, W: 18,
};

/** Rail base sprites: 1011 = Y (NS-ish), 1012 = X; see stub sprites for arms. */
export const RAIL_STUB = { N: 1007, S: 1008, E: 1009, W: 1010 };
