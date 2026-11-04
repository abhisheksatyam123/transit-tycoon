/**
 * Rail vehicle bodies: locomotives per model family and wagons per cargo type,
 * plus the Moscow metro car (dark blue, white stripe, line-colour band).
 */
import { obox, shadow, wheels, lamp } from './iso3d.js';
import { cargoColor } from './cargoColors.js';
import { shade } from '../palette.js';

const GLASS = '#1e2a38';
const BOGIE = '#262626';
/** Engine families keyed by model id. */
export const ENGINE_FAMILY = { eng_puffer: 'steam_small', eng_comet: 'steam_big', eng_thunder: 'diesel', eng_arrow: 'electric', eng_bolt: 'hst' };

/** Chassis and bogies common to all rail vehicles (L half length, W half width). */
function chassis(ctx, axis, L, W, col) {
  shadow(ctx, axis, L + 0.01, W + 0.02);
  obox(ctx, axis, -L, L, -W, W, 1, 2.5, BOGIE);
  for (const a of [-L * 0.7, L * 0.7]) obox(ctx, axis, a - 0.03, a + 0.03, -W - 0.01, W + 0.01, 0, 1.2, '#111');
  void col;
}

/** Sides of a long box with window band: used by coaches and metro. */
function windowBand(ctx, axis, L, W, z0, z1, color) {
  obox(ctx, axis, -L * 0.9, L * 0.9, -W - 0.004, W + 0.004, z0, z1, color || GLASS);
}

/**
 * Locomotive.
 * @param {string} family key from ENGINE_FAMILY
 * @param {number} s travel sign
 * @param {number} variant 0..n livery variant
 */
