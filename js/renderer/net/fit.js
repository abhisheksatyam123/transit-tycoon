/**
 * Locomotion-style path smoothing for the net renderer (render-only).
 * Curve radii are taken from OpenLoco's track/road subposition data (MIT, https://github.com/OpenLoco/OpenLoco;
 * see locoPieces.js / tools/openloco/extract.js): rail curves small 1.41, normal 2.49 tiles, 45° large curve
 * 3.41 tiles; road curve small 1.20 tiles.
 * Steps: (1) keep the exact endpoints on the node tiles' edge midpoints plus a 0.5-tile axis-aligned lead in/out;
 * (2) Douglas-Peucker the boundary-midpoint path (eps ~0.6 tile): staircases become straight 45° diagonals and
 * shallow runs of 1-tile jogs become one straight line instead of a zig-zag; (3) fillet each remaining vertex
 * with a circular arc (OpenLoco radius, limited by half of each adjacent straight); (4) resample at <= 0.125 tile.
 */
import { LOCO_PIECES } from './locoPieces.js';

const pieceRadius = (name, def) => {
  const p = LOCO_PIECES.find((q) => q.name === name);
  return p && Number.isFinite(p.radius) ? p.radius : def;
};
/** OpenLoco radii (tiles). */
export const RADII = {
  railCurve: pieceRadius('T6R0D0', 2.49), // normal 90° curve
  railCurveSmall: pieceRadius('T4R0D0', 1.41),
  railLarge45: pieceRadius('T8R0D0', 3.41), // 45° large curve (straight <-> diagonal)
  roadCurve: pieceRadius('TA0L0T3R0D0', 1.2),
};
const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const DP_EPS = 0.62;
/** Rail uses a wider DP tolerance so mainline S-wobbles collapse into straight runs (render-only). */
export const DP_EPS_RAIL = 0.9;
const STEP = 0.125;

/** Douglas-Peucker on [[x,y],...] keeping endpoints; returns kept points. */
export function simplify(pts, eps) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Max radius for a turn of angle th (radians) on this kind of path. */
function maxRadius(kind, th, cls) {
  if (kind === 'rail') return th < 0.9 ? RADII.railLarge45 : RADII.railCurve;
  const r = RADII.roadCurve * (cls === 1 ? 1.8 : 1);
  return th < 0.9 ? r * 1.6 : r;
}

/** Push points from a to b at <= STEP spacing (excluding a, including b). */
function line(out, a, b) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(L / STEP));
  for (let k = 1; k <= n; k++) out.push(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n);
}

/**
 * Smooth a boundary-midpoint path.
 * @param {number[]} raw flat [x0,y0,...]
 * @param {{kind:'road'|'rail', loop?:boolean, steps?:number[], cls?:number}} opts steps = travel direction index
 *   (0 N,1 E,2 S,3 W) of each raw step; steps[0] enters the first tile, steps[last] enters the end node.
 * @returns {number[]} flat smoothed points (first/last equal raw first/last)
 */
export function smoothPath(raw, opts = {}) {
  const n = raw.length / 2;
  if (n < 2) return raw.slice();
  const P = [];
  for (let i = 0; i < n; i++) P.push([raw[2 * i], raw[2 * i + 1]]);
  const steps = opts.steps;
  let core = P;
  if (!opts.loop && steps && steps.length >= 2) {
    const d0 = DIR[steps[0]], d1 = DIR[steps[steps.length - 1]];
    const A = [P[0][0] + d0[0] * 0.5, P[0][1] + d0[1] * 0.5]; // first tile centre-line, axis aligned lead
    const B = [P[n - 1][0] - d1[0] * 0.5, P[n - 1][1] - d1[1] * 0.5];
    core = [A, ...P.slice(1, n - 1), B];
    core = simplifyChain(core, opts, P, d0, d1);
    core = [P[0], ...core, P[n - 1]];
  } else {
    core = simplifyChain(P, opts, P, null, null);
  }
  // drop duplicate points
  const Q = [core[0]];
  for (let i = 1; i < core.length; i++) {
    const q = Q[Q.length - 1];
    if (Math.hypot(core[i][0] - q[0], core[i][1] - q[1]) > 1e-6) Q.push(core[i]);
  }
  const out = [Q[0][0], Q[0][1]];
  if (Q.length === 2) { line(out, Q[0], Q[1]); return out; }
  const lens = [];
  for (let i = 0; i + 1 < Q.length; i++) lens.push(Math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]));
  // tangent length available at each vertex end of each segment: half the segment, whole lead segments
  const lastSeg = lens.length - 1;
  const share = (si) => (si === 0 || si === lastSeg ? 1 : 0.5) * lens[si];
  let cur = Q[0];
  for (let i = 1; i < Q.length - 1; i++) {
    const a = Q[i - 1], v = Q[i], b = Q[i + 1];
    const ux = (v[0] - a[0]) / lens[i - 1], uy = (v[1] - a[1]) / lens[i - 1];
    const wx = (b[0] - v[0]) / lens[i], wy = (b[1] - v[1]) / lens[i];
    const cr = ux * wy - uy * wx, dt = ux * wx + uy * wy;
    const th = Math.atan2(Math.abs(cr), dt);
    if (th < 1e-3) continue;
    const tan2 = Math.tan(th / 2);
    let t = maxRadius(opts.kind, th, opts.cls | 0) * tan2;
    t = Math.min(t, share(i - 1), share(i));
    const R = t / tan2;
    const p0 = [v[0] - ux * t, v[1] - uy * t];
    line(out, cur, p0);
    // arc from p0 to p1 around centre c (left normal for cr > 0)
    const s = cr > 0 ? 1 : -1;
    const cx = p0[0] - uy * R * s, cy = p0[1] + ux * R * s;
    const a0 = Math.atan2(p0[1] - cy, p0[0] - cx);
    const arcN = Math.max(2, Math.ceil((R * th) / STEP));
    for (let k = 1; k <= arcN; k++) {
      const ang = a0 + s * th * (k / arcN);
      out.push(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    }
    cur = [out[out.length - 2], out[out.length - 1]];
  }
  line(out, cur, Q[Q.length - 1]);
  out[out.length - 2] = Q[Q.length - 1][0]; out[out.length - 1] = Q[Q.length - 1][1];
  return relax(out, opts.kind === 'rail' ? SMOOTH_W.rail : SMOOTH_W.road);
}

