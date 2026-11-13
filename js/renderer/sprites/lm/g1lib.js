/** R5e helpers shared by the group-1 pixel landmarks (tile-space geometry, see pixelArt.js). */
import { PX, footprintPixel } from '../pixelArt.js';

/** Extra colours for the group-1 landmarks (muted, OpenGFX-like). */
export const C = {
  kBrick: '#a8432f', kBrickLt: '#c0593f', kWhite: '#ece6d6', kYellow: '#e4cf86', kCream: '#e6dcc0',
  kGreen: '#3d6b4a', kGold: '#e2b53b', kSilver: '#c8ccd4', kStone: '#c9c0ad', kGreyStone: '#8f8a80',
  kRed: '#b8352c', kBlue: '#3f6fb5', kPurple: '#7a4f9a', kTeal: '#4f9a7a', kGlass: '#9fc3cc', kBlack: '#3a3a3a',
  kGraniteDk: '#5a5652', kGraniteRed: '#7e2e22', kBronze: '#9b7a45', kPaving: '#8e6f63', kPavingLt: '#a3857a',
};

/** Hex colour -> [r,g,b]. */
function rgbOf(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

/** New footprint sprite, drawn by fn(sprite) and finished as a canvas sprite. */
export function build(w, h, tall, fn) {
  const s = footprintPixel(w, h, tall);
  fn(s);
  return s.toSprite();
}

/** Linear interpolation of two tile points. */
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * Crenellated wall along a CONVEX closed polygon [[u,v],...] of height H px, thickness t tiles.
 * Draws the visible outer faces (far-to-near), a lighter 2-3 px walkway on top and merlons.
 */
export function wallRun(s, pts, H, colour, t = 0.07, step = 0.1) {
  const n = pts.length;
  const cu = pts.reduce((a, p) => a + p[0], 0) / n, cv = pts.reduce((a, p) => a + p[1], 0) / n;
  const segs = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const du = q[0] - p[0], dv = q[1] - p[1], L = Math.hypot(du, dv);
    const mu = (p[0] + q[0]) / 2, mv = (p[1] + q[1]) / 2;
    let nu = dv / L, nv = -du / L;                         // one normal
    if (nu * (mu - cu) + nv * (mv - cv) > 0) { nu = -nu; nv = -nv; } // make it outward
    if (nu + nv <= 1e-9) continue;                          // back-facing
    segs.push({ p, q, nu, nv, f: nv >= nu ? 1.0 : 0.72, d: mu + mv });
  }
  segs.sort((a, b) => a.d - b.d);
  for (const { p, q, nu, nv, f } of segs) {
    s.poly3([[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], H], [p[0], p[1], H]], colour, f);
    // walkway: thickness t inward
    const pi = [p[0] - nu * t, p[1] - nv * t], qi = [q[0] - nu * t, q[1] - nv * t];
    s.poly3([[p[0], p[1], H], [q[0], q[1], H], [qi[0], qi[1], H], [pi[0], pi[1], H]], PX.stone, 1.05);
    const cnt = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < cnt; k += 2) {
      const A = lerp2(p, q, k / cnt), B = lerp2(p, q, Math.min(1, (k + 1) / cnt));
      s.poly3([[A[0], A[1], H + 1], [B[0], B[1], H + 1], [B[0], B[1], H + 4], [A[0], A[1], H + 4]], colour, f * 1.03);
    }
  }
}

/** Hipped tent roof (two visible faces) over a rectangle with apex at z1. */
export function tent(s, u, v, hu, hv, z0, z1, colour) {
  const ap = [u, v, z1];
  s.poly3([[u - hu, v + hv, z0], [u + hu, v + hv, z0], ap], colour, 1.0);
  s.poly3([[u + hu, v - hv, z0], [u + hu, v + hv, z0], ap], colour, 0.72);
}

/** Square tower: box body + optional tent roof (roofH px) + optional star. */
export function tower(s, u, v, hu, hv, z0, z1, body, roofCol, roofH = 0, star = false) {
  s.box(u - hu, v - hv, u + hu, v + hv, z0, z1, body, { noTop: roofH > 0 });
  if (roofH > 0) tent(s, u, v, hu * 1.15, hv * 1.15, z1, z1 + roofH, roofCol);
  if (star) s.star(u, v, z1 + roofH + 2);
}

/**
 * Onion dome with diagonal stripes painted over it (St Basil's style). base colour, stripe colour.
 */
export function stripeDome(s, u, v, r, z0, hgt, base, stripe) {
  s.onion(u, v, r, z0, hgt, base, C.kGold);
  const [cx, cy0] = s.P(u, v, z0);
  const rx = r * 45.25 * 0.85, rgb = rgbOf(stripe);
  for (let y = Math.floor(cy0 - hgt); y <= cy0; y++) {
    const t = (y + 0.5 - (cy0 - hgt / 2)) / (hgt / 2);
    const hw = rx * Math.sqrt(Math.max(0, 1 - t * t));
    for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
      if (((x + y) >> 2) & 1) s.dot(x, y, rgb, 1.05, 0.02);
    }
  }
}