export function drawEngine(ctx, axis, s, family, variant) {
  const L = 0.26, W = 0.075;
  chassis(ctx, axis, L, W, '#222');
  const front = (c) => (s > 0 ? L * 0.6 : -L), frontEnd = s > 0 ? L : -L;
  void front;
  if (family === 'steam_small') {
    const body = ['#15803d', '#0f766e'][variant % 2];
    obox(ctx, axis, -L * 0.7, L * 0.2, -W * 0.8, W * 0.8, 2.5, 7, '#1f2937');
    obox(ctx, axis, L * 0.05, s > 0 ? L * 0.9 : -L * 0.9, -W * 0.85, W * 0.85, 2.5, 6, body, shade(body, 1.1));
    obox(ctx, axis, s > 0 ? -L * 0.55 : L * 0.25, s > 0 ? -L * 0.05 : L * 0.55 * -0.5, -W * 0.9, W * 0.9, 2.5, 11, '#b45309', shade('#b45309', 1.1));
    obox(ctx, axis, (s > 0 ? L * 0.55 : -L * 0.55) - 0.03, (s > 0 ? L * 0.55 : -L * 0.55) + 0.03, -0.03, 0.03, 7, 15, '#1a1a1a');
    obox(ctx, axis, (s > 0 ? L * 0.8 : -L * 0.8) - 0.04, (s > 0 ? L * 0.8 : -L * 0.8) + 0.04, -0.04, 0.04, 6, 13, '#0f0f0f');
    obox(ctx, axis, -0.03, 0.03, -W * 0.9, W * 0.9, 0, 0.001, '#000');
  } else if (family === 'steam_big') {
    const body = ['#1d4ed8', '#7f1d1d'][variant % 2];
    obox(ctx, axis, -L * 0.6, L * 0.6, -W * 0.85, W * 0.85, 2.5, 8, '#1f2937');
    obox(ctx, axis, -L * 0.35, L * 0.4, -W * 0.7, W * 0.7, 8, 12, body, shade(body, 1.1));
    obox(ctx, axis, (s > 0 ? L * 0.55 : -L * 0.7), (s > 0 ? L * 0.8 : -L * 0.55), -W * 0.9, W * 0.9, 2.5, 9, '#111827', shade(body, 1.05));
    obox(ctx, axis, (s > 0 ? L * 0.6 : -L * 0.65) - 0.04, (s > 0 ? L * 0.6 : -L * 0.65) + 0.04, -0.04, 0.04, 9, 17, '#1a1a1a');
    obox(ctx, axis, (s > 0 ? L * 0.1 : -L * 0.1) - 0.05, (s > 0 ? L * 0.1 : -L * 0.1) + 0.05, -0.05, 0.05, 12, 15, '#9ca3af');
    obox(ctx, axis, -L * 0.6, L * 0.6, -W * 0.9, W * 0.9, 6, 7, '#d4af37');
    obox(ctx, axis, -L * 0.9, -L * 0.45, -W * 0.8, W * 0.8, 6, 12, '#111827');
  } else if (family === 'diesel') {
    const body = ['#b91c1c', '#4b5563'][variant % 2];
    obox(ctx, axis, -L, L, -W, W, 2.5, 4, body, shade(body, 1.1));
    const hoodA = s > 0 ? L * 0.25 : -L; const hoodB = s > 0 ? L : -L * 0.25;
    obox(ctx, axis, hoodA, hoodB, -W * 0.9, W * 0.9, 4, 8, body, shade(body, 1.12));
    obox(ctx, axis, -L * 0.5, -L * 0.15, -W, W, 4, 13, '#e5e7eb', '#d1d5db');
    obox(ctx, axis, -L * 0.45, -L * 0.2, -W - 0.004, W + 0.004, 8, 11, GLASS);
    obox(ctx, axis, frontEnd - 0.012 * s, frontEnd + 0.004 * s, -W * 0.8, W * 0.8, 4, 7, GLASS);
    obox(ctx, axis, -W * 0.0 - 0.01, 0.01, -W - 0.003, W + 0.003, 3.8, 4.4, '#fbbf24');
  } else if (family === 'electric') {
    obox(ctx, axis, -L, L, -W, W, 2.5, 4, '#1e3a8a');
    obox(ctx, axis, -L, L, -W, W, 4, 13, '#f8fafc', '#e5e7eb');
    obox(ctx, axis, -L, L, -W - 0.004, W + 0.004, 4.5, 6, '#1e3a8a');
    obox(ctx, axis, -L * 0.7, L * 0.7, -W - 0.004, W + 0.004, 9, 11, '#1e3a8a');
    obox(ctx, axis, frontEnd - 0.008 * s, frontEnd + 0.008 * s, -W * 0.85, W * 0.85, 4, 12, '#e5e7eb');
    obox(ctx, axis, -L * 0.3, L * 0.3, -0.06, 0.06, 13, 16, '#374151');
    obox(ctx, axis, -L * 0.25, L * 0.25, -0.02, 0.02, 15.5, 18, '#111827');
    obox(ctx, axis, -L * 0.8, L * 0.8, -W * 0.6, W * 0.6, 13, 13.4, '#9ca3af');
  } else { // hst
    obox(ctx, axis, -L, L, -W, W, 2.5, 6, '#f8fafc', '#e5e7eb');
    obox(ctx, axis, -L * 0.6, L * 0.6, -W - 0.004, W + 0.004, 3, 4, '#dc2626');
    obox(ctx, axis, -L * 0.6, L * 0.6, -W - 0.004, W + 0.004, 5.5, 6.5, GLASS);
    const nose = s > 0 ? [L * 0.7, L] : [-L, -L * 0.7];
    obox(ctx, axis, nose[0], nose[1], -W * 0.6, W * 0.6, 2.5, 5.5, '#f8fafc', '#fde68a');
    obox(ctx, axis, nose[0] + 0.02 * s, nose[1], -W * 0.5, W * 0.5, 5.5, 7, GLASS);
    obox(ctx, axis, nose[0], nose[1], -W * 0.4, W * 0.4, 5.5, 6, '#dc2626');
  }
  lamp(ctx, axis, s, L, -W * 0.6, -W * 0.2, 4, 5.5, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.2, W * 0.6, 4, 5.5, '#fef9c3');
}

/**
 * Metro car (Moskva 81-765 style): dark blue body, white band, line-colour stripe.
 * @param {string} line '#RRGGBB' line colour or null
 */
