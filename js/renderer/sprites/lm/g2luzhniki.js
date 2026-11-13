/** R5f: Luzhniki stadium (2x2 footprint): low wide oval bowl, white/beige pilastered facade, translucent light-grey
 *  roof ring around the open middle, green pitch visible from above. */
import { footprintPixel, heightPx, PX } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

const A = 0.74, B = 0.56; // outer half-axes (tiles)
const AI = 0.52, BI = 0.38; // pitch / roof opening half-axes
const H = 18; // wall height px (low bowl)
const STEP = 0.012;
const inEllipse = (u, v, a, b) => (u / a) ** 2 + (v / b) ** 2 <= 1;

/** Iterate tile-space grid points inside ellipse (a,b). */
function gridIn(a, b, fn) {
  for (let u = -a; u <= a; u += STEP) for (let v = -b; v <= b; v += STEP) if (inEllipse(u, v, a, b)) fn(u, v);
}

/** Build the Luzhniki sprite. */
function buildLuzhniki(w, h) {
  const s = footprintPixel(w, h, H + 8);
  // pitch on the ground
  gridIn(AI, BI, (u, v) => s.dot(...s.P(u, v, 0), [63, 122, 79], 1, 0.08));
  // outer wall: segments sorted far-first, pilaster every 4th segment (darker)
  const N = 96, segs = [];
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    const a = [A * Math.cos(t0), B * Math.sin(t0)], b = [A * Math.cos(t1), B * Math.sin(t1)];
    const depth = (a[0] + a[1] + b[0] + b[1]) / 2;
    segs.push({ a, b, depth, f: (i % 4 === 0 ? 0.84 : 1) * (0.9 + 0.1 * Math.sin((t0 + t1) / 2)) });
  }
  segs.sort((p, q) => p.depth - q.depth);
  for (const g of segs) s.poly3([[g.a[0], g.a[1], 0], [g.b[0], g.b[1], 0], [g.b[0], g.b[1], H], [g.a[0], g.a[1], H]], '#e6dcc2', g.f);
  // upper stand band (stepped, lighter) on the rim
  const N2 = 96, rim = [];
  for (let i = 0; i < N2; i++) {
    const t = (i / N2) * Math.PI * 2;
    rim.push([A * Math.cos(t), B * Math.sin(t), H]);
  }
  // translucent light-grey roof ring: checkerboard over the annulus between the rim and the opening
  gridIn(A, B, (u, v) => {
    if (inEllipse(u, v, AI, BI)) return;
    const [x, y] = s.P(u, v, H);
    if (((Math.round(x) + Math.round(y)) & 1) === 0) s.dot(x, y, [196, 206, 212], 1, 0.04);
  });
  // rim line
  for (let i = 0; i < N2; i++) s.line(s.P(...rim[i]), s.P(...rim[(i + 1) % N2]), '#8d8577', 0.8);
  return s.toSprite();
}

registerLandmark('luzhniki', (w, h) => buildLuzhniki(w, h));
