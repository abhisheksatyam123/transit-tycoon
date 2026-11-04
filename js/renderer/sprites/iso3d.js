/**
 * Small 3-D helpers for vehicle sprites: oriented boxes in tile units (a = along
 * travel axis, b = across), z in screen pixels. Shared by cars, buses, trucks, trains.
 */
import { poly } from './shapes.js';
import { shade } from '../palette.js';

const EDGE = 'rgba(0,0,0,0.3)';

/**
 * Oriented box. axis 'u' => a along u (x), 'v' => a along v (y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} axis
 * @param {number} a0 @param {number} a1 along-axis range
 * @param {number} b0 @param {number} b1 across range
 * @param {number} z0 @param {number} z1 height range (px)
 * @param {string} color @param {string} [top]
 */
export function obox(ctx, axis, a0, a1, b0, b1, z0, z1, color, top) {
  const [u0, u1, v0, v1] = axis === 'u' ? [a0, a1, b0, b1] : [b0, b1, a0, a1];
  poly(ctx, [u0, v1, z0, u1, v1, z0, u1, v1, z1, u0, v1, z1], shade(color, 0.85), EDGE);
  poly(ctx, [u1, v0, z0, u1, v1, z0, u1, v1, z1, u1, v0, z1], shade(color, 0.66), EDGE);
  poly(ctx, [u0, v0, z1, u1, v0, z1, u1, v1, z1, u0, v1, z1], top || shade(color, 1.1), EDGE);
}

/**
 * Ground shadow under a body.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} axis
 * @param {number} len half length
 * @param {number} w half width
 */
export function shadow(ctx, axis, len, w) {
  const pts = axis === 'u' ? [-len, -w, 0, len, -w, 0, len, w, 0, -len, w, 0] : [-w, -len, 0, w, -len, 0, w, len, 0, -w, len, 0];
  poly(ctx, pts, 'rgba(0,0,0,0.28)');
}

/**
 * Orientation for a direction bit: axis of travel and sign (+1 = toward +axis).
 * @param {number} dir
 * @returns {{axis:'u'|'v', s:number}}
 */
export function orient(dir) {
  if (dir === 2) return { axis: 'u', s: 1 };
  if (dir === 8) return { axis: 'u', s: -1 };
  if (dir === 1) return { axis: 'v', s: -1 };
  return { axis: 'v', s: 1 };
}

/**
 * Small lamp / light patch on the front (sgn=+1) or rear (sgn=-1) end face.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} axis
 * @param {number} sgn
 * @param {number} end half length of the body at this end
 * @param {number} b0 @param {number} b1 across range
 * @param {number} z0 @param {number} z1
 * @param {string} color
 */
export function lamp(ctx, axis, sgn, end, b0, b1, z0, z1, color) {
  const a = sgn * end;
  obox(ctx, axis, a - 0.006, a + 0.006, b0, b1, z0, z1, color, color);
}

/**
 * Four wheels on both sides at the given half-length fractions.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} axis
 * @param {number} len half length
 * @param {number} w half width
 * @param {number} r wheel radius in px (height)
 * @param {number} wheelLen wheel length along axis
 */
export function wheels(ctx, axis, len, w, r, wheelLen) {
  for (const a of [-len * 0.62, len * 0.62]) {
    for (const b of [-w, w]) obox(ctx, axis, a - wheelLen / 2, a + wheelLen / 2, b - 0.012, b + 0.012, 0, r, '#141414');
  }
}
