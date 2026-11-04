/**
 * Moscow house drawings, part 1: historic stucco blocks, Stalinist stone blocks with corner
 * turrets, and khrushchyovka five-storey slabs. Each draw(ctx, level, variant, r) draws in
 * footprint-centred tile space; buildings fill most of the tile (dense Moscow blocks).
 */
import { box, gableRoof, cylinder, poly } from './shapes.js';
import { shade } from '../palette.js';
import { block, yard, win, WHITE } from './housesCommon.js';

const STUCCO = ['#e9c46a', '#f3e6a2', '#a8d5ba', '#f2b5c4', '#f5f0e6', '#f4d19b'];
const ROOFS = ['#3d6b4f', '#6b7280', '#7a4b3a', '#4b5563'];

/** Historic pastel stucco block, 3-5 floors, white window trim, pitched roof. */
export function historic(ctx, level, v, r) {
  yard(ctx, 'paved');
  const fl = 3 + (v % 3);
  const z1 = fl * 5.2;
  const along = v % 2 === 0;
  const U0 = -0.44, V0 = -0.3;
  const U1 = along ? 0.44 : 0.1, V1 = along ? 0.1 : 0.44;
  const color = STUCCO[v % STUCCO.length];
  block(ctx, { u0: U0, v0: V0, u1: U1, v1: V1, z0: 0, z1, color, floor: 5.2, bay: 0.18, winH: 2.4, litP: 0.12, r, win: WHITE });
  box(ctx, U0 - 0.01, V0 - 0.01, U1 + 0.01, V1 + 0.01, z1, z1 + 1, WHITE);
  if (v % 3 === 0) gableRoof(ctx, U0, V0, U1, V1, z1 + 1, 7, along ? 'u' : 'v', ROOFS[v % 4]);
  else box(ctx, U0, V0, U1, V1, z1 + 1, z1 + 2.2, '#8c8f97');
}

/** Stalinist block: 7-12 floors cream stone, heavy cornice, corner turret with spire on some. */
export function stalinka(ctx, level, v, r) {
  yard(ctx, 'paved');
  const fl = 7 + (v % 6);
  const h1 = fl * 4;
  const cream = ['#e8dcc0', '#d9c9a3', '#ece3cf', '#d2c2a0'][v % 4];
  const s = 0.42;
  block(ctx, { u0: -s, v0: -s, u1: s, v1: s, z0: 0, z1: h1, color: cream, floor: 4, bay: 0.17, winH: 1.9, litP: 0.1, r, win: '#3e4a5c' });
  box(ctx, -s - 0.04, -s - 0.04, s + 0.04, s + 0.04, h1, h1 + 2.5, shade(cream, 1.05));
  box(ctx, -s - 0.02, -s - 0.02, s + 0.02, s + 0.02, h1 + 2.5, h1 + 3.5, shade(cream, 0.9));
  // corner turret at the north-east corner
  const tx = s - 0.08, ty = -s + 0.08, tz = h1 + 3.5, th = 8 + (v % 3) * 3;
  cylinder(ctx, tx, ty, 0.1, tz, tz + th, cream, 0.08);
  cylinder(ctx, tx, ty, 0.11, tz + th, tz + th + 1.5, shade(cream, 0.9), 0.09);
  if (v % 3 === 0) {
    poly(ctx, [tx - 0.07, ty - 0.07, tz + th + 1.5, tx + 0.07, ty - 0.07, tz + th + 1.5, tx, ty, tz + th + 18], '#c9b98f');
    poly(ctx, [tx - 0.02, ty - 0.02, tz + th + 18, tx + 0.02, ty - 0.02, tz + th + 18, tx, ty, tz + th + 24], '#dc2626');
  } else {
    gableRoof(ctx, -s + 0.1, -s + 0.1, s - 0.1, s - 0.1, h1 + 3.5, 4, 'u', '#8a6d52');
  }
}

/** Khrushchyovka: exactly five storeys, long low sand/pink brick slab, flat roof, tight small
 * square windows, balconies on some bays only, 3-4 entrance porches with small canopies. */
export function khrushchyovka(ctx, level, v, r) {
  yard(ctx, 'yard');
  const cols = ['#d8c7b0', '#e3cfc4', '#cfc6b8', '#e6d6c0', '#d9b8a6'];
  const color = cols[v % cols.length];
  const along = v % 2 === 0;
  const hu = along ? 0.46 : 0.22, hv = along ? 0.22 : 0.46;
  const z1 = 15; // 5 storeys x 3.0
  block(ctx, { u0: -hu, v0: -hv, u1: hu, v1: hv, z0: 0, z1, color, floor: 3, bay: 0.1, winH: 1.1, litP: 0.05, r, win: '#34404e' });
  // flat roof parapet
  box(ctx, -hu - 0.01, -hv - 0.01, hu + 0.01, hv + 0.01, z1, z1 + 0.7, '#9a9d9f');
  // balconies on some bays of the long face (every 3rd floor pair, sparse)
  for (let z = 6; z < z1 - 2; z += 6) {
    for (let u = -hu + 0.12; u < hu - 0.1; u += 0.3) {
      if (r() < 0.35) box(ctx, u, hv, u + 0.22, hv + 0.07, z, z + 0.12, '#b8b2a8');
    }
  }
  // entrance porches with canopies on the front face
  const ent = along ? [-0.3, -0.05, 0.2, 0.36] : [-0.3, -0.05, 0.2, 0.36];
  for (let i = 0; i < 3 + (v % 2); i++) {
    const u = -hu + 0.1 + i * ((2 * hu - 0.2) / (3 + (v % 2) - 1 || 1));
    box(ctx, u - 0.03, hv, u + 0.07, hv + 0.09, 0, 2.2, '#8e8a84');
    box(ctx, u - 0.07, hv, u + 0.11, hv + 0.14, 2.2, 2.4, '#6b6f75');
    box(ctx, u - 0.02, hv + 0.02, u + 0.06, hv + 0.03, 0, 2.2, '#4a4f57');
  }
  if (v % 3 === 0) box(ctx, hu - 0.14, -0.06, hu - 0.04, 0.06, z1 + 0.7, z1 + 2.5, '#9ca3af');
}
