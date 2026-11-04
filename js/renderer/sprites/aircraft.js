/**
 * Procedural aircraft sprites (top-3/4 isometric). Each model has its own geometry: props
 * (li2, il14), narrow jets with rear engines and T-tail (tu104, tu134, ssj100), wing-mounted
 * narrow-bodies (a320), widebodies (il86, b777). Eight headings (45° steps, 0 = +u) and four
 * liveries. Sprites are anchored at the aircraft centre on the ground plane (z = 0); the body
 * itself is drawn lifted by LIFT px so the renderer can offset it by altitude.
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { HALF_W, HALF_H } from '../iso.js';

const cache = new SpriteCache();
/** Size (logical px) of an aircraft sprite; anchor at its centre. */
export const AIRCRAFT_SIZE = 120;
/** Body lift above the ground anchor (px). */
const LIFT = 12;

/**
 * Model geometry. L fuselage length, S wingspan, fuse fuselage width px, fin height px.
 * kind: 'prop' | 'jet'; eng: 'wing' | 'rear' | 'none'; nEng: engines per side (wing mount);
 * tail: 'fin' | 'T'; sweep: wing sweep (tile units); width: 'narrow' | 'wide'.
 */
export const AIRCRAFT_GEOM = {
  ac_li2: { L: 0.52, S: 0.62, fuse: 5, fin: 14, kind: 'prop', eng: 'wing', nEng: 1, tail: 'fin', sweep: 0.02 },
  ac_il14: { L: 0.56, S: 0.64, fuse: 6, fin: 15, kind: 'prop', eng: 'wing', nEng: 1, tail: 'fin', sweep: 0.02 },
  ac_tu104: { L: 0.72, S: 0.58, fuse: 7, fin: 24, kind: 'jet', eng: 'rear', nEng: 1, tail: 'fin', sweep: 0.14 },
  ac_tu134: { L: 0.68, S: 0.56, fuse: 7, fin: 24, kind: 'jet', eng: 'rear', nEng: 1, tail: 'T', sweep: 0.12 },
  ac_il86: { L: 0.84, S: 0.74, fuse: 10, fin: 26, kind: 'jet', eng: 'wing', nEng: 2, tail: 'fin', sweep: 0.12, wide: true },
  ac_b777: { L: 0.92, S: 0.84, fuse: 11, fin: 28, kind: 'jet', eng: 'wing', nEng: 1, tail: 'fin', sweep: 0.13, wide: true },
  ac_a320: { L: 0.74, S: 0.68, fuse: 8, fin: 22, kind: 'jet', eng: 'wing', nEng: 1, tail: 'fin', sweep: 0.1 },
  ac_ssj100: { L: 0.64, S: 0.6, fuse: 7, fin: 21, kind: 'jet', eng: 'rear', nEng: 1, tail: 'fin', sweep: 0.1 },
};

/** Liveries: body, cheatline, tail fin, label. */
export const LIVERIES = [
  { id: 'aeroflot', body: '#f8fafc', stripe: '#1e3a8a', tail: '#dc2626' },
  { id: 's7', body: '#f8fafc', stripe: '#15803d', tail: '#22c55e' },
  { id: 'pobeda', body: '#f8fafc', stripe: '#6d28d9', tail: '#1d4ed8' },
  { id: 'vintage', body: '#cbd5e1', stripe: '#475569', tail: '#64748b' },
];

/**
 * Geometry for a model id (falls back to a320 for unknown ids).
 * @param {string} id
 */
export function aircraftGeom(id) {
  return AIRCRAFT_GEOM[id] || AIRCRAFT_GEOM.ac_a320;
}

/**
 * Stable livery index from model + vehicle id (props favour the silver/vintage scheme).
 * @param {string} modelId
 * @param {number|string} vid
 * @returns {number} index into LIVERIES
 */
