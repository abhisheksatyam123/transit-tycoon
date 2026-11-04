/** R5f: Shukhov radio tower (160 m): six stacked hyperboloid lattice sections, see-through grey steel. */
import { footprintPixel, heightPx } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

const LATTICE = '#6d7178', RING = '#9aa0a8';

/** Hyperboloid radius (tiles) at height z (px): narrowest at the waist, flaring out at both ends. */
const radius = (z, top) => 0.04 * Math.sqrt(1 + ((z - top * 0.4) / (top * 0.25)) ** 2);

/** Build the Shukhov tower sprite (1x1 footprint). */
export function buildShukhov(w, h) {
  const top = heightPx(160);
  const s = footprintPixel(w, h, top);
  const N = 12, SECT = 6;
  for (let k = 0; k < SECT; k++) {
    const za = (top * k) / SECT, zb = (top * (k + 1)) / SECT;
    const ra = radius(za, top), rb = radius(zb, top);
    const pt = (r, i, z) => s.P((r * Math.cos((i / N) * Math.PI * 2)), (r * Math.sin((i / N) * Math.PI * 2)), z);
    // crossing diagonals of the section (two families of rulings)
    for (let i = 0; i < N; i++) {
      s.line(pt(ra, i, za), pt(rb, i + 1, zb), LATTICE, 0.9);
      s.line(pt(ra, i + 1, za), pt(rb, i, zb), LATTICE, 0.9);
    }
    // horizontal ring at each section boundary
    for (let i = 0; i < N; i++) s.line(pt(ra, i, za), pt(ra, i + 1, za), RING, 1);
  }
  // top ring
  const rt = radius(top, top);
  for (let i = 0; i < N; i++) {
    const a = [rt * Math.cos((i / N) * Math.PI * 2), rt * Math.sin((i / N) * Math.PI * 2)];
    const b = [rt * Math.cos(((i + 1) / N) * Math.PI * 2), rt * Math.sin(((i + 1) / N) * Math.PI * 2)];
    s.line(s.P(a[0], a[1], top), s.P(b[0], b[1], top), RING, 1);
  }
  return s.toSprite();
}

registerLandmark('shukhov_tower', (w, h) => buildShukhov(w, h));
