/**
 * Tiny modelling kit for monuments/statues without OSM 3D data. All functions push planar faces
 * {pts:[[x,y,z]..], col:[r,g,b], kind} into `out`, in metres, x=east, y=south, z=up, relative to an origin
 * that place() later moves to a lat/lon and rotates (heading degrees clockwise from north).
 */
import { colour } from './s3db.js';

const col = (c) => (Array.isArray(c) ? c : colour(c) || [200, 200, 200]);

/** Axis-aligned box centred at (cx,cy) from z0 to z0+h, size sx (east) x sy (south). */
export function box(out, cx, cy, z0, sx, sy, h, c) {
  const C = col(c), x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z1 = z0 + h;
  const q = (a, b, cc, d) => out.push({ pts: [a, b, cc, d], col: C, kind: 'model' });
  q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
  q([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); q([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]);
  q([x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]); q([x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]);
}

/**
 * Surface of revolution around the vertical axis at (cx,cy): profile [[radius, z]..] bottom->top, n segments.
 * Radius 0 at the ends closes the shape. Use for columns, cones, spheres, domes, plinths, obelisk tips.
 */
export function lathe(out, cx, cy, profile, n, c) {
  const C = col(c); const R = profile.map(([r, z]) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI), z]));
  for (let k = 0; k + 1 < R.length; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, A = R[k], B = R[k + 1];
    if (profile[k][0] < 1e-6) out.push({ pts: [A[i], B[j], B[i]], col: C, kind: 'model' });
    else if (profile[k + 1][0] < 1e-6) out.push({ pts: [A[i], A[j], B[i]], col: C, kind: 'model' });
    else out.push({ pts: [A[i], A[j], B[j], B[i]], col: C, kind: 'model' });
  }
  if (profile[0][0] > 1e-6) out.push({ pts: R[0].slice().reverse(), col: C, kind: 'model' });
  if (profile[profile.length - 1][0] > 1e-6) out.push({ pts: R[R.length - 1], col: C, kind: 'model' });
}
export const cylinder = (out, cx, cy, z0, r, h, c, n = 12) => lathe(out, cx, cy, [[r, z0], [r, z0 + h]], n, c);
export const cone = (out, cx, cy, z0, r, h, c, n = 12) => lathe(out, cx, cy, [[r, z0], [0, z0 + h]], n, c);
export const sphere = (out, cx, cy, zc, r, c, n = 10) => lathe(out, cx, cy, Array.from({ length: 7 }, (_, k) => { const t = -Math.PI / 2 + (k / 6) * Math.PI; return [Math.max(0, r * Math.cos(t)), zc + r * Math.sin(t)]; }), n, c);

/** Vertical prism from a 2D polygon [[x,y]..] between z0 and z0+h. */
export function prism(out, poly, z0, h, c) {
  const C = col(c), z1 = z0 + h;
  out.push({ pts: poly.map(([x, y]) => [x, y, z1]), col: C, kind: 'model' });
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; out.push({ pts: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], col: C, kind: 'model' }); }
}

/** Tube (square cross-section, side w) along a 3D polyline [[x,y,z]..] — limbs, rods, scarves, swords. */
export function tube(out, path, w, c) {
  const C = col(c);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = Math.hypot(...d) || 1;
    const u = Math.abs(d[2]) / L > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let p = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]; const pl = Math.hypot(...p); p = p.map((v) => (v / pl) * w / 2);
    let q = [d[1] * p[2] - d[2] * p[1], d[2] * p[0] - d[0] * p[2], d[0] * p[1] - d[1] * p[0]]; const ql = Math.hypot(...q); q = q.map((v) => (v / ql) * w / 2);
    const corner = (o, s, t) => [o[0] + s * p[0] + t * q[0], o[1] + s * p[1] + t * q[1], o[2] + s * p[2] + t * q[2]];
    const cs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (let k = 0; k < 4; k++) { const [s0, t0] = cs[k], [s1, t1] = cs[(k + 1) % 4]; out.push({ pts: [corner(a, s0, t0), corner(a, s1, t1), corner(b, s1, t1), corner(b, s0, t0)], col: C, kind: 'model' }); }
  }
}

