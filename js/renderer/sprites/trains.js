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
  shadow(ctx, axis, L + 0.015, W + 0.022);
  obox(ctx, axis, -L, L, -W, W, 0.8, 2.8, BOGIE);
  // bogie frames + wheels
  for (const a of [-L * 0.68, L * 0.68]) {
    obox(ctx, axis, a - 0.045, a + 0.045, -W - 0.012, W + 0.012, 0, 1.6, '#111827');
    obox(ctx, axis, a - 0.055, a - 0.035, -W - 0.014, W + 0.014, 0, 1.8, '#0a0a0a');
    obox(ctx, axis, a + 0.035, a + 0.055, -W - 0.014, W + 0.014, 0, 1.8, '#0a0a0a');
  }
  // coupler area
  obox(ctx, axis, -L - 0.008, -L + 0.008, -0.02, 0.02, 1.2, 2.2, '#374151');
  obox(ctx, axis, L - 0.008, L + 0.008, -0.02, 0.02, 1.2, 2.2, '#374151');
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
  const L = 0.27, W = 0.078;
  chassis(ctx, axis, L, W, '#222');
  const frontEnd = s > 0 ? L : -L;
  if (family === 'steam_small') {
    const body = ['#166534', '#0f766e', '#7f1d1d'][variant % 3];
    obox(ctx, axis, -L * 0.72, L * 0.22, -W * 0.82, W * 0.82, 2.6, 7.4, '#1f2937', '#374151');
    obox(ctx, axis, L * 0.04, s > 0 ? L * 0.92 : -L * 0.92, -W * 0.86, W * 0.86, 2.6, 6.4, body, shade(body, 1.12));
    // cab
    obox(ctx, axis, s > 0 ? -L * 0.58 : L * 0.08, s > 0 ? -L * 0.06 : L * 0.58, -W * 0.9, W * 0.9, 2.6, 11.5, '#92400e', shade('#92400e', 1.1));
    obox(ctx, axis, s > 0 ? -L * 0.5 : L * 0.14, s > 0 ? -L * 0.14 : L * 0.5, -W - 0.004, W + 0.004, 7.2, 10.2, GLASS);
    // smokestack + dome
    obox(ctx, axis, (s > 0 ? L * 0.58 : -L * 0.58) - 0.032, (s > 0 ? L * 0.58 : -L * 0.58) + 0.032, -0.032, 0.032, 6.4, 15.5, '#111827', '#374151');
    obox(ctx, axis, (s > 0 ? L * 0.22 : -L * 0.22) - 0.045, (s > 0 ? L * 0.22 : -L * 0.22) + 0.045, -0.045, 0.045, 6.4, 9.2, '#0f172a');
    // running board
    obox(ctx, axis, -L * 0.85, L * 0.85, -W * 0.92, W * 0.92, 2.6, 3.2, '#111827');
  } else if (family === 'steam_big') {
    const body = ['#1d4ed8', '#991b1b', '#14532d'][variant % 3];
    obox(ctx, axis, -L * 0.62, L * 0.62, -W * 0.86, W * 0.86, 2.6, 8.4, '#111827', '#374151');
    obox(ctx, axis, -L * 0.38, L * 0.42, -W * 0.72, W * 0.72, 8.4, 12.6, body, shade(body, 1.12));
    // cab
    obox(ctx, axis, s > 0 ? -L * 0.9 : L * 0.45, s > 0 ? -L * 0.45 : L * 0.9, -W * 0.88, W * 0.88, 6.5, 12.8, '#0f172a', '#1f2937');
    obox(ctx, axis, s > 0 ? -L * 0.82 : L * 0.52, s > 0 ? -L * 0.52 : L * 0.82, -W - 0.004, W + 0.004, 8.5, 11.5, GLASS);
    obox(ctx, axis, (s > 0 ? L * 0.62 : -L * 0.62) - 0.042, (s > 0 ? L * 0.62 : -L * 0.62) + 0.042, -0.042, 0.042, 8.4, 17.5, '#0a0a0a');
    obox(ctx, axis, (s > 0 ? L * 0.18 : -L * 0.18) - 0.055, (s > 0 ? L * 0.18 : -L * 0.18) + 0.055, -0.055, 0.055, 12.6, 15.2, '#9ca3af');
    obox(ctx, axis, -L * 0.62, L * 0.62, -W * 0.9, W * 0.9, 6.2, 7.1, '#d4af37');
    obox(ctx, axis, -L * 0.92, L * 0.92, -W * 0.88, W * 0.88, 2.6, 3.3, '#1f2937');
  } else if (family === 'diesel') {
    const body = ['#b91c1c', '#334155', '#1d4ed8'][variant % 3];
    obox(ctx, axis, -L, L, -W, W, 2.6, 4.2, body, shade(body, 1.1));
    const hoodA = s > 0 ? L * 0.22 : -L; const hoodB = s > 0 ? L : -L * 0.22;
    obox(ctx, axis, hoodA, hoodB, -W * 0.9, W * 0.9, 4.2, 8.4, body, shade(body, 1.12));
    // cab
    obox(ctx, axis, s > 0 ? -L * 0.52 : L * 0.12, s > 0 ? -L * 0.12 : L * 0.52, -W, W, 4.2, 13.4, '#e5e7eb', '#f3f4f6');
    obox(ctx, axis, s > 0 ? -L * 0.46 : L * 0.18, s > 0 ? -L * 0.18 : L * 0.46, -W - 0.004, W + 0.004, 8.2, 11.8, GLASS);
    obox(ctx, axis, frontEnd - 0.014 * s, frontEnd + 0.004 * s, -W * 0.82, W * 0.82, 4.2, 7.4, GLASS);
    // vents/grille
    for (let i = 0; i < 4; i++) {
      const a = (s > 0 ? L * 0.35 : -L * 0.65) + i * 0.06 * (s > 0 ? 1 : 1);
      obox(ctx, axis, a, a + 0.03, -W * 0.88, W * 0.88, 5.2, 7.8, '#1f2937');
    }
    obox(ctx, axis, -L * 0.9, L * 0.9, -W - 0.003, W + 0.003, 3.8, 4.5, '#fbbf24');
  } else if (family === 'electric') {
    obox(ctx, axis, -L, L, -W, W, 2.6, 4.2, '#1e3a8a', '#1d4ed8');
    obox(ctx, axis, -L, L, -W, W, 4.2, 13.4, '#f8fafc', '#e5e7eb');
    obox(ctx, axis, -L, L, -W - 0.004, W + 0.004, 4.6, 6.2, '#1e3a8a');
    obox(ctx, axis, -L * 0.72, L * 0.72, -W - 0.004, W + 0.004, 9.2, 11.2, '#1e3a8a');
    // cab windows
    obox(ctx, axis, frontEnd - 0.01 * s, frontEnd + 0.01 * s, -W * 0.86, W * 0.86, 4.2, 12.4, '#dbeafe');
    obox(ctx, axis, -frontEnd - 0.01 * s, -frontEnd + 0.01 * s, -W * 0.86, W * 0.86, 4.2, 12.4, '#dbeafe');
    // pantograph
    obox(ctx, axis, -L * 0.28, L * 0.28, -0.07, 0.07, 13.4, 16.2, '#374151');
    obox(ctx, axis, -L * 0.22, L * 0.22, -0.025, 0.025, 15.8, 18.4, '#111827');
    obox(ctx, axis, -L * 0.82, L * 0.82, -W * 0.62, W * 0.62, 13.4, 13.9, '#9ca3af');
    obox(ctx, axis, -L * 0.9, L * 0.9, -W - 0.003, W + 0.003, 3.8, 4.5, '#ef4444');
  } else { // hst
    obox(ctx, axis, -L, L, -W, W, 2.6, 6.2, '#f8fafc', '#e5e7eb');
    obox(ctx, axis, -L * 0.65, L * 0.65, -W - 0.004, W + 0.004, 3.0, 4.2, '#dc2626');
    obox(ctx, axis, -L * 0.65, L * 0.65, -W - 0.004, W + 0.004, 5.6, 6.6, GLASS);
    const nose = s > 0 ? [L * 0.66, L] : [-L, -L * 0.66];
    obox(ctx, axis, nose[0], nose[1], -W * 0.62, W * 0.62, 2.6, 5.8, '#f8fafc', '#fef3c7');
    obox(ctx, axis, nose[0] + 0.018 * s, nose[1], -W * 0.52, W * 0.52, 5.8, 7.4, '#dbeafe');
    obox(ctx, axis, nose[0], nose[1], -W * 0.42, W * 0.42, 6.4, 6.9, '#dc2626');
    obox(ctx, axis, -L * 0.9, L * 0.9, -W * 0.86, W * 0.86, 2.6, 3.2, '#1f2937');
  }
  lamp(ctx, axis, s, L, -W * 0.62, -W * 0.22, 4.2, 5.8, '#fef9c3');
  lamp(ctx, axis, s, L, W * 0.22, W * 0.62, 4.2, 5.8, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.62, -W * 0.22, 4.2, 5.4, '#ef4444');
  lamp(ctx, axis, -s, L, W * 0.22, W * 0.62, 4.2, 5.4, '#ef4444');
}

