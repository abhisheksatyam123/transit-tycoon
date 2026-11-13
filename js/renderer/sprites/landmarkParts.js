/**
 * Shared drawing parts for landmark sprites: onion domes, stars, convex-hull bands,
 * facade bands. All coordinates are footprint-centred tile space (see sprites/landmarks.js);
 * the caller has already translated ctx so P(u,v,z) lands in the right place.
 */
import { P } from './shapes.js';
import { shade } from '../palette.js';

export const GOLD = '#f5c542';

/**
 * Onion dome on a base centre (u,v,z); r = base radius px, h = height px.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u
 * @param {number} v
 * @param {number} z
 * @param {number} r
 * @param {number} h
 * @param {string} color
 * @param {string[]} [stripes] optional swirl colours (painted as spiral arcs)
 */
export function dome(ctx, u, v, z, r, h, color, stripes) {
  const [cx, cy] = P(u, v, z);
  const g = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, shade(color, 0.6));
  g.addColorStop(0.4, shade(color, 1.2));
  g.addColorStop(1, shade(color, 0.6));
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.bezierCurveTo(cx - r * 1.15, cy - h * 0.45, cx - r * 0.7, cy - h * 0.85, cx - r * 0.2, cy - h);
  ctx.lineTo(cx + r * 0.2, cy - h);
  ctx.bezierCurveTo(cx + r * 0.7, cy - h * 0.85, cx + r * 1.15, cy - h * 0.45, cx + r, cy);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  if (stripes) {
    for (let i = 0; i < stripes.length; i++) {
      const f = (i + 0.5) / stripes.length;
      ctx.strokeStyle = stripes[i];
      ctx.lineWidth = Math.max(1.2, r * 0.22);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.95 * (1 - f * 0.4), cy - h * 0.05);
      ctx.quadraticCurveTo(cx, cy - h * (0.5 + f * 0.3), cx + r * 0.95 * (1 - f * 0.4), cy - h * 0.25);
      ctx.stroke();
    }
  }
  ctx.fillStyle = GOLD;
  ctx.fillRect(cx - 0.6, cy - h - 6, 1.2, 6);
  ctx.fillRect(cx - 2.2, cy - h - 4.5, 4.4, 1.2);
}

/**
 * Five-pointed star centred at px (cx,cy) of tile-space point (u,v,z).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u
 * @param {number} v
 * @param {number} z
 * @param {number} r outer radius px
 * @param {string} color
 */
export function star(ctx, u, v, z, r, color) {
  const [cx, cy] = P(u, v, z);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Screen-space points of an ellipse (tile-space radii a,b) at height z. */
function ellipsePts(a, b, z, n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(P(a * Math.cos(t), b * Math.sin(t), z));
  }
  return pts;
}

/** Convex hull (monotone chain) of [x,y] points. */
function hull(pts) {
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

/**
 * Filled silhouette of an elliptical prism between heights z0 and z1 (convex, so the hull is exact).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} a
 * @param {number} b
 * @param {number} z0
 * @param {number} z1
 * @param {string} color
 */
export function ovalPrism(ctx, a, b, z0, z1, color) {
  const h = hull(ellipsePts(a, b, z0).concat(ellipsePts(a, b, z1)));
  ctx.beginPath();
  h.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Filled ellipse cap at height z. */
export function ovalCap(ctx, a, b, z, color, u0 = 0, v0 = 0) {
  const pts = ellipsePts(a, b, z).map(([x, y]) => [x + P(u0, v0, 0)[0], y + P(u0, v0, 0)[1]]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Horizontal floors lines on a box's two visible faces (v1 face and u1 face).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u0 @param {number} v0 @param {number} u1 @param {number} v1
 * @param {number} z0 @param {number} z1 @param {number} step px
 * @param {string} color
 */
export function floors(ctx, u0, v0, u1, v1, z0, z1, step, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let z = z0 + step; z < z1; z += step) {
    const a = P(u0, v1, z), b = P(u1, v1, z), c = P(u1, v0, z);
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
  }
  ctx.stroke();
}
