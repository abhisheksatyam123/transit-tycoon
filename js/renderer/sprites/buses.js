/**
 * Road vehicle bodies (buses, coaches, trolleybus, trucks) drawn in tile space.
 * Each draw fn receives (ctx, axis, s, cargo, fill, rnd) and paints one segment.
 */
import { obox, shadow, wheels, lamp } from './iso3d.js';
import { cargoColor } from './cargoColors.js';
import { shade } from '../palette.js';

const GLASS = '#1e2a38';
/** Mosgortrans-style liveries: [body, stripe]. */
export const BUS_LIVERIES = [['#f8fafc', '#1d4ed8'], ['#f8fafc', '#15803d'], ['#fde047', '#1f2937'], ['#e2e8f0', '#dc2626']];

/** Window strip along the sides of a bus body. */
function windowStrip(ctx, axis, a0, a1, z0, z1, w) {
  obox(ctx, axis, a0, a1, -w - 0.004, w + 0.004, z0, z1, GLASS);
}

/**
 * Standard city bus / minibus-style body.
 * @param {number} L half length @param {number} W half width @param {number} H height
 */
function busBody(ctx, axis, s, L, W, H, body, stripe, articulated) {
  shadow(ctx, axis, L + 0.02, W + 0.03);
  wheels(ctx, axis, L, W, 2.6, 0.06);
  if (articulated) {
    // accordion joint: rear box is narrower and lower
    obox(ctx, axis, -L, -0.02, -W, W, 1.5, H, body, shade(body, 1.05));
    obox(ctx, axis, 0.01, L, -W * 0.9, W * 0.9, 2, H - 1.5, body, shade(body, 1.05));
    obox(ctx, axis, -0.03, 0.03, -W * 0.8, W * 0.8, 1.5, H - 1, '#374151');
  } else {
    obox(ctx, axis, -L, L, -W, W, 1.5, H, body, shade(body, 1.06));
  }
  windowStrip(ctx, axis, -L * 0.82, L * 0.82, H * 0.45, H * 0.82, W);
  obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, H * 0.3, H * 0.36, stripe);
  // windscreen on front end
  obox(ctx, axis, (s > 0 ? L - 0.01 : -L - 0.005), (s > 0 ? L + 0.005 : -L + 0.01), -W * 0.75, W * 0.75, 2.5, H * 0.8, GLASS);
  lamp(ctx, axis, s, L, -W * 0.7, -W * 0.3, 2, 3.5, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.3, W * 0.7, 2, 3.5, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.7, -W * 0.3, 2, 3.5, '#ef4444');
  lamp(ctx, axis, -s, L, W * 0.3, W * 0.7, 2, 3.5, '#ef4444');
}

/**
 * City bus model. variant: 0 = city omnibus, 1 = express coach, 2 = modern articulated.
 * @param {number} variant
 * @param {number} livery index into BUS_LIVERIES
 * @param {string} [override] optional body colour (scenario livery)
 */
export function drawBus(ctx, axis, s, variant, livery, override) {
  const [body0, stripe] = BUS_LIVERIES[livery % BUS_LIVERIES.length];
  const body = override || body0;
  if (variant === 1) {
    // coach: longer, higher, tinted glass band, roof luggage
    busBody(ctx, axis, s, 0.25, 0.085, 9, body, '#1e3a8a', false);
    obox(ctx, axis, -0.12, 0.12, -0.06, 0.06, 9, 10.5, '#94a3b8');
  } else if (variant === 2) {
    busBody(ctx, axis, s, 0.27, 0.088, 10, body, stripe, true);
  } else {
    busBody(ctx, axis, s, 0.23, 0.092, 9, body, stripe, false);
  }
}

/**
 * Trolleybus: bus body with two poles to the overhead wire.
 */
export function drawTrolley(ctx, axis, s, livery) {
  const [body, stripe] = BUS_LIVERIES[livery % BUS_LIVERIES.length];
  busBody(ctx, axis, s, 0.25, 0.09, 9.5, body, stripe, false);
  obox(ctx, axis, -0.05, -0.02, -0.01, 0.01, 9.5, 13, '#4b5563');
  obox(ctx, axis, 0.02, 0.05, -0.01, 0.01, 9.5, 13, '#4b5563');
  obox(ctx, axis, -0.06, 0.06, -0.005, 0.005, 13, 13.5, '#111827');
}

