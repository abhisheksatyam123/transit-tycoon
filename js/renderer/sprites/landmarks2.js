/**
 * Remaining Moscow landmark drawings: Moscow City, MSU, Ostankino, Luzhniki, Christ the Saviour,
 * Bolshoi, VDNKh. Each entry: { tall, draw(ctx, w, h) } in footprint-centred tile space.
 */
import { box, cylinder, poly, P } from './shapes.js';
import { shade } from '../palette.js';
import { dome, star, ovalPrism, ovalCap, floors, GOLD } from './landmarkParts.js';

/** Lit-window speckle on a glass tower face (deterministic). */
function glassTower(ctx, u0, v0, u1, v1, z0, z1, color, seed) {
  box(ctx, u0, v0, u1, v1, z0, z1, color, shade(color, 1.25));
  floors(ctx, u0, v0, u1, v1, z0, z1, 7, 'rgba(230,250,255,0.35)');
  let s = seed;
  for (let z = z0 + 10; z < z1 - 8; z += 14) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    if (s % 3 === 0) {
      const [x, y] = [(u0 + u1) / 2, v1];
      poly(ctx, [x - 0.04, y, z, x + 0.04, y, z, x + 0.04, y, z + 6, x - 0.04, y, z + 6], '#fde68a');
    }
  }
}

/** Moscow City: 7 glass towers of 2–3× a level-4 house, one stepped (Federation look). */
function moscowCity(ctx) {
  const T = [
    [-1.05, -0.45, 0.3, 175, '#1d6fa3'],
    [-0.35, -0.5, 0.32, 300, '#2aa198'],
    [0.35, -0.38, 0.3, 245, '#3b82c4'],
    [-0.75, 0.4, 0.28, 270, '#14b8a6'],
    [0.05, 0.25, 0.3, 215, '#0e7490'],
    [0.85, 0.2, 0.28, 180, '#2563a8'],
    [0.3, 0.8, 0.25, 160, '#1e8fb0'],
  ].sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  T.forEach(([u, v, s, h, c], i) => {
    if (i === 4) {
      // stepped Federation-style tower
      for (let k = 0; k < 3; k++) {
        const e = s * (1 - k * 0.22), z0 = k === 0 ? 0 : h * 0.3 * k, z1 = h * 0.3 * (k + 1);
        glassTower(ctx, u - e, v - e, u + e, v + e, z0, z1, c, i * 37 + k);
      }
    } else {
      glassTower(ctx, u - s, v - s, u + s, v + s, 0, h, c, i * 37 + 5);
    }
  });
  // crown spire on the tallest tower
  cylinder(ctx, -0.35, -0.5, 0.02, 300, 340, '#cbd5e1', 0.005);
}

/** MSU: stepped beige central tower with spire and star; symmetric wings. */
function msu(ctx) {
  const B = '#e8dcc0';
  box(ctx, -0.95, -0.35, -0.3, 0.35, 0, 36, B);
  box(ctx, 0.3, -0.35, 0.95, 0.35, 0, 36, B);
  floors(ctx, -0.95, -0.35, -0.3, 0.35, 0, 36, 9, '#9c8f74');
  floors(ctx, 0.3, -0.35, 0.95, 0.35, 0, 36, 9, '#9c8f74');
  const tiers = [[0.5, 0, 56], [0.38, 56, 96], [0.27, 96, 130], [0.17, 130, 158]];
  for (const [r, z0, z1] of tiers) box(ctx, -r, -r, r, r, z0, z1, B);
  floors(ctx, -0.5, -0.5, 0.5, 0.5, 56, 158, 9, '#9c8f74');
  box(ctx, -0.1, -0.1, 0.1, 0.1, 158, 168, B);
  cylinder(ctx, 0, 0, 0.12, 168, 176, '#c9b99a', 0.09);
  // spire with star
  poly(ctx, [-0.05, -0.05, 176, 0.05, -0.05, 176, 0, 0, 260], shade('#d4c39e', 0.9));
  poly(ctx, [0.05, -0.05, 176, 0.05, 0.05, 176, 0, 0, 260], shade('#d4c39e', 0.7));
  star(ctx, 0, 0, 264, 7, '#dc2626');
}

/** Ostankino: very tall thin concrete shaft, pod with red band, red-white antenna. */
function ostankino(ctx) {
  cylinder(ctx, 0, 0, 0.05, 0, 300, '#e5e7eb', 0.018);
  cylinder(ctx, 0, 0, 0.19, 292, 318, '#cbd5e1', 0.17);
  cylinder(ctx, 0, 0, 0.23, 318, 350, '#f1f5f9', 0.21);
  cylinder(ctx, 0, 0, 0.23, 326, 332, '#dc2626', 0.23);
  cylinder(ctx, 0, 0, 0.18, 350, 356, '#94a3b8', 0.18);
  cylinder(ctx, 0, 0, 0.03, 356, 470, '#f8fafc', 0.025);
  for (let z = 360; z < 470; z += 22) {
    const [x, y] = P(0, 0, z);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x - 1.2, y - 6, 2.4, 6);
  }
  const [tx, ty] = P(0, 0, 470);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(tx - 0.4, ty - 30, 0.8, 30);
}