/** Road DP tolerances tried in order (tiles); a wider one is kept only if the result stays in the chain's tiles. */
export const ROAD_EPS_LADDER = [DP_EPS, 0.8, 1.0];

/**
 * Simplify a centreline. Rail: unchanged (DP_EPS_RAIL). Road: adaptive tolerance so long slanted
 * streets built from 1-tile jogs collapse into straight/gently curved runs, but only while every
 * sampled point of the simplified line stays inside a tile of the chain (|dx|,|dy| <= 0.5 of a centre).
 * @param {number[][]} pts polyline [[x,y],...] to simplify (already includes the lead-ins for non-loops)
 * @param {object} opts smoothPath options (kind, map, tiles, loop)
 * @param {number[][]} P raw boundary-midpoint path (for node-centre bookkeeping)
 * @param {number[]|null} d0 first travel direction vector, d1 last
 */
function simplifyChain(pts, opts, P, d0, d1) {
  if (opts.kind === 'rail' || !opts.map) return simplify(pts, opts.kind === 'rail' ? DP_EPS_RAIL : DP_EPS);
  const W = opts.map.width;
  const cells = new Set();
  for (const t of opts.tiles || []) cells.add(((t / W) | 0) * 100000 + (t % W));
  // node tile centres at the chain ends (boundary midpoint + half a tile back into the node)
  if (d0) cells.add(Math.round(P[0][1] - d0[1] * 0.5) * 100000 + Math.round(P[0][0] - d0[0] * 0.5));
  if (d1) { const q = P[P.length - 1]; cells.add(Math.round(q[1] + d1[1] * 0.5) * 100000 + Math.round(q[0] + d1[0] * 0.5)); }
  const inside = (x, y) => cells.has(Math.round(y) * 100000 + Math.round(x));
  let best = null;
  for (const eps of ROAD_EPS_LADDER) {
    const out = simplify(pts, eps);
    if (eps === DP_EPS) { best = out; continue; }
    let ok = out.length > 1 && cells.size > 0;
    for (let i = 0; ok && i + 1 < out.length; i++) {
      const [ax, ay] = out[i], [bx, by] = out[i + 1];
      const L = Math.hypot(bx - ax, by - ay), m = Math.max(1, Math.ceil(L / 0.1));
      for (let k = 0; k <= m && ok; k++) {
        const x = ax + (bx - ax) * k / m, y = ay + (by - ay) * k / m;
        if (!inside(x, y)) ok = false;
      }
    }
    if (ok) best = out;
  }
  return best;
}

/** Half-window (tiles) of the final centreline relaxation: rounds DP zig-zags on player curves/circles. */
export const SMOOTH_W = { road: 1.0, rail: 2.0 };

/**
 * Resample at exactly STEP and apply two passes of a tapered moving average (half-window w tiles,
 * shrinking to 0 at the 0.5-tile lead in/out, which stays exact so tiles still meet axis-aligned). Straight runs and
 * 1:1 staircase diagonals are unchanged; corners and jogs become smooth curves. Render-only.
 * @param {number[]} pts flat points @param {number} w @returns {number[]}
 */
export function relax(pts, w) {
  const n = pts.length / 2;
  if (n < 3 || !(w > 0)) return pts;
  const R = [pts[0], pts[1]];
  let carry = 0;
  for (let k = 1; k < n; k++) {
    const ax = pts[2 * k - 2], ay = pts[2 * k - 1], bx = pts[2 * k], by = pts[2 * k + 1];
    const L = Math.hypot(bx - ax, by - ay);
    let s = STEP - carry;
    while (s <= L) { R.push(ax + (bx - ax) * s / L, ay + (by - ay) * s / L); s += STEP; }
    carry = L - (s - STEP);
  }
  if (Math.hypot(R[R.length - 2] - pts[2 * n - 2], R[R.length - 1] - pts[2 * n - 1]) > 1e-6) R.push(pts[2 * n - 2], pts[2 * n - 1]);
  else { R[R.length - 2] = pts[2 * n - 2]; R[R.length - 1] = pts[2 * n - 1]; }
  const m = R.length / 2, H = Math.max(1, Math.round(w / STEP));
  let A = R;
  for (let pass = 0; pass < 2; pass++) {
    const B = A.slice();
    const K = Math.min(Math.round(0.5 / STEP), (m - 1) >> 1); // keep the 0.5-tile lead in/out exact
    for (let i = K + 1; i < m - 1 - K; i++) {
      const h = Math.min(H, i - K, m - 1 - K - i);
      let sx = 0, sy = 0;
      for (let j = i - h; j <= i + h; j++) { sx += A[2 * j]; sy += A[2 * j + 1]; }
      B[2 * i] = sx / (2 * h + 1); B[2 * i + 1] = sy / (2 * h + 1);
    }
    A = B;
  }
  return A;
}
