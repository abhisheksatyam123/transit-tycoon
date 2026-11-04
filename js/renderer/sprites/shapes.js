/**
 * Isometric drawing primitives in tile space.
 * Tile space: u along +x (screen down-right), v along +y (screen down-left), z up in px.
 * Origin = tile centre; a tile spans u,v in [-0.5, 0.5].
 */
import { HALF_W, HALF_H } from '../iso.js';
import { shade } from '../palette.js';

/**
 * Project tile-space point to sprite px.
 * @param {number} u
 * @param {number} v
 * @param {number} z
 * @returns {[number, number]}
 */
export function P(u, v, z = 0) {
  return [(u - v) * HALF_W, (u + v) * HALF_H - z];
}

/**
 * Fill a polygon given as flat [u,v,z, u,v,z, ...].
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[]} pts
 * @param {string} fill
 * @param {string} [stroke]
 */
export function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 3) {
    const sx = (pts[i] - pts[i + 1]) * HALF_W;
    const sy = (pts[i] + pts[i + 1]) * HALF_H - pts[i + 2];
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

/**
 * Flat quad at height z.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u0
 * @param {number} v0
 * @param {number} u1
 * @param {number} v1
 * @param {number} z
 * @param {string} fill
 * @param {string} [stroke]
 */
export function quad(ctx, u0, v0, u1, v1, z, fill, stroke) {
  poly(ctx, [u0, v0, z, u1, v0, z, u1, v1, z, u0, v1, z], fill, stroke);
}

/**
 * Axis-aligned box; draws the two visible side faces and the top.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u0
 * @param {number} v0
 * @param {number} u1
 * @param {number} v1
 * @param {number} z0
 * @param {number} z1
 * @param {string} color base colour (#rrggbb); faces are shaded from it
 * @param {string} [topColor]
 */
export function box(ctx, u0, v0, u1, v1, z0, z1, color, topColor) {
  const edge = 'rgba(0,0,0,0.25)';
  poly(ctx, [u0, v1, z0, u1, v1, z0, u1, v1, z1, u0, v1, z1], shade(color, 0.82), edge);
  poly(ctx, [u1, v0, z0, u1, v1, z0, u1, v1, z1, u1, v0, z1], shade(color, 0.64), edge);
  poly(ctx, [u0, v0, z1, u1, v0, z1, u1, v1, z1, u0, v1, z1], topColor || shade(color, 1.08), edge);
}

/**
 * Gable roof on top of a box footprint.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u0
 * @param {number} v0
 * @param {number} u1
 * @param {number} v1
 * @param {number} z  eave height
 * @param {number} rh ridge height above eave
 * @param {'u'|'v'} ridge axis the ridge runs along
 * @param {string} color
 */
export function gableRoof(ctx, u0, v0, u1, v1, z, rh, ridge, color) {
  const edge = 'rgba(0,0,0,0.3)';
  if (ridge === 'u') {
    const vm = (v0 + v1) / 2;
    poly(ctx, [u0, v0, z, u1, v0, z, u1, vm, z + rh, u0, vm, z + rh], shade(color, 1.12), edge);
    poly(ctx, [u1, v0, z, u1, v1, z, u1, vm, z + rh], shade(color, 0.6), edge);
    poly(ctx, [u0, v1, z, u1, v1, z, u1, vm, z + rh, u0, vm, z + rh], shade(color, 0.85), edge);
  } else {
    const um = (u0 + u1) / 2;
    poly(ctx, [u0, v0, z, u0, v1, z, um, v1, z + rh, um, v0, z + rh], shade(color, 1.12), edge);
    poly(ctx, [u0, v1, z, u1, v1, z, um, v1, z + rh], shade(color, 0.85), edge);
    poly(ctx, [u1, v0, z, u1, v1, z, um, v1, z + rh, um, v0, z + rh], shade(color, 0.66), edge);
  }
}

/**
 * Vertical cylinder (chimney, tank, silo).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u
 * @param {number} v
 * @param {number} r radius in tile units
 * @param {number} z0
 * @param {number} z1
 * @param {string} color
 * @param {number} [topR] optional radius at top (tapered)
 */
export function cylinder(ctx, u, v, r, z0, z1, color, topR = r) {
  const [cx, cy] = P(u, v, 0);
  const rx0 = r * 45, ry0 = r * 22.6, rx1 = topR * 45, ry1 = topR * 22.6;
  const g = ctx.createLinearGradient(cx - rx0, 0, cx + rx0, 0);
  g.addColorStop(0, shade(color, 1.05));
  g.addColorStop(0.5, shade(color, 0.85));
  g.addColorStop(1, shade(color, 0.55));
  ctx.beginPath();
  ctx.moveTo(cx - rx0, cy - z0);
  ctx.ellipse(cx, cy - z0, rx0, ry0, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx1, cy - z1);
  ctx.ellipse(cx, cy - z1, rx1, ry1, 0, 0, Math.PI, true);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy - z1, rx1, ry1, 0, 0, Math.PI * 2);
  ctx.fillStyle = shade(color, 1.15);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

/**
 * A tree (conifer or broadleaf) standing at (u,v).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u
 * @param {number} v
 * @param {number} size scale (1 = ~18px tall)
 * @param {string} color foliage colour
 * @param {boolean} conifer
 */
export function tree(ctx, u, v, size, color, conifer) {
  const [x, y] = P(u, v, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + 2 * size, y, 5 * size, 2.4 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b3b22';
  ctx.fillRect(x - 0.8 * size, y - 5 * size, 1.6 * size, 5 * size);
  if (conifer) {
    for (let i = 0; i < 3; i++) {
      const w = (6 - i * 1.5) * size, base = y - (3 + i * 4) * size, top = base - 7 * size;
      ctx.beginPath();
      ctx.moveTo(x - w, base);
      ctx.lineTo(x, top);
      ctx.lineTo(x + w, base);
      ctx.closePath();
      ctx.fillStyle = shade(color, 0.85 + i * 0.1);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = shade(color, 0.8);
    ctx.beginPath();
    ctx.arc(x, y - 9 * size, 5.5 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x - 1.2 * size, y - 10.2 * size, 4.2 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(color, 1.18);
    ctx.beginPath();
    ctx.arc(x - 2 * size, y - 11.5 * size, 2 * size, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Row of windows on a box face (decorative).
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} face 'v' = south-west face (v = v1), 'u' = south-east face (u = u1)
 * @param {number} a0 start along face
 * @param {number} a1 end along face
 * @param {number} fixed the fixed coordinate (v1 or u1)
 * @param {number} z0 bottom of window row
 * @param {number} n windows
 * @param {string} color
 * @param {number} [wh] window height px
 */
export function windows(ctx, face, a0, a1, fixed, z0, n, color, wh = 3) {
  const step = (a1 - a0) / n;
  for (let i = 0; i < n; i++) {
    const s = a0 + step * (i + 0.25), e = a0 + step * (i + 0.75);
    if (face === 'v') poly(ctx, [s, fixed, z0, e, fixed, z0, e, fixed, z0 + wh, s, fixed, z0 + wh], color);
    else poly(ctx, [fixed, s, z0, fixed, e, z0, fixed, e, z0 + wh, fixed, s, z0 + wh], color);
  }
}
