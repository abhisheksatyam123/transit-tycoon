/**
 * Moscow house drawings, part 2: panel slabs and point towers (white with blue/terracotta
 * stripes and balconies), modern slim coloured towers, blue-green glass offices, cottages,
 * industrial sheds with saw-tooth roofs, corrugated warehouses and wide malls with car parks.
 */
import { box, gableRoof, cylinder, poly, tree } from './shapes.js';
import { shade } from '../palette.js';
import { block, yard, WHITE } from './housesCommon.js';

const PANEL_COLS = ['#eef0f2', '#e4e7eb', '#dfe6ea', '#ece8df'];
const STRIPE = ['#3b6fb6', '#b5573a'];

/** Brezhnev-era panel (P-44/II-49): 9-17 storeys, light grey panels with a seam grid,
 * coloured top bands and a glazed loggia stair column, flat roof with machine-room box. */
export function panel(ctx, level, v, r) {
  yard(ctx, 'yard');
  const color = PANEL_COLS[v % PANEL_COLS.length];
  const fl = 9 + (v % 9);
  const z1 = fl * 3.3;
  const tower = v % 3 === 0;
  const along = v % 2 === 0;
  const hu = tower ? 0.3 : 0.45, hv = tower ? 0.3 : 0.22;
  const u1 = along ? hu : hv, v1 = along ? hv : hu;
  block(ctx, { u0: -u1, v0: -v1, u1, v1, z0: 0, z1, color, floor: 3.3, bay: 0.17, winH: 1.6, litP: 0.15, r, win: '#2f4f74' });
  // panel seams: thin vertical joints every ~0.14 along both faces
  for (let u = -u1 + 0.14; u < u1 - 0.05; u += 0.14) box(ctx, u, v1, u + 0.008, v1 + 0.006, 0, z1, '#b4bbc3');
  for (let w = -v1 + 0.14; w < v1 - 0.05; w += 0.14) box(ctx, u1, w, u1 + 0.006, w + 0.008, 0, z1, '#b4bbc3');
  // coloured accent bands: top band under the roof and one mid-height band
  const stripe = STRIPE[v % 2];
  box(ctx, -u1 - 0.012, -v1 - 0.012, u1 + 0.012, v1 + 0.012, z1 - 3.3, z1 - 2.1, stripe);
  box(ctx, -u1 - 0.012, -v1 - 0.012, u1 + 0.012, v1 + 0.012, z1 * 0.5, z1 * 0.5 + 0.7, stripe);
  // glazed loggia stair column at one end of the long face
  const lu = -u1 + 0.02;
  box(ctx, lu, v1 + 0.005, lu + 0.16, v1 + 0.03, 0, z1 - 1, '#7fa6c4');
  // balcony strips on the long face
  for (let z = 3; z < z1 - 1; z += 6.6) box(ctx, -u1 + 0.2, v1, u1 - 0.02, v1 + 0.03, z, z + 0.2, '#cbd2da');
  // flat roof with machine-room box
  box(ctx, -u1 - 0.02, -v1 - 0.02, u1 + 0.02, v1 + 0.02, z1, z1 + 1.0, '#9aa3ad');
  box(ctx, -0.12, -0.08, 0.1, 0.08, z1 + 1.0, z1 + 2.8, '#a7b0ba');
  if (tower) cylinder(ctx, 0.2, 0.15, 0.05, z1 + 1.3, z1 + 5, '#7d8790');
}

/** Modern slim residential tower, 20-30 floors, coloured horizontal stripes. */
export function modern(ctx, level, v, r) {
  yard(ctx, 'paved');
  const fl = 20 + (v % 11);
  const z1 = fl * 3.1;
  const accent = ['#b91c1c', '#1d4ed8', '#d6c7a8', '#0f766e', '#f59e0b', '#7c3aed'][v % 6];
  const base = v % 2 ? '#e5e7eb' : '#d6d3cd';
  const s = 0.26;
  block(ctx, { u0: -s, v0: -s, u1: s, v1: s, z0: 0, z1, color: base, floor: 3.1, bay: 0.13, winH: 2, litP: 0.2, r, win: '#334e6e' });
  for (let z = 10; z < z1 - 4; z += 15) box(ctx, -s - 0.01, -s - 0.01, s + 0.01, s + 0.01, z, z + 2.4, accent);
  box(ctx, -0.07, -0.07, 0.07, 0.07, z1, z1 + 9, '#94a3b8');
}

/** Glass office / business centre: blue-green curtain wall tower, 14-22 floors. */
export function glass(ctx, level, v, r) {
  yard(ctx, 'paved');
  const col = ['#3e6b7a', '#2f5b6e', '#4b7f86', '#5a7e88'][v % 4];
  const fl = 14 + (v % 9);
  const z1 = fl * 3.4;
  const s = 0.36;
  box(ctx, -0.44, -0.44, 0.44, 0.44, 0, 4, '#b8bec6');
  block(ctx, { u0: -s, v0: -s, u1: s, v1: s, z0: 4, z1, color: col, top: '#8fb4c4', floor: 3.4, bay: 0.1, winH: 2.6, litP: 0.08, r, win: 'rgba(180,220,232,0.7)' });
  for (let z = 4; z < z1; z += 8) box(ctx, -s - 0.01, -s - 0.01, s + 0.01, s + 0.01, z, z + 0.3, shade(col, 1.3));
  // vertical mullions on both faces
  for (let u = -s + 0.09; u < s - 0.05; u += 0.09) box(ctx, u, s, u + 0.006, s + 0.008, 4, z1, '#9fc3cf');
  for (let w = -s + 0.09; w < s - 0.05; w += 0.09) box(ctx, s, w, s + 0.008, w + 0.006, 4, z1, '#9fc3cf');
  box(ctx, -0.12, -0.12, 0.12, 0.12, z1, z1 + 5, '#7c838c');
}

