/** R5f: Ostankino TV tower (540 m): concrete cone base on legs, thin shaft, red/white observation pod, striped antenna. */
import { footprintPixel, heightPx, PX } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

const CONCRETE = '#c9c8c2';

/** Ostankino sprite for a 1x1 footprint (the tower is only a few px wide). */
export function buildOstankino(w, h) {
  const top = heightPx(540);
  const s = footprintPixel(w, h, top);
  // ten legs from a ground ring up to the base cone (drawn behind the cone)
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    s.line(s.P(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0), s.P(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 46), '#7d7d7a', 1);
  }
  // tapered base cone (grey-white concrete) z 0..60 px
  s.revolve(0, 0, 0, 60, (t) => 0.2 * (1 - t) + 0.035 * t, CONCRETE);
  // shaft z 60..168
  s.revolve(0, 0, 60, 168, (t) => 0.045 - 0.012 * t, CONCRETE);
  // observation pod near 337 m (white, red band, white)
  const pod = heightPx(337);
  s.cylinder(0, 0, 0.07, pod - 9, pod - 4, PX.white);
  s.cylinder(0, 0, 0.1, pod - 4, pod + 1, PX.red);
  s.cylinder(0, 0, 0.09, pod + 1, pod + 6, PX.white);
  s.cylinder(0, 0, 0.05, pod + 6, pod + 10, PX.white);
  // antenna spine up to the top, red/white stripes
  for (let z = pod + 10; z < top; z += 8) {
    const c = ((z - pod) / 8) % 2 ? PX.white : PX.red;
    s.cylinder(0, 0, 0.03, z, Math.min(top, z + 8), c);
  }
  return s.toSprite();
}

registerLandmark('ostankino', (w, h) => buildOstankino(w, h));