export function liveryIndex(modelId, vid) {
  let h = 2166136261;
  const s = `${modelId}:${vid}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = (h >>> 0) % 100;
  const g = aircraftGeom(modelId);
  if (g.kind === 'prop') return h < 60 ? 3 : 0;
  return h < 50 ? 0 : h < 75 ? 1 : 2;
}

/**
 * Heading index (0..7) from a travel vector in tile space (dx = +u, dy = +v).
 * @param {number} dx
 * @param {number} dy
 */
export function headingIndex(dx, dy) {
  const a = Math.atan2(dy, dx);
  const k = Math.round(a / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}

/**
 * Aircraft sprite for a model, heading and livery.
 * @param {string} modelId
 * @param {number} heading 0..7 (0 = +u, 2 = +v)
 * @param {number} livery index into LIVERIES
 * @param {boolean} [flat] ground shadow silhouette (no lift, no altitude shading)
 */
export function aircraftSprite(modelId, heading, livery, flat) {
  const h = ((heading | 0) % 8 + 8) % 8;
  const lv = ((livery | 0) % LIVERIES.length + LIVERIES.length) % LIVERIES.length;
  const key = `ac:${modelId}:${h}:${lv}:${flat ? 1 : 0}`;
  const g = aircraftGeom(modelId);
  return cache.get(key, () => makeSprite(AIRCRAFT_SIZE, AIRCRAFT_SIZE, AIRCRAFT_SIZE / 2, AIRCRAFT_SIZE / 2, (ctx) => {
    if (flat) drawShadow(ctx, g, h);
    else drawPlane(ctx, g, h, LIVERIES[lv]);
  }));
}

/**
 * Sprite-local projection: fuselage-frame (a = along nose, b = right wing, z up) to px.
 * @param {number} f0 cos of heading
 * @param {number} f1 sin of heading
 */
function frame(h) {
  const t = h * Math.PI / 4;
  const fu = Math.cos(t), fv = Math.sin(t);
  const pu = -fv, pv = fu;
  return (a, b, z) => {
    const u = fu * a + pu * b, v = fv * a + pv * b;
    return [(u - v) * HALF_W, (u + v) * HALF_H - z - LIFT];
  };
}

/** Stroke a polyline of frame points. */
function strokePts(ctx, Q, pts, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach(([a, b, z], i) => {
    const [x, y] = Q(a, b, z);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

/** Fill a polygon of frame points. */
function fillPts(ctx, Q, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([a, b, z], i) => {
    const [x, y] = Q(a, b, z);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

/** Ground shadow: flat silhouette (wings + fuselage) at z = 0. */
function drawShadow(ctx, g, h) {
  const Q = frame(h);
  const L = g.L, S = g.S;
  ctx.globalAlpha = 1;
  const sh = 'rgba(0,0,0,0.32)';
  fillPts(ctx, Q, wingPts(g, 1, 0), sh);
  fillPts(ctx, Q, wingPts(g, -1, 0), sh);
  strokePts(ctx, Q, [[-L / 2, 0, 0], [L / 2, 0, 0]], sh, g.fuse * 0.9);
  void S;
}

/**
 * Wing outline on one side (s = +1 right, -1 left) at height z.
 * @returns {number[][]} frame points [a,b,z]
 */
function wingPts(g, s, z) {
  const L = g.L, S = g.S;
  const aR = L * 0.12, chordR = L * 0.24, chordT = L * 0.1;
  const tipA = aR - g.sweep - (g.wide ? 0.0 : 0);
  const bR = 0.05, bT = S / 2;
  return [
    [aR, s * bR, z],
    [tipA, s * bT, z],
    [tipA - chordT, s * bT, z],
    [aR - chordR, s * bR, z],
  ];
}

/** Full plane with livery. */
function drawPlane(ctx, g, h, lv) {
  const Q = frame(h);
  const L = g.L, S = g.S;
  const zb = 10; // fuselage axis height
  const wingZ = 6;
  const engZ = 4;
  const edge = 'rgba(15,23,42,0.45)';
  void edge;

  // engines behind/under wings (wing-mounted)
  const shade = '#94a3b8';
  if (g.eng === 'wing') {
    const n = g.nEng;
    for (const s of [1, -1]) {
      for (let k = 0; k < n; k++) {
        const b = s * (S * (0.18 + k * 0.2));
        const a0 = L * 0.12 - 0.06;
        if (g.kind === 'prop') {
          strokePts(ctx, Q, [[a0 + 0.04, b, engZ], [a0 + 0.1, b, engZ]], '#1f2937', 5);
          // propeller disc (seen edge-on-ish)
          strokePts(ctx, Q, [[a0 + 0.12, b, engZ + 1.5], [a0 + 0.12, b, engZ - 1.5]], '#e5e7eb', 2);
          strokePts(ctx, Q, [[a0 + 0.13, b, engZ + 6], [a0 + 0.13, b, engZ - 6]], 'rgba(148,163,184,0.7)', 1.2);
        } else {
          strokePts(ctx, Q, [[a0 - 0.02, b, engZ], [a0 + 0.1, b, engZ]], '#334155', 6);
          strokePts(ctx, Q, [[a0 - 0.02, b, engZ], [a0 + 0.06, b, engZ]], '#94a3b8', 3);
        }
      }
    }
  }

  // wings (light body colour, shaded lower-left)
  const wcol = lv.body;
  fillPts(ctx, Q, wingPts(g, 1, wingZ), wcol);
  fillPts(ctx, Q, wingPts(g, -1, wingZ), shade);

  // rear engines (side-mounted on the aft fuselage)
  if (g.eng === 'rear') {
    for (const s of [1, -1]) {
      strokePts(ctx, Q, [[-L * 0.22, s * 0.07, 8], [-L * 0.1, s * 0.07, 8]], '#334155', 5);
    }
  }

  // horizontal tail
  const tailA = -L * 0.44;
  const tailZ = g.tail === 'T' ? g.fin : 9;
  const hs = [[tailA + 0.07, 0, tailZ - 1], [tailA - 0.04, 0.23, tailZ - 1], [tailA - 0.12, 0.23, tailZ - 1], [tailA - 0.06, 0, tailZ - 1]];
  fillPts(ctx, Q, hs, wcol);
  fillPts(ctx, Q, hs.map(([a, b, z]) => [a, -b, z]), shade);

  // vertical fin in livery tail colour
  const finTop = g.tail === 'T' ? g.fin + 2 : g.fin;
  const fin = [[tailA + 0.1, 0, zb], [tailA - 0.08, 0, finTop], [tailA - 0.02, 0, zb]];
  fillPts(ctx, Q, fin, lv.tail);
  // fin is perpendicular to the wings; fallback thin silhouette outline
  strokePts(ctx, Q, [[tailA + 0.1, 0, zb], [tailA - 0.08, 0, finTop]], 'rgba(0,0,0,0.25)', 0.6);

  // fuselage: white body, belly shade underneath, livery stripe along the side
  strokePts(ctx, Q, [[-L / 2 + 0.02, 0, zb - 1.5], [L / 2 - 0.05, 0, zb - 1.5]], '#94a3b8', g.fuse + 1);
  strokePts(ctx, Q, [[-L / 2, 0, zb], [L / 2 - 0.02, 0, zb]], wcol, g.fuse);
  // livery cheatline (stripe) over the middle of the fuselage
  strokePts(ctx, Q, [[-L / 2 + 0.04, 0, zb + 0.5], [L / 2 - 0.12, 0, zb + 0.5]], lv.stripe, Math.max(1.4, g.fuse * 0.22));
  // windows (dashes)
  const win = '#1e3a5f';
  const n = Math.round(L * 14);
  for (let i = 0; i < n; i++) {
    const a = -L / 2 + 0.1 + (i / n) * (L - 0.24);
    strokePts(ctx, Q, [[a, 0, zb + 2.6], [a + 0.012, 0, zb + 2.6]], win, Math.max(1, g.fuse * 0.22));
  }
  // cockpit windscreen
  strokePts(ctx, Q, [[L / 2 - 0.06, 0, zb + 1.8], [L / 2 - 0.02, 0, zb + 1.5]], '#0f172a', Math.max(1.5, g.fuse * 0.4));

  // jet engine intakes / prop noses drawn on top for the wing engines
  if (g.eng === 'rear') {
    for (const s of [1, -1]) strokePts(ctx, Q, [[-L * 0.22, s * 0.07, 8], [-L * 0.2, s * 0.07, 8]], '#e2e8f0', 3);
  }
}
