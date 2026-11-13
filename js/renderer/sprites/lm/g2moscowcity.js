/** R5f: Moscow City business district (3x2): glass towers of varied height with floor lines, gaps between towers. */
import { footprintPixel, heightPx, PX } from '../pixelArt.js';
import { registerLandmark } from './registry.js';

const cols = (lenPx) => Math.max(2, Math.round(lenPx / 5));

/** One glass box segment with floor lines (windows) on both visible faces. */
function glass(s, u, v, hu, hv, z0, z1, colour, win, lit) {
  s.box(u - hu, v - hv, u + hu, v + hv, z0, z1, colour, {
    windows: { rows: Math.max(2, Math.round((z1 - z0) / 3)), cols: cols(hu * 64), colsR: cols(hv * 64), colour: win, lit },
  });
}

/** Tapering tower: stacked segments shrinking by `taper` (0..1) toward the top, optional spire. */
function tower(s, t) {
  const steps = Math.max(3, Math.round(t.h / 20)), dz = t.h / steps;
  for (let i = 0; i < steps; i++) {
    const k = 1 - (t.taper || 0) * (i / steps);
    glass(s, t.u, t.v, t.hu * k, t.hv * k, i * dz, (i + 1) * dz, t.c, t.win || PX.window, t.lit ?? 0.1);
  }
  if (t.spire) s.spire(t.u, t.v, t.hu * (1 - (t.taper || 0)) * 0.5, t.h, t.h + t.spire, t.c, false);
}

/** Twisted, stepped tower (Evolution): each storey rotated/shifted around the axis. */
function twisted(s, t) {
  const n = 9, dz = t.h / n;
  for (let i = 0; i < n; i++) {
    const du = 0.05 * Math.sin(i * 0.7), dv = 0.05 * Math.cos(i * 0.7), k = 1 - 0.03 * i;
    glass(s, t.u + du, t.v + dv, t.hu * k, t.hv * k, i * dz, (i + 1) * dz, t.c, PX.window, 0.15);
  }
}

/** Towers, in tile space (footprint 3x2, centre 0,0). Heights are real metres mapped via heightPx. */
const TOWERS = [
  { kind: 'tower', id: 'federation', u: 0.55, v: -0.45, hu: 0.2, hv: 0.2, h: heightPx(373), taper: 0.7, spire: 14, c: '#6f8aa0', win: '#2f4a66', lit: 0.12 },
  { kind: 'tower', id: 'federation2', u: 1.1, v: -0.1, hu: 0.16, hv: 0.16, h: heightPx(260), taper: 0.5, spire: 8, c: '#7b95a8', win: '#2f4a66' },
  { kind: 'tower', id: 'mercury', u: -0.25, v: 0.1, hu: 0.24, hv: 0.24, h: heightPx(338), taper: 0.55, spire: 0, c: '#a88040', win: '#6e5226', lit: 0.2 },
  { kind: 'tower', id: 'oko_a', u: -1.1, v: -0.5, hu: 0.2, hv: 0.2, h: heightPx(354), taper: 0.2, spire: 0, c: '#2f3d4f', win: '#dfe6ee', lit: 0 },
  { kind: 'tower', id: 'oko_b', u: -0.6, v: -0.45, hu: 0.2, hv: 0.2, h: heightPx(300), taper: 0.2, spire: 0, c: '#34445a', win: '#dfe6ee', lit: 0 },
  { kind: 'twisted', id: 'evolution', u: 0.25, v: 0.55, hu: 0.16, hv: 0.16, h: heightPx(246), c: '#7aa4b8' },
  { kind: 'tower', id: 'naberezhnaya', u: 0.5, v: 0.6, hu: 0.14, hv: 0.14, h: heightPx(220), taper: 0.4, spire: 0, c: '#5f86b5' },
  { kind: 'tower', id: 'imperia', u: -0.95, v: 0.55, hu: 0.16, hv: 0.16, h: heightPx(232), taper: 0.6, spire: 10, c: '#8fb0c8' },
  { kind: 'tower', id: 'small_a', u: 1.2, v: 0.6, hu: 0.1, hv: 0.1, h: heightPx(120), taper: 0, spire: 0, c: '#5f86b5' },
  { kind: 'tower', id: 'small_b', u: -1.3, v: -0.05, hu: 0.1, hv: 0.1, h: heightPx(110), taper: 0.2, spire: 0, c: '#6f8aa0' },
];

/** Build the Moscow City sprite for a 3x2 footprint. */
function buildMoscowCity(w, h) {
  const top = Math.max(...TOWERS.map((t) => t.h + (t.spire || 0)));
  const s = footprintPixel(w, h, top);
  // far first (small u+v), so nearer towers overdraw
  const order = [...TOWERS].sort((a, b) => (a.u + a.v) - (b.u + b.v));
  for (const t of order) (t.kind === 'twisted' ? twisted : tower)(s, t);
  return s.toSprite();
}

registerLandmark('moscow_city', (w, h) => buildMoscowCity(w, h));
