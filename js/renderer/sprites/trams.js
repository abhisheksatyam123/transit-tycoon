/**
 * Procedural articulated tram (OpenGFX has no tram sprites). Two car bodies joined over a bogie,
 * company-coloured with a cream band; the electric tram adds a roof pantograph.
 */
import { obox, shadow, wheels, lamp } from './iso3d.js';
import { shade } from '../palette.js';

const GLASS = '#1e2a38';
const CREAM = '#f8fafc';

/**
 * Draw one tram segment (articulated: 2 car bodies, long).
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} axis
 * @param {number} s travel sign (+1 toward +axis)
 * @param {boolean} electric pantograph on the roof
 * @param {string} [liv] company colour (#rrggbb); default tram red
 */
export function drawTram(ctx, axis, s, electric, liv) {
  const body = liv && liv[0] === '#' ? liv : '#b91c1c';
  const L = 0.36, W = 0.075, H = 11;
  shadow(ctx, axis, L + 0.02, W + 0.03);
  wheels(ctx, axis, L, W, 2.4, 0.05);
  // two car bodies and the articulation joint over the bogie
  obox(ctx, axis, -L, -0.03, -W, W, 1.5, H, body, shade(body, 1.06));
  obox(ctx, axis, 0.03, L, -W, W, 1.5, H, body, shade(body, 1.06));
  obox(ctx, axis, -0.035, 0.035, -W * 0.8, W * 0.8, 1.5, H - 2.5, '#374151');
  // glass band and cream stripe along both sides
  obox(ctx, axis, -L * 0.86, -0.07, -W - 0.004, W + 0.004, H * 0.5, H * 0.8, GLASS);
  obox(ctx, axis, 0.07, L * 0.86, -W - 0.004, W + 0.004, H * 0.5, H * 0.8, GLASS);
  obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, H * 0.28, H * 0.34, CREAM);
  // windscreen and lamps on the front car
  obox(ctx, axis, s > 0 ? L - 0.01 : -L - 0.005, s > 0 ? L + 0.005 : -L + 0.01, -W * 0.75, W * 0.75, 2.5, H * 0.8, GLASS);
  lamp(ctx, axis, s, L, -W * 0.7, -W * 0.3, 2, 3.5, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.3, W * 0.7, 2, 3.5, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.7, -W * 0.3, 2, 3.5, '#ef4444');
  lamp(ctx, axis, -s, L, W * 0.3, W * 0.7, 2, 3.5, '#ef4444');
  // roof: pantograph (electric) or a small roof vent (horse)
  if (electric) {
    obox(ctx, axis, -0.012, 0.012, -0.004, 0.004, H, H + 7, '#111827');
    obox(ctx, axis, -0.05, 0.05, -W * 0.5, W * 0.5, H + 7, H + 8, '#111827');
  } else {
    obox(ctx, axis, -0.08, 0.08, -W * 0.4, W * 0.4, H, H + 1.5, '#9ca3af');
  }
}