/** Cottage / dacha: small house, one or two storeys, pitched roof, porch and garden. */
export function cottage(ctx, level, v, r) {
  yard(ctx, 'grass');
  const cols = ['#e8dcc4', '#c2a27a', '#f1ede4', '#a86b4c', '#9db0a5', '#d7c3a4'];
  const color = cols[v % cols.length];
  const two = v % 4 === 0;
  const h = two ? 12 : 7;
  const along = v % 2 === 0;
  const hu = along ? 0.32 : 0.22, hv = along ? 0.22 : 0.32;
  box(ctx, -hu, -hv, hu, hv, 0, h, color);
  gableRoof(ctx, -hu - 0.03, -hv - 0.03, hu + 0.03, hv + 0.03, h, 8, along ? 'u' : 'v', ['#7a3b2a', '#3b5b6e', '#4a5a3a', '#8a5a2a'][v % 4]);
  box(ctx, -0.05, hv, 0.05, hv + 0.08, 0, 4.5, '#5b4636');
  if (v % 3 !== 2) tree(ctx, 0.38, 0.36, 0.5, '#4e8f2f', v % 2 === 1);
}

/** Industrial shed: saw-tooth roof, a chimney stack and dark loading bays. */
export function industrial(ctx, level, v, r) {
  yard(ctx, 'yard');
  const color = ['#8c9399', '#b26b3a', '#6b7b8c', '#a3a48e'][v % 4];
  const h = 9 + (v % 3) * 2;
  box(ctx, -0.45, -0.3, 0.45, 0.3, 0, h, color);
  for (let u = -0.42; u < 0.42; u += 0.21) {
    poly(ctx, [u, -0.3, h, u + 0.21, -0.3, h, u + 0.21, -0.3, h + 4, u, -0.3, h + 0.6], '#d7dde2');
  }
  for (let u = -0.4; u < 0.4; u += 0.2) box(ctx, u + 0.04, 0.3, u + 0.15, 0.31, 0, 5, '#3f4650');
  cylinder(ctx, 0.32, -0.18, 0.04, h + 2, 24 + (v % 3) * 4, '#9e9e9e', 0.035);
}

/** Warehouse: long corrugated grey/blue box, loading doors on the front. */
export function warehouse(ctx, level, v, r) {
  yard(ctx, 'yard');
  const color = ['#8fa3b5', '#9aa0a6', '#7f93a6', '#a9b3bb'][v % 4];
  const along = v % 2 === 0;
  const hu = along ? 0.46 : 0.22, hv = along ? 0.22 : 0.46;
  const h = 7 + (v % 2) * 1.5;
  box(ctx, -hu, -hv, hu, hv, 0, h, color, shade(color, 1.12));
  // corrugation ribs on the front face
  for (let u = -hu + 0.05; u < hu; u += 0.09) box(ctx, u, hv, u + 0.03, hv + 0.012, 0.5, h - 0.5, shade(color, 0.85));
  for (let i = 0; i < 4; i++) {
    const a = -hu + 0.07 + i * ((2 * hu - 0.14) / 4);
    box(ctx, a, hv + 0.005, a + 0.1, hv + 0.02, 0, 4.2, '#3f4650');
  }
  box(ctx, -hu - 0.01, -hv - 0.01, hu + 0.01, hv + 0.01, h, h + 0.8, '#6b7280');
}

/** Mall: wide low retail box, big red/blue signage band with white lettering blocks, car park with stripes. */
export function mall(ctx, level, v, r) {
  yard(ctx, 'paved');
  const color = ['#ece5d6', '#e0d7c4', '#d9e4ea', '#f1d7c4'][v % 4];
  const sign = v % 2 ? '#1d4ed8' : '#dc2626';
  box(ctx, -0.44, -0.3, 0.44, 0.3, 0, 7, color, shade(color, 1.1));
  // glazed entrance strip
  box(ctx, -0.44, 0.3, 0.44, 0.31, 1, 5.5, '#5d8fb0');
  // big signage band with white lettering blocks
  box(ctx, -0.42, -0.3, 0.42, -0.29, 7, 10.5, sign);
  box(ctx, -0.42, 0.29, 0.42, 0.3, 7, 10.5, sign);
  for (let i = 0; i < 6; i++) {
    const u = -0.37 + i * 0.125;
    box(ctx, u, -0.31, u + 0.085, -0.295, 8, 9.5, '#f8fafc');
  }
  // car park stripes and parked cars
  const cars = ['#dc2626', '#f8fafc', '#334155', '#facc15'];
  for (let i = 0; i < 6; i++) {
    const u = -0.42 + i * 0.14;
    box(ctx, u, 0.42, u + 0.01, 0.43, 0, 0.1, '#f8fafc');
  }
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    const u = -0.4 + i * 0.2;
    box(ctx, u, 0.36 + row * 0.04, u + 0.12, 0.38 + row * 0.04, 0, 2.2, cars[(v + i + row) % 4]);
  }
}
