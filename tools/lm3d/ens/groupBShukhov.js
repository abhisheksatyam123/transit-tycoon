/** Shukhov radio tower (1919-22): 6 stacked hyperboloid lattice sections, 148 m tall (OSM shell tops 25..148 m). */
import { tube, place } from '../model.js';

const TOPS = [0, 25, 50, 75, 100, 125, 148];
// hyperboloid radius profile (m): wide base, waist ~ 2.4 m at 90 m, slightly flared top
const radius = (z) => 2.4 + 7.0 * Math.pow((z - 90) / 90, 2) * (z < 90 ? 1 : 0.55);

export function shukhovLattice(toM, lat, lon) {
  const out = [];
  const N = 16;
  const ring = (z, r, c) => Array.from({ length: 17 }, (_, i) => { const a = (i / 16) * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a), z]; });
  for (let k = 0; k + 1 < TOPS.length; k++) {
    const z0 = TOPS[k], z1 = TOPS[k + 1];
    const r0 = radius(z0), r1 = radius(z1);
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 2 * Math.PI;
      for (const dir of [1, -1]) {
        const a1 = a0 + dir * (2 * Math.PI * 3) / N; // generator twists by ~3 pitches across each section
        tube(out, [[r0 * Math.cos(a0), r0 * Math.sin(a0), z0], [r1 * Math.cos(a1), r1 * Math.sin(a1), z1]], 0.45, '#8a8e92');
      }
    }
    tube(out, ring(z0, r0, 0), 0.4, '#7a7f84');
  }
  tube(out, ring(TOPS[TOPS.length - 1], radius(TOPS[TOPS.length - 1]), 0), 0.4, '#7a7f84');
  // central mast above the top section, 8 m
  tube(out, [[0, 0, 148], [0, 0, 160]], 0.9, '#8a8e92');
  return place(out, toM, lat, lon, 0);
}