/**
 * Metro car (Moskva 81-765 style): dark blue body, white band, line-colour stripe.
 * @param {string} line '#RRGGBB' line colour or null
 */
export function drawMetroCar(ctx, axis, s, line, isEngine) {
  const L = 0.29, W = 0.068;
  chassis(ctx, axis, L, W, '#222');
  const body = '#1e3a8a';
  const stripe = line && /^#[0-9a-fA-F]{6}$/.test(line) ? line : '#dc2626';
  obox(ctx, axis, -L, L, -W, W, 2.6, 11.4, body, '#334155');
  obox(ctx, axis, -L, L, -W - 0.004, W + 0.004, 5.6, 7.0, '#f8fafc');
  obox(ctx, axis, -L, L, -W - 0.004, W + 0.004, 2.6, 3.4, stripe);
  obox(ctx, axis, -L, L, -W, W, 11.4, 11.9, '#475569');
  // window rows
  obox(ctx, axis, -L * 0.92, L * 0.92, -W - 0.004, W + 0.004, 7.4, 9.9, GLASS);
  for (let i = 0; i < 5; i++) {
    const a = -L * 0.78 + i * L * 0.39;
    obox(ctx, axis, a - 0.012, a + 0.012, -W - 0.004, W + 0.004, 7.4, 9.9, body);
  }
  // doors
  obox(ctx, axis, -L * 0.08, L * 0.08, -W - 0.004, W + 0.004, 3.6, 9.6, '#1e293b');
  if (isEngine) {
    const nose = s > 0 ? [L * 0.86, L] : [-L, -L * 0.86];
    obox(ctx, axis, nose[0], nose[1], -W * 0.92, W * 0.92, 2.6, 10.8, '#0f172a', '#1e293b');
    obox(ctx, axis, nose[0] + 0.01 * s, nose[1], -W * 0.72, W * 0.72, 5.8, 9.4, '#dbeafe');
  }
  lamp(ctx, axis, s, L, -W * 0.52, W * 0.52, 4.2, 5.4, '#fef9c3');
  lamp(ctx, axis, -s, L, -W * 0.52, W * 0.52, 4.2, 5.4, '#ef4444');
}