/** Luzhniki: oval stadium with white roof ring and green pitch. */
function luzhniki(ctx) {
  ovalPrism(ctx, 0.95, 0.68, 0, 30, '#8f9aa6');
  ovalCap(ctx, 0.95, 0.68, 30, '#c7ced6');
  ovalCap(ctx, 0.92, 0.66, 44, '#f8fafc');
  ovalCap(ctx, 0.64, 0.4, 44, '#4f9d3a');
  ovalCap(ctx, 0.6, 0.36, 30, '#3f9b3f');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const u = Math.cos(a) * 0.93, v = Math.sin(a) * 0.67;
    box(ctx, u - 0.02, v - 0.02, u + 0.02, v + 0.02, 30, 44, '#e5e7eb');
  }
}

/** Christ the Saviour: white cathedral, five golden domes, large central dome. */
function christ(ctx) {
  const W = '#f4f1ea';
  box(ctx, -0.42, -0.42, 0.42, 0.42, 0, 28, W);
  box(ctx, -0.3, -0.3, 0.3, 0.3, 28, 58, W);
  cylinder(ctx, 0, 0, 0.17, 58, 88, W, 0.15);
  dome(ctx, 0, 0, 88, 15, 40, GOLD);
  for (const [u, v] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    cylinder(ctx, u, v, 0.07, 58, 72, W, 0.06);
    dome(ctx, u, v, 72, 7, 22, GOLD);
  }
}

/** Bolshoi: cream theatre, column portico on the south side, quadriga on the pediment. */
function bolshoi(ctx) {
  const C = '#f3e6c3';
  box(ctx, -0.45, -0.35, 0.45, 0.35, 0, 30, C);
  box(ctx, -0.42, 0.36, 0.42, 0.5, 0, 30, shade(C, 1.02));
  for (let i = 0; i < 6; i++) {
    const u = -0.35 + i * 0.14;
    cylinder(ctx, u, 0.52, 0.025, 0, 28, '#fbf6e8', 0.02);
  }
  box(ctx, -0.46, 0.44, 0.46, 0.56, 28, 34, C);
  poly(ctx, [-0.4, 0.5, 34, 0.4, 0.5, 34, 0, 0.5, 46], shade(C, 0.95));
  // quadriga hint: chariot and four horses
  box(ctx, -0.07, 0.42, 0.07, 0.5, 34, 40, '#8b5e34');
  for (let i = 0; i < 4; i++) box(ctx, -0.2 + i * 0.1, 0.45, -0.17 + i * 0.1, 0.47, 34, 44, '#6b4423');
  box(ctx, -0.1, 0.3, 0.1, 0.36, 34, 37, '#d4af37');
}

/** VDNKh: park ground with arch gate and golden fountain. */
function vdnkh(ctx, w, h) {
  // arch gate on the north side
  box(ctx, -0.55, -0.85, -0.42, -0.72, 0, 56, '#f5efe0');
  box(ctx, 0.42, -0.85, 0.55, -0.72, 0, 56, '#f5efe0');
  box(ctx, -0.6, -0.9, 0.6, -0.68, 56, 66, '#f5efe0', '#d4af37');
  dome(ctx, 0, -0.78, 66, 4, 14, GOLD);
  // fountain
  cylinder(ctx, 0.4, 0.4, 0.22, 0, 6, '#d6d3c8', 0.2);
  cylinder(ctx, 0.4, 0.4, 0.18, 6, 8, '#38bdf8', 0.18);
  cylinder(ctx, 0.4, 0.4, 0.04, 8, 28, GOLD, 0.02);
  dome(ctx, 0.4, 0.4, 28, 5, 6, GOLD);
}

const ENTRIES = {
  moscow_city: { tall: 320, draw: moscowCity },
  msu: { tall: 176, draw: msu },
  ostankino: { tall: 520, draw: ostankino },
  luzhniki: { tall: 46, draw: luzhniki },
  christ_saviour: { tall: 110, draw: christ },
  bolshoi: { tall: 56, draw: bolshoi },
  vdnkh: { tall: 70, draw: vdnkh },
};

/**
 * Extra landmark definition by id.
 * @param {string} id
 * @returns {{tall:number, draw:(ctx:CanvasRenderingContext2D,w:number,h:number)=>void}|null}
 */
export function landmarkExtras(id) {
  const e = ENTRIES[id];
  return e ? { tall: e.tall, draw: (ctx) => e.draw(ctx, 0, 0) } : null;
}
