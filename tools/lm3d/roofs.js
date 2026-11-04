/**
 * Part (rings in metres x=east,y=south + S3DB spec) -> planar faces {pts:[[x,y,z]..], holes?:[[..]], col:[r,g,b], kind}.
 * Roof shapes: flat, skillion, pyramidal, dome, onion, gabled/hipped/gambrel/mansard/round (on the oriented
 * bounding rectangle when the footprint is close to a rectangle).
 */
const area = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
export const ringArea = (r) => Math.abs(area(r));
export function centroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; const f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  if (Math.abs(a) < 1e-9) { const n = r.length; return [r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n]; }
  return [cx / (3 * a), cy / (3 * a)];
}
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Oriented min-area rectangle: {c:[x,y], u:[ux,uy] (long axis), L, W}. */
export function obr(ring) {
  const h = hull(ring); let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], v = [-u[1], u[0]];
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of h) { const pu = p[0] * u[0] + p[1] * u[1], pv = p[0] * v[0] + p[1] * v[1]; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    const A = (u1 - u0) * (v1 - v0);
    if (!best || A < best.A) {
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      best = { A, c: [u[0] * cu + v[0] * cv, u[1] * cu + v[1] * cv], u, v, L: u1 - u0, W: v1 - v0 };
    }
  }
  if (best && best.W > best.L) { const { u, v, L, W } = best; best.u = v; best.v = [-v[0], -v[1]]; best.L = W; best.W = L; void u; }
  return best;
}
const shadeCol = (c, f) => c.map((x) => Math.max(0, Math.min(255, x * f)));

/** Walls of a ring from zmin to top(p) (top may be a function). */
function walls(out, ring, zmin, top, col) {
  const T = typeof top === 'function' ? top : () => top;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ta = T(a), tb = T(b);
    if (ta <= zmin + 0.01 && tb <= zmin + 0.01) continue;
    out.push({ pts: [[a[0], a[1], zmin], [b[0], b[1], zmin], [b[0], b[1], tb], [a[0], a[1], ta]], col, kind: 'wall' });
  }
}
/** Rings scaled toward a centre and lifted by profile [[scale, zfrac]..] -> faces. */
function lathe(out, ring, c, z0, h, profile, col) {
  const rings = profile.map(([s, f]) => ring.map((p) => [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s, z0 + h * f]));
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      if (profile[k + 1][0] < 1e-3) out.push({ pts: [A[i], A[j], B[i]], col, kind: 'roof' });
      else out.push({ pts: [A[i], A[j], B[j], B[i]], col, kind: 'roof' });
    }
  }
}
const ONION = [[1, 0], [1.14, 0.1], [1.22, 0.22], [1.18, 0.34], [1.02, 0.46], [0.78, 0.58], [0.52, 0.7], [0.3, 0.8], [0.14, 0.89], [0.06, 0.95], [0, 1]];
const DOME = Array.from({ length: 9 }, (_, k) => { const t = (k / 8) * Math.PI / 2; return [Math.cos(t), Math.sin(t)]; });

/** Smooth ring (round towers: many vertices) helper for lathe of polygons with few vertices: densify circles. */
function densify(ring, n = 24) {
  if (ring.length >= 12) return ring;
  const c = centroid(ring); const r = Math.sqrt(ringArea(ring) / Math.PI);
  return Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((i / n) * 2 * Math.PI), c[1] + r * Math.sin((i / n) * 2 * Math.PI)]);
}

/** Rectangle roofs on the OBR. kind: gabled|hipped|round. along: ridge along the long axis. */
function rectRoof(out, R, z0, h, kind, along, col, wallCol) {
  let { c, u, v, L, W } = R;
  if (!along) { [u, v] = [v, [-u[0], -u[1]]]; [L, W] = [W, L]; }
  const P = (a, b, z) => [c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, z];
  const l = L / 2, w = W / 2;
  if (kind === 'round') {
    const n = 8; const prof = Array.from({ length: n + 1 }, (_, k) => { const t = (k / n) * Math.PI; return [-w * Math.cos(t), h * Math.sin(t)]; });
    for (let k = 0; k < n; k++) out.push({ pts: [P(-l, prof[k][0], z0 + prof[k][1]), P(l, prof[k][0], z0 + prof[k][1]), P(l, prof[k + 1][0], z0 + prof[k + 1][1]), P(-l, prof[k + 1][0], z0 + prof[k + 1][1])], col, kind: 'roof' });
    for (const s of [-l, l]) out.push({ pts: prof.map(([b, z]) => P(s, b, z0 + z)), col: wallCol, kind: 'wall' });
    return;
  }
  if (kind === 'hipped' && l > w * 0.98) {
    const r = Math.max(0, l - w);
    out.push({ pts: [P(-l, -w, z0), P(l, -w, z0), P(r, 0, z0 + h), P(-r, 0, z0 + h)], col, kind: 'roof' });
    out.push({ pts: [P(l, w, z0), P(-l, w, z0), P(-r, 0, z0 + h), P(r, 0, z0 + h)], col, kind: 'roof' });
    out.push({ pts: [P(l, -w, z0), P(l, w, z0), P(r, 0, z0 + h)], col, kind: 'roof' });
    out.push({ pts: [P(-l, w, z0), P(-l, -w, z0), P(-r, 0, z0 + h)], col, kind: 'roof' });
    return;
  }
  out.push({ pts: [P(-l, -w, z0), P(l, -w, z0), P(l, 0, z0 + h), P(-l, 0, z0 + h)], col, kind: 'roof' });
  out.push({ pts: [P(l, w, z0), P(-l, w, z0), P(-l, 0, z0 + h), P(l, 0, z0 + h)], col, kind: 'roof' });
  for (const s of [-l, l]) out.push({ pts: [P(s, -w, z0), P(s, w, z0), P(s, 0, z0 + h)], col: wallCol, kind: 'wall' });
}