/** Truck cab (front) + frame, shared by all truck bodies. */
function truckFrame(ctx, axis, s, L, W, cabCol) {
  shadow(ctx, axis, L + 0.022, W + 0.032);
  wheels(ctx, axis, L, W, 2.7, 0.062);
  const cab0 = s > 0 ? L * 0.5 : -L, cab1 = s > 0 ? L : -L * 0.5;
  obox(ctx, axis, -L, L, -W * 0.9, W * 0.9, 1.4, 3.6, '#27272a');
  obox(ctx, axis, cab0, cab1, -W, W, 3.2, 9.4, cabCol, shade(cabCol, 1.12));
  obox(ctx, axis, s > 0 ? L * 0.76 : -L * 0.94, s > 0 ? L * 0.94 : -L * 0.76, -W * 0.82, W * 0.82, 5.2, 8.2, GLASS);
  obox(ctx, axis, cab0, cab1, -W - 0.003, W + 0.003, 3.2, 4.2, shade(cabCol, 0.78));
  obox(ctx, axis, s > 0 ? L - 0.012 : -L - 0.004, s > 0 ? L + 0.004 : -L + 0.012, -W * 0.5, W * 0.5, 3.4, 4.8, '#374151');
  lamp(ctx, axis, s, L, -W * 0.72, -W * 0.38, 3.2, 5.2, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.38, W * 0.72, 3.2, 5.2, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.72, -W * 0.38, 3.2, 4.6, '#ef4444');
  lamp(ctx, axis, -s, L, W * 0.38, W * 0.72, 3.2, 4.6, '#ef4444');
  return { cab0, cab1 };
}

/**
 * Truck with a per-cargo body. Bodies: 'tank' (cylindrical tanker), 'bulk' (tipper),
 * 'logs' (stake with log stack), 'box' (van box), 'flat' (flatbed with steel load),
 * 'cattle' (slatted livestock box).
 * @param {string} body
 * @param {number} fill 0..1
 * @param {string} cargo
 */
export function drawTruck(ctx, axis, s, body, cargo, fill, cabCol = "#e5e7eb") {
  const L = 0.13, W = 0.045;
  const { cab0 } = truckFrame(ctx, axis, s, L, W, cabCol);
  const bed0 = s > 0 ? -L : L * 0.5, bed1 = s > 0 ? L * 0.5 : L;
  const bedA0 = s > 0 ? -L + 0.005 : L * 0.5 + 0.005, bedA1 = s > 0 ? L * 0.5 - 0.005 : L - 0.005;
  const cargoCol = cargoColor(cargo);
  if (body === 'tank') {
    obox(ctx, axis, bedA0, bedA1, -W * 0.85, W * 0.85, 4, 8.5, '#e5e7eb', '#f8fafc');
    obox(ctx, axis, bedA0 + 0.02, bedA1 - 0.02, -W * 0.85, W * 0.85, 8.5, 9.5, '#94a3b8');
    if (fill > 0) obox(ctx, axis, bedA0 + 0.02, bedA1 - 0.02, -W * 0.75, W * 0.75, 4.5, 5 + 3 * fill, cargoCol);
  } else if (body === 'bulk') {
    obox(ctx, axis, bed0, bed1, -W, W, 3, 6.5, '#71717a', '#52525b');
    if (fill > 0) obox(ctx, axis, bed0 + 0.02, bed1 - 0.02, -W + 0.01, W - 0.01, 6.5, 6.5 + 2 * fill, cargoCol);
  } else if (body === 'logs') {
    obox(ctx, axis, bedA0, bedA1, -W, W, 3, 4, '#5b4636');
    for (let i = 0; i < 4; i++) obox(ctx, axis, bedA0 + 0.02, bedA1 - 0.02, -W + 0.01 + i * 0.012, -W + 0.02 + i * 0.012, 4, 8 + (i % 2), '#b08968');
    obox(ctx, axis, bedA0, bedA0 + 0.01, -W - 0.005, W + 0.005, 3, 8, '#5b4636');
    obox(ctx, axis, bedA1 - 0.01, bedA1, -W - 0.005, W + 0.005, 3, 8, '#5b4636');
  } else if (body === 'box') {
    obox(ctx, axis, bedA0, bedA1, -W, W, 3, 12, '#f1f5f9', '#e2e8f0');
    obox(ctx, axis, bedA0, bedA1, -W - 0.003, W + 0.003, 6, 8, cargoCol);
  } else if (body === 'flat') {
    obox(ctx, axis, bedA0, bedA1, -W, W, 3, 4, '#3f3f46');
    if (fill > 0) obox(ctx, axis, bedA0 + 0.01, bedA1 - 0.01, -W * 0.7, W * 0.7, 4, 5 + 3 * fill, cargoCol, '#cbd5e1');
  } else if (body === 'cattle') {
    obox(ctx, axis, bedA0, bedA1, -W, W, 3, 10, '#d6d3d1', '#a8a29e');
    for (let i = 0; i < 5; i++) {
      const a = bedA0 + 0.02 + i * (bedA1 - bedA0 - 0.04) / 5;
      obox(ctx, axis, a, a + 0.008, -W - 0.004, W + 0.004, 3, 10, '#78716c');
    }
  } else {
    obox(ctx, axis, bedA0, bedA1, -W, W, 3, 6, '#6b7280', '#3f3f46');
    if (fill > 0) obox(ctx, axis, bed0 + 0.02, bed1 - 0.02, -W + 0.02, W - 0.02, 6, 6 + 3 * fill, cargoCol);
  }
  void cab0;
}