export function drawMetroCar(ctx, axis, s, line, isEngine) {
  const L = 0.28, W = 0.065;
  chassis(ctx, axis, L, W, '#222');
  const body = '#1e3a8a';
  obox(ctx, axis, -L, L, -W, W, 2.5, 11, body, '#334155');
  obox(ctx, axis, -L, L, -W - 0.004, W + 0.004, 5.5, 6.8, '#f8fafc');
  obox(ctx, axis, -L, L, -W - 0.004, W + 0.004, 2.5, 3.3, line && /^#[0-9a-fA-F]{6}$/.test(line) ? line : '#dc2626');
  windowBand(ctx, axis, L, W, 7.2, 9.6, GLASS);
  if (isEngine) {
    obox(ctx, axis, s > 0 ? L * 0.9 : -L, s > 0 ? L : -L * 0.9, -W * 0.9, W * 0.9, 2.5, 10.5, '#0f172a');
    obox(ctx, axis, -0.012, 0.012, -W * 0.7, W * 0.7, 9, 9.5, '#1e293b');
  }
  lamp(ctx, axis, s, L, -W * 0.5, W * 0.5, 4, 5.2, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.5, W * 0.5, 4, 5.2, '#ef4444');
}

/**
 * Wagon chosen by cargo: passenger coach (RZD green), mail van, tank, flat, box, cattle, hopper.
 * @param {string} cargo
 * @param {number} fill 0..1
 */
export function drawWagon(ctx, axis, s, cargo, fill) {
  const L = 0.26, W = 0.075;
  chassis(ctx, axis, L, W, '#222');
  if (cargo === 'PASS') {
    obox(ctx, axis, -L, L, -W, W, 2.5, 10, '#166534', '#14532d');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.5, 3.2, '#e5e7eb');
    obox(ctx, axis, -L * 0.9, L * 0.9, -W - 0.004, W + 0.004, 6, 8, GLASS);
    obox(ctx, axis, -L * 0.9, L * 0.9, -W - 0.004, W + 0.004, 8.2, 9, '#d4af37');
  } else if (cargo === 'MAIL') {
    obox(ctx, axis, -L, L, -W, W, 2.5, 10, '#e2e8f0', '#cbd5e1');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 5, 6.5, '#dc2626');
    obox(ctx, axis, -L * 0.7, -L * 0.4, -W - 0.004, W + 0.004, 7, 9, GLASS);
  } else if (cargo === 'OIL') {
    obox(ctx, axis, -L * 0.9, L * 0.9, -W * 0.7, W * 0.7, 3, 10, '#e5e7eb', '#f8fafc');
    obox(ctx, axis, -L * 0.8, L * 0.8, -W * 0.6, W * 0.6, 7, 8, '#64748b');
    if (fill > 0) obox(ctx, axis, -L * 0.85, L * 0.85, -W * 0.5, W * 0.5, 3.5, 4 + 3 * fill, cargoColor(cargo));
  } else if (cargo === 'WOOD' || cargo === 'STEL') {
    obox(ctx, axis, -L, L, -W, W, 2.5, 3.5, '#3f3f46');
    if (fill > 0) obox(ctx, axis, -L * 0.9, L * 0.9, -W * 0.8, W * 0.8, 3.5, 4.5 + 4 * fill, cargoColor(cargo), '#a1a1aa');
    for (const a of [-L * 0.95, L * 0.95]) obox(ctx, axis, a - 0.01, a + 0.01, -W - 0.004, W + 0.004, 3.5, 6, '#1f2937');
  } else if (cargo === 'LVST') {
    obox(ctx, axis, -L, L, -W, W, 2.5, 10, '#a16207', '#854d0e');
    for (let i = 0; i < 4; i++) { const a = -L * 0.8 + i * L * 0.5; obox(ctx, axis, a, a + 0.01, -W - 0.004, W + 0.004, 2.5, 10, '#422006'); }
  } else if (cargo === 'GOOD' || cargo === 'GRAI') {
    obox(ctx, axis, -L, L, -W, W, 2.5, 11, '#b45309', '#92400e');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 5, 9, '#7c2d12');
  } else { // coal / ore hopper
    obox(ctx, axis, -L, L, -W, W, 2.5, 6, '#4b5563', '#374151');
    if (fill > 0) obox(ctx, axis, -L * 0.9, L * 0.9, -W * 0.85, W * 0.85, 6, 6 + 3 * fill, cargoColor(cargo));
  }
}
