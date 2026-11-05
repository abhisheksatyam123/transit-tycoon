/**
 * Continuous road ribbon (OpenGFX look): pavement strips for town/avenue roads, kerb lines, asphalt
 * with a dashed white centre line. Geometry is screen space; dash phase uses the edge arc length so
 * dashes run unbroken across tiles. Ported from OpenLoco's road layering (MIT, see r6-contract.md);
 * no OpenLoco graphics are used.
 */
/** Screen pixels per tile unit (ribbon widths are tile-space numbers times this). */
export const PX = 40;
/** Dash period/duty along the arc (tile units). */
const DASH_PERIOD = 0.24, DASH_ON = 0.12;
/** Road full width per class (tile units), 0 local / 1 motorway / 2 primary / 3 secondary. */
const WIDTH = [0.5, 0.62, 0.56, 0.5];

/**
 * Stroke a flat screen polyline.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} S flat [x,y,...]
 * @param {number} n point count
 * @param {string} colour
 * @param {number} lw line width px
 */
export function strokePoly(ctx, S, n, colour, lw) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(S[0], S[1]);
  for (let k = 1; k < n; k++) ctx.lineTo(S[2 * k], S[2 * k + 1]);
  ctx.stroke();
}

/**
 * Dashed centre line along the edge arc.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float32Array} len cumulative arc length of the edge (tile units)
 * @param {number} i0 first edge point index of S[0]
 * @param {Float32Array} S flat screen points
 * @param {number} n point count
 * @param {string} colour
 * @param {number} lw width px
 */
const JUNCTION_TRIM = 0.22;
function dashes(ctx, len, i0, S, n, colour, lw) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = lw;
  ctx.beginPath();
  // edge ends sit on junction nodes: keep centre dashes out of the junction fillet area
  const lo = len[0] + JUNCTION_TRIM, hi = len[len.length - 1] - JUNCTION_TRIM;
  for (let k = 0; k + 1 < n; k++) {
    let a0 = len[i0 + k], a1 = len[i0 + k + 1];
    if (a1 <= lo || a0 >= hi) continue;
    a0 = Math.max(a0, lo); a1 = Math.min(a1, hi);
    const sl = len[i0 + k + 1] - len[i0 + k];
    if (!(a1 > a0) || !(sl > 0)) continue;
    const ax = S[2 * k], ay = S[2 * k + 1], dx = S[2 * k + 2] - ax, dy = S[2 * k + 3] - ay;
    let s = a0;
    while (s < a1) {
      const ph = s % DASH_PERIOD;
      const on = ph < DASH_ON;
      let e1 = Math.min(a1, s + (on ? DASH_ON - ph : DASH_PERIOD - ph));
      if (e1 <= s) e1 = s + 1e-5;
      if (on) {
        const t0 = (s - len[i0 + k]) / sl, t1 = (e1 - len[i0 + k]) / sl;
        ctx.moveTo(ax + dx * t0, ay + dy * t0);
        ctx.lineTo(ax + dx * t1, ay + dy * t1);
      }
      s = e1;
    }
  }
  ctx.stroke();
}

/**
 * Draw one road span (screen-space points) for one tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{len: Float32Array}} e edge (arc length source)
 * @param {number} i0 index of the first point of S in e
 * @param {Float32Array} S flat screen points
 * @param {number} n point count
 * @param {boolean} paved town street / avenue: pavement both sides
 * @param {number} cls road class (tile.avenue|0)
 * @param {boolean} ogfx OpenGFX palette (else procedural palette)
 * @param {boolean} [hwy] highway tile: full-tile 4-lane carriageway with a grass median + dashed lane lines
 */
export function drawRoadSpan(ctx, e, i0, S, n, paved, cls, ogfx, hwy) {
  if (n < 2) return;
  const w = (WIDTH[cls] || WIDTH[0]) * PX;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  if (paved) strokePoly(ctx, S, n, ogfx ? '#9c9c9c' : '#aaa59b', w + 7);
  else strokePoly(ctx, S, n, ogfx ? '#4f6b35' : '#5c7a42', w + 3);
  strokePoly(ctx, S, n, '#6e6e6e', w + 1.6); // kerb line both sides
  strokePoly(ctx, S, n, ogfx ? '#4b4f55' : '#55595f', w); // asphalt
  if (hwy) {
    const hw = 0.52 * PX; // full-tile carriageway (two lanes a side + edge lines)
    strokePoly(ctx, S, n, ogfx ? '#4b4f55' : '#55595f', hw);
    // centre median (grass strip + kerb edges)
    strokePoly(ctx, S, n, '#6e6e6e', 0.16 * PX);
    strokePoly(ctx, S, n, ogfx ? '#4f6b35' : '#5c7a42', 0.12 * PX);
    dashes(ctx, e.len, i0, S, n, '#ececec', 1.1);
    return;
  }
  dashes(ctx, e.len, i0, S, n, '#ececec', 1.3);
}