/**
 * Faces for one part.
 * @param {{outer:number[][][], inner:number[][][]}} poly rings in metres
 * @param {ReturnType<import('./s3db.js').partSpec>} s
 */
export function partFaces(poly, s) {
  const out = [];
  const outer = poly.outer[0]; if (!outer || outer.length < 3) return out;
  const { minH, wallH, roofH, top } = s;
  let shape = s.shape;
  const wallCol = s.wall, roofCol = s.roof;
  if (['gabled', 'hipped', 'gambrel', 'mansard', 'round', 'apse_gabled', 'half-hipped', 'saltbox', 'side_hipped'].includes(shape)) {
    const R = obr(outer);
    const fill = R ? ringArea(outer) / Math.max(1e-6, R.L * R.W) : 0;
    if (!R || fill < 0.72 || roofH < 0.3) shape = roofH < 0.3 ? 'flat' : 'pyramidal';
    else {
      for (const r of poly.outer.concat(poly.inner)) walls(out, r, minH, wallH, wallCol);
      const kind = shape === 'round' ? 'round' : shape === 'hipped' || shape === 'mansard' || shape === 'half-hipped' || shape === 'side_hipped' ? 'hipped' : 'gabled';
      rectRoof(out, R, wallH, roofH, kind, s.orient !== 'across', roofCol, wallCol);
      return out;
    }
  }
  if (shape === 'skillion' && roofH > 0.05) {
    let d;
    if (s.dir != null) { const t = (s.dir * Math.PI) / 180; d = [Math.sin(t), -Math.cos(t)]; }
    else { const R = obr(outer); d = R ? R.v : [0, 1]; }
    let t0 = 1e9, t1 = -1e9;
    for (const p of outer) { const t = p[0] * d[0] + p[1] * d[1]; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const H = (p) => wallH + (roofH * (t1 - (p[0] * d[0] + p[1] * d[1]))) / Math.max(1e-6, t1 - t0);
    for (const r of poly.outer.concat(poly.inner)) walls(out, r, minH, H, wallCol);
    out.push({ pts: outer.map((p) => [p[0], p[1], H(p)]), holes: poly.inner.map((r) => r.map((p) => [p[0], p[1], H(p)])), col: roofCol, kind: 'roof' });
    return out;
  }
  if (shape === 'dome' || shape === 'onion') {
    const ring = densify(outer, 28); const c = centroid(ring);
    walls(out, ring, minH, wallH, wallCol);
    lathe(out, ring, c, wallH, roofH, shape === 'onion' ? ONION : DOME, roofCol);
    return out;
  }
  if (shape === 'pyramidal' || shape === 'cone') {
    const ring = shape === 'cone' ? densify(outer, 24) : outer; const c = centroid(ring);
    walls(out, ring, minH, wallH, wallCol);
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; out.push({ pts: [[a[0], a[1], wallH], [b[0], b[1], wallH], [c[0], c[1], top]], col: roofCol, kind: 'roof' }); }
    return out;
  }
  // flat (and unknown)
  const H = shape === 'flat' ? top : wallH + roofH * 0.5;
  for (const r of poly.outer.concat(poly.inner)) walls(out, r, minH, H, wallCol);
  out.push({ pts: outer.map((p) => [p[0], p[1], H]), holes: poly.inner.map((r) => r.map((p) => [p[0], p[1], H])), col: shape === 'flat' ? roofCol : roofCol, kind: 'roof' });
  return out;
}
export { shadeCol };
