/**
 * Continuous rail ribbon (Locomotion/OpenTTD-like): ballast bed, dark sleepers spaced along the arc,
 * two steel rails. Geometry is screen space; sleeper phase uses the edge arc length so sleepers
 * run unbroken across tiles. Layering follows OpenLoco's PaintTrack order (ballast, sleepers, rails);
 * MIT-licensed reference, no OpenLoco graphics used.
 */
import { PX, strokePoly } from './drawRoad.js';

/** Ballast full width (tile units). */
const BALLAST = 0.42;
/** Sleeper spacing (tile units) and half length (tile units). */
const SLEEPER = 0.12, SLEEPER_HALF = 0.14;
/** Rail offset from the centreline (tile units). */
const RAIL_OFF = 0.09;

/**
 * Draw one rail span (screen-space points) for one tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{len: Float32Array}} e edge (arc length source)
 * @param {number} i0 index of S[0] in e
 * @param {Float32Array} S flat screen points
 * @param {number} n point count
 * @param {boolean} ogfx OpenGFX palette
 */
export function drawRailSpan(ctx, e, i0, S, n, ogfx) {
  if (n < 2) return;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  strokePoly(ctx, S, n, ogfx ? '#7d7466' : '#8a7f6c', BALLAST * PX);
  sleepers(ctx, e.len, i0, S, n);
  const off = RAIL_OFF * PX;
  for (const side of [-1, 1]) {
    const R = offsetLine(S, n, side * off);
    strokePoly(ctx, R, n, '#3a3a3a', 2.6);
    strokePoly(ctx, R, n, '#dfe3e8', 1.3);
  }
}

/** Sleepers at arc positions m*SLEEPER, perpendicular to the local direction. */
function sleepers(ctx, len, i0, S, n) {
  ctx.strokeStyle = '#4d3320';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  const h = SLEEPER_HALF * PX;
  for (let k = 0; k + 1 < n; k++) {
    const a0 = len[i0 + k], a1 = len[i0 + k + 1], sl = a1 - a0;
    if (!(sl > 0)) continue;
    const ax = S[2 * k], ay = S[2 * k + 1], dx = S[2 * k + 2] - ax, dy = S[2 * k + 3] - ay;
    const ln = Math.hypot(dx, dy);
    if (!ln) continue;
    const nx = (-dy / ln) * h, ny = (dx / ln) * h;
    for (let m = Math.ceil(a0 / SLEEPER - 1e-6); m * SLEEPER < a1; m++) {
      const t = (m * SLEEPER - a0) / sl;
      const px = ax + dx * t, py = ay + dy * t;
      ctx.moveTo(px - nx, py - ny);
      ctx.lineTo(px + nx, py + ny);
    }
  }
  ctx.stroke();
}

/**
 * Polyline offset by `d` px along the screen normal (averaged over neighbouring segments).
 * @returns {Float32Array}
 */
function offsetLine(S, n, d) {
  const R = new Float32Array(2 * n);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const tx = S[2 * b] - S[2 * a], ty = S[2 * b + 1] - S[2 * a + 1];
    const ln = Math.hypot(tx, ty) || 1;
    R[2 * k] = S[2 * k] - (ty / ln) * d;
    R[2 * k + 1] = S[2 * k + 1] + (tx / ln) * d;
  }
  return R;
}
