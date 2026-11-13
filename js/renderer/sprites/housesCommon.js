/**
 * Shared helpers for the Moscow house styles (housesMoscow.js, housesModern.js):
 * a windowed facade block, a yard/pavement quad and a window poly.
 */
import { poly, quad, box } from './shapes.js';

const WIN = 'rgba(30,45,70,0.85)';
const WIN_LIT = '#fde68a';
export const WHITE = '#f8fafc';

/** Draw one window quad on a face: face 'v' (plane v=fixed) or 'u' (plane u=fixed). */
export function win(ctx, face, s, e, fixed, z, h, color) {
  if (face === 'v') poly(ctx, [s, fixed, z, e, fixed, z, e, fixed, z + h, s, fixed, z + h], color);
  else poly(ctx, [fixed, s, z, fixed, e, z, fixed, e, z + h, fixed, s, z + h], color);
}

/**
 * Box with a window grid on its two visible faces (v1 face and u1 face).
 * o: { u0,v0,u1,v1,z0,z1,color,top?,floor?,bay?,winH?,litP?,win?,r }
 */
export function block(ctx, o) {
  const { u0, v0, u1, v1, z0, z1, r } = o;
  box(ctx, u0, v0, u1, v1, z0, z1, o.color, o.top);
  const floor = o.floor || 5;
  const bay = o.bay || 0.22;
  const winH = o.winH || 2;
  const litP = o.litP ?? 0.15;
  const pad = 0.07;
  const nu = Math.max(1, Math.round((u1 - u0) / bay));
  const nv = Math.max(1, Math.round((v1 - v0) / bay));
  const cu = (u1 - u0) / nu, cv = (v1 - v0) / nv;
  for (let z = z0 + floor * 0.55; z + winH < z1 - 0.8; z += floor) {
    for (let i = 0; i < nu; i++) {
      const c = r() < litP ? WIN_LIT : (o.win || WIN);
      const s = u0 + i * cu + cu * pad, e = u0 + (i + 1) * cu - cu * pad;
      win(ctx, 'v', s, e, v1 + 0.002, z, winH, c);
    }
    for (let i = 0; i < nv; i++) {
      const c = r() < litP ? WIN_LIT : (o.win || WIN);
      const s = v0 + i * cv + cv * pad, e = v0 + (i + 1) * cv - cv * pad;
      win(ctx, 'u', s, e, u1 + 0.002, z, winH, c);
    }
  }
}

/** Ground quad under a house tile: 'paved' (pavement), 'grass' (garden), 'yard' (courtyard). */
export function yard(ctx, kind) {
  const c = kind === 'grass' ? '#6f9f48' : kind === 'yard' ? '#a9a48f' : '#9aa0a6';
  quad(ctx, -0.46, -0.46, 0.46, 0.46, 0, c);
}
