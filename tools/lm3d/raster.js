/**
 * Z-buffered scanline rasteriser for planar 3D faces in the game's isometric projection.
 * World: x=east m, y=south m, z=up m. Screen (zoom s): sx=(x-y)*32/200*s, sy=(x+y)*16/200*s - z*VZ*s.
 * VZ = 0.196 px/m (true 2:1 dimetric: 30 deg elevation). Flat shading, sun from the south-west-ish
 * (left faces lit, right faces darker, like OpenTTD/OpenGFX), silhouette darkening for crisp pixel art.
 */
export const KX = 32 / 200, KY = 16 / 200, VZ = 0.196;
const DEPTH_Z = (2 * KY) / VZ; // closeness = x + y + DEPTH_Z*z
const SUN = (() => { const v = [-0.35, 0.8, 1.1]; const l = Math.hypot(...v); return v.map((c) => c / l); })();
const VIEW = (() => { const v = [1, 1, DEPTH_Z]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

/** Per-pixel textures: return a brightness multiplier for face-local (u,v) metres. */
const TEX = {
  // windows: 1.6 m wide every 3.4 m, 1.5 m tall every 3.3 m from 1.2 m; none on the ground floor band of tiny walls
  win: (u, v) => { const a = ((u % 3.4) + 3.4) % 3.4, b = ((v - 1.0) % 3.3 + 3.3) % 3.3; return a > 0.9 && a < 2.5 && b > 0.9 && b < 2.4 ? 0.62 : 1; },
};
/** Affine screen->value map from a ring's projected points (sx,sy) and per-vertex values. */
function affine(R, vals) {
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) for (let k = j + 1; k < R.length; k++) {
    const a = R[i], b = R[j], c = R[k];
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(det) < 0.5) continue;
    const va = vals[i], vb = vals[j], vc = vals[k];
    const A = ((vb - va) * (c[1] - a[1]) - (vc - va) * (b[1] - a[1])) / det;
    const B = ((vc - va) * (b[0] - a[0]) - (vb - va) * (c[0] - a[0])) / det;
    return [A, B, va - A * a[0] - B * a[1]];
  }
  return null;
}

function normal(pts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
  const l = Math.hypot(nx, ny, nz); return l < 1e-9 ? null : [nx / l, ny / l, nz / l];
}

/**
 * Render faces at zoom s. Returns {w,h,ox,oy,rgba,depth,id}: (ox,oy) = screen position of world origin (0,0,0)
 * inside the image. Faces: {pts, holes?, col:[r,g,b], kind, light?:number}.
 */
export function render(faces, s, opts = {}) {
  const kx = KX * s, ky = KY * s, vz = VZ * s;
  const P = (p) => [(p[0] - p[1]) * kx, (p[0] + p[1]) * ky - p[2] * vz];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of faces) for (const p of f.pts) { const q = P(p); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  const pad = 2; const ox = Math.floor(-x0) + pad, oy = Math.floor(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2 + 1, h = Math.ceil(y1 - y0) + pad * 2 + 1;
  const rgba = new Uint8ClampedArray(w * h * 4), depth = new Float32Array(w * h).fill(-1e9), id = new Int32Array(w * h).fill(-1);
  const amb = opts.ambient ?? 0.5, dif = opts.diffuse ?? 0.62;
  faces.forEach((f, fi) => {
    const n0 = normal(f.pts); if (!n0) return;
    let n = n0; if (n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] < 0) n = n.map((c) => -c);
    const lum = (amb + dif * Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2])) * (f.light ?? 1);
    const col = f.col.map((c) => Math.min(255, c * lum));
    const rings = [f.pts, ...(f.holes || [])].map((r) => r.map((p) => { const q = P(p); return [q[0] + ox, q[1] + oy, p[0] + p[1] + DEPTH_Z * p[2]]; }));
    // depth plane c = A*sx + B*sy + C from the 3D plane: use 3 best-spread vertices of the outer ring
    const R = rings[0]; let A = 0, B = 0, C = 0, ok = false;
    for (let i = 0; i < R.length && !ok; i++) for (let j = i + 1; j < R.length && !ok; j++) for (let k = j + 1; k < R.length && !ok; k++) {
      const a = R[i], b = R[j], c = R[k];
      const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      if (Math.abs(det) < 0.02) continue;
      A = ((b[2] - a[2]) * (c[1] - a[1]) - (c[2] - a[2]) * (b[1] - a[1])) / det;
      B = ((c[2] - a[2]) * (b[0] - a[0]) - (b[2] - a[2]) * (c[0] - a[0])) / det;
      C = a[2] - A * a[0] - B * a[1]; ok = true;
    }
    if (!ok) return; // edge-on face
    let U = null, V = null;
    if (f.uv && f.tex && s >= (opts.texMinZoom ?? 2)) { U = affine(R, f.uv.map((t) => t[0])); V = affine(R, f.uv.map((t) => t[1])); if (!U || !V) U = V = null; }
    let ry0 = 1e9, ry1 = -1e9; for (const r of rings) for (const p of r) { ry0 = Math.min(ry0, p[1]); ry1 = Math.max(ry1, p[1]); }
    const yA = Math.max(0, Math.ceil(ry0 - 0.5)), yB = Math.min(h - 1, Math.floor(ry1 - 0.5));
    const xs = []; const clipG = opts.clip && f.kind === 'ground';
    for (let y = yA; y <= yB; y++) {
      const yc = y + 0.5; xs.length = 0;
      for (const r of rings) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
        for (let x = xa; x <= xb; x++) {
          const o = y * w + x; const d = A * (x + 0.5) + B * yc + C + (f.bias || 0);
          if (d <= depth[o]) continue;
          if (clipG && !opts.clip(((x + 0.5 - ox) / kx + (yc - oy) / ky) / 2, ((yc - oy) / ky - (x + 0.5 - ox) / kx) / 2)) continue;
          depth[o] = d; id[o] = fi; const q = o * 4;
          let m = 1;
          if (U) { const u = U[0] * (x + 0.5) + U[1] * yc + U[2], v = V[0] * (x + 0.5) + V[1] * yc + V[2]; m = TEX[f.tex](u, v, f); }
          rgba[q] = col[0] * m; rgba[q + 1] = col[1] * m; rgba[q + 2] = col[2] * m; rgba[q + 3] = 255;
        }
      }
    }
  });
  if (opts.outline !== false) outline(rgba, depth, id, w, h, opts.outlineGap ?? 3);
  return { w, h, ox, oy, rgba, depth, id };
}

/** Darken pixels that border empty space or a nearer surface of another face (silhouettes, pixel-art edges). */
function outline(rgba, depth, id, w, h, gap) {
  const dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * w + x; if (id[o] < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) { dark[o] = 1; break; }
      const p = Y * w + X;
      if (id[p] < 0) { dark[o] = 1; break; }
      if (id[p] !== id[o] && depth[p] - depth[o] > gap) { dark[o] = 2; break; }
    }
  }
  for (let o = 0; o < w * h; o++) if (dark[o]) { const q = o * 4, f = dark[o] === 1 ? 0.62 : 0.75; rgba[q] *= f; rgba[q + 1] *= f; rgba[q + 2] *= f; }
}