/** Flat polygon in 3D (sails, flags, wings, banners): pts [[x,y,z]..] (planar). */
export function panel(out, pts, c) { out.push({ pts, col: col(c), kind: 'model' }); }

/**
 * Standing human figure of height H at (cx,cy,z0) facing heading (deg, 0=north): legs, torso, head, arms.
 * pose: {armL:[dx,dy,dz], armR:[dx,dy,dz]} hand offsets from the shoulder in the figure's local frame
 * (x=right, y=forward, z=up, metres scaled by H/1.8); stride 0..1.
 */
export function figure(out, cx, cy, z0, H, heading, c, pose = {}) {
  const s = H / 1.8, h = (heading * Math.PI) / 180;
  const L = (x, y, z) => { const fx = Math.sin(h), fy = -Math.cos(h), rx = Math.cos(h), ry = Math.sin(h); return [cx + (x * rx + y * fx) * s, cy + (x * ry + y * fy) * s, z0 + z * s]; };
  const st = pose.stride || 0;
  tube(out, [L(-0.1, -st * 0.15, 0), L(-0.1, 0, 0.85)], 0.17 * s, c); tube(out, [L(0.1, st * 0.15, 0), L(0.1, 0, 0.85)], 0.17 * s, c);
  tube(out, [L(0, 0, 0.85), L(0, 0, 1.45)], 0.36 * s, c);
  sphere(out, ...L(0, 0, 1.6).slice(0, 2), z0 + 1.6 * s, 0.12 * s, c, 8);
  const sh = (side) => L(side * 0.22, 0, 1.4);
  const hand = (side, off) => { const b = [side * 0.22 + off[0], off[1], 1.4 + off[2]]; return L(...b); };
  tube(out, [sh(-1), hand(-1, pose.armL || [-0.05, 0, -0.6])], 0.11 * s, c);
  tube(out, [sh(1), hand(1, pose.armR || [0.05, 0, -0.6])], 0.11 * s, c);
  return { hand: (side) => hand(side, (side < 0 ? pose.armL : pose.armR) || [0, 0, -0.6]), L };
}

/** Move faces built around (0,0) to lat/lon (via toM) rotated by heading degrees (clockwise from north). */
export function place(faces, toM, lat, lon, heading = 0) {
  const [ox, oy] = toM(lat, lon), a = (heading * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (const f of faces) {
    const T = (p) => [ox + p[0] * c - p[1] * s, oy + p[0] * s + p[1] * c, p[2]];
    f.pts = f.pts.map(T); if (f.holes) f.holes = f.holes.map((r) => r.map(T));
  }
  return faces;
}

/** Lofted solid through cross-sections (each a ring [[x,y,z]..] of equal length), caps at both ends. */
export function loft(out, rings, c, caps = true) {
  const C = col(c), n = rings[0].length;
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n; out.push({ pts: [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], col: C, kind: 'model' });
  }
  if (caps) { out.push({ pts: rings[0].slice().reverse(), col: C, kind: 'model' }); out.push({ pts: rings[rings.length - 1].slice(), col: C, kind: 'model' }); }
}

/** Solid extruded along y from y0 to y1 from an x/z profile polygon [[x,z]..] (may be concave: arches, gables). */
export function extrudeY(out, prof, y0, y1, c) {
  const C = col(c);
  out.push({ pts: prof.map(([x, z]) => [x, y0, z]), col: C, kind: 'model' });
  out.push({ pts: prof.map(([x, z]) => [x, y1, z]).reverse(), col: C, kind: 'model' });
  for (let i = 0; i < prof.length; i++) { const a = prof[i], b = prof[(i + 1) % prof.length]; out.push({ pts: [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]], col: C, kind: 'model' }); }
}

/** Flat ribbon (scarf, flag, sail) along a path of [x,y,z] points with a vertical half-width per point. */
export function ribbon(out, path, hw, c) {
  const C = col(c);
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1], wa = Array.isArray(hw) ? hw[i] : hw, wb = Array.isArray(hw) ? hw[i + 1] : hw;
    out.push({ pts: [[a[0], a[1], a[2] - wa], [b[0], b[1], b[2] - wb], [b[0], b[1], b[2] + wb], [a[0], a[1], a[2] + wa]], col: C, kind: 'model' });
  }
}