/**
 * Wagon chosen by cargo: passenger coach (RZD green), mail van, tank, flat, box, cattle, hopper.
 * @param {string} cargo
 * @param {number} fill 0..1
 */
export function drawWagon(ctx, axis, s, cargo, fill) {
  const L = 0.265, W = 0.076;
  chassis(ctx, axis, L, W, '#222');
  if (cargo === 'PASS') {
    obox(ctx, axis, -L, L, -W, W, 2.6, 10.4, '#166534', '#14532d');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.6, 3.3, '#e5e7eb');
    obox(ctx, axis, -L * 0.92, L * 0.92, -W - 0.004, W + 0.004, 6.2, 8.4, GLASS);
    obox(ctx, axis, -L * 0.92, L * 0.92, -W - 0.004, W + 0.004, 8.6, 9.3, '#d4af37');
    for (let i = 0; i < 4; i++) {
      const a = -L * 0.75 + i * L * 0.5;
      obox(ctx, axis, a - 0.01, a + 0.01, -W - 0.004, W + 0.004, 6.2, 8.4, '#14532d');
    }
  } else if (cargo === 'MAIL') {
    obox(ctx, axis, -L, L, -W, W, 2.6, 10.4, '#e2e8f0', '#cbd5e1');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 5.2, 6.8, '#dc2626');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 2.6, 3.4, '#1e3a8a');
    obox(ctx, axis, -L * 0.72, -L * 0.42, -W - 0.004, W + 0.004, 7.2, 9.2, GLASS);
  } else if (cargo === 'OIL') {
    obox(ctx, axis, -L * 0.92, L * 0.92, -W * 0.72, W * 0.72, 3.2, 10.4, '#e5e7eb', '#f8fafc');
    obox(ctx, axis, -L * 0.82, L * 0.82, -W * 0.62, W * 0.62, 7.2, 8.2, '#64748b');
    obox(ctx, axis, -L * 0.1, L * 0.1, -0.04, 0.04, 10.4, 11.4, '#475569');
    if (fill > 0) obox(ctx, axis, -L * 0.86, L * 0.86, -W * 0.52, W * 0.52, 3.6, 4.2 + 3.2 * fill, cargoColor(cargo));
  } else if (cargo === 'WOOD' || cargo === 'STEL') {
    obox(ctx, axis, -L, L, -W, W, 2.6, 3.8, '#3f3f46', '#52525b');
    if (fill > 0) obox(ctx, axis, -L * 0.9, L * 0.9, -W * 0.82, W * 0.82, 3.8, 4.8 + 4.2 * fill, cargoColor(cargo), '#a1a1aa');
    for (const a of [-L * 0.96, L * 0.96]) obox(ctx, axis, a - 0.012, a + 0.012, -W - 0.004, W + 0.004, 3.8, 6.4, '#1f2937');
  } else if (cargo === 'LVST') {
    obox(ctx, axis, -L, L, -W, W, 2.6, 10.4, '#a16207', '#854d0e');
    obox(ctx, axis, -L, L, -W, W, 10.4, 11, '#78350f');
    for (let i = 0; i < 5; i++) { const a = -L * 0.82 + i * L * 0.41; obox(ctx, axis, a, a + 0.012, -W - 0.004, W + 0.004, 2.6, 10.4, '#422006'); }
  } else if (cargo === 'GOOD' || cargo === 'GRAI') {
    obox(ctx, axis, -L, L, -W, W, 2.6, 11.2, '#b45309', '#92400e');
    obox(ctx, axis, -L, L, -W - 0.003, W + 0.003, 5.2, 9.2, '#7c2d12');
    obox(ctx, axis, -L, L, -W, W, 11.2, 11.8, '#78350f');
  } else { // coal / ore hopper
    obox(ctx, axis, -L, L, -W, W, 2.6, 6.4, '#4b5563', '#374151');
    obox(ctx, axis, -L, L, -W * 0.96, W * 0.96, 6.4, 7, '#6b7280');
    if (fill > 0) obox(ctx, axis, -L * 0.9, L * 0.9, -W * 0.86, W * 0.86, 6.4, 6.8 + 3.2 * fill, cargoColor(cargo));
  }
  void s;
}
