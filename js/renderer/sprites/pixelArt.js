/**
 * Pixel-art sprite builder in the OpenGFX style (1 world px = 1 sprite px, no anti-aliasing,
 * grainy textures, 1-px dark outlines, light from the left: left (+v) faces bright, right (+u) faces dark).
 * Geometry is given in tile space: u along our x, v along our y (tile units), z in pixels up.
 * Screen: sx = (u - v) * 32, sy = (u + v) * 16 - z (origin = footprint centre on the ground).
 * Draw back-to-front yourself (painter's order): larger u+v is nearer the viewer.
 */

/** Real height (metres) -> sprite pixels: 1.1 px/m up to 60 m, compressed above (keeps skylines sane). */
export function heightPx(m) {
  return Math.round(m <= 60 ? m * 1.1 : 66 + (m - 60) * 0.4);
}

/** OpenGFX-like colours. */
export const PX = {
  brick: '#a8432f', brickDark: '#7e2e22', kremlinRed: '#b5402f', white: '#e8e4da', cream: '#e3d3a8',
  sand: '#cbb48a', stone: '#b9b1a1', grey: '#8f8f8f', concrete: '#a7a39a', glassBlue: '#5f86b5',
  glassTeal: '#4f9a9a', bronze: '#9b7a45', gold: '#e2b53b', green: '#3f7a4f', copper: '#4f9a7a',
  roofGrey: '#5a5a5a', roofGreen: '#3d6b4a', window: '#2c3a55', windowLit: '#e8d27a', red: '#c8302a',
  asphalt: '#6b6b6b', paving: '#9a8f86', grass: '#5d9a3c', black: '#262626',
};

const hexRgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class PixelSprite {
  /**
   * @param {number} w canvas width px
   * @param {number} h canvas height px
   * @param {number} ax anchor x (footprint centre) in px
   * @param {number} ay anchor y in px
   */
  constructor(w, h, ax, ay) {
    this.w = Math.ceil(w); this.h = Math.ceil(h); this.ax = Math.round(ax); this.ay = Math.round(ay);
    this.buf = new Uint8ClampedArray(this.w * this.h * 4);
    this.grain = 0.07;
  }
  /** Tile-space point -> sprite pixel coords. */
  P(u, v, z = 0) { return [this.ax + (u - v) * 32, this.ay + (u + v) * 16 - z]; }
  /** Set one pixel (colour rgb array, brightness factor). */
  dot(x, y, rgb, f = 1, grain = this.grain) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const g = 1 + (hash2(x, y) - 0.5) * 2 * grain;
    const i = (y * this.w + x) * 4, k = f * g;
    this.buf[i] = rgb[0] * k; this.buf[i + 1] = rgb[1] * k; this.buf[i + 2] = rgb[2] * k; this.buf[i + 3] = 255;
  }
  /** Fill a screen-space polygon [[x,y],...] (scanline, pixel centres). */
  fillPoly(pts, colour, f = 1, outline = true) {
    const rgb = typeof colour === 'string' ? hexRgb(colour) : colour;
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.dot(x, y, rgb, f);
    }
    if (outline) this.strokePoly(pts, rgb, f * 0.6);
  }
  /** 1-px line (Bresenham). */
  line(a, b, colour, f = 1) {
    const rgb = typeof colour === 'string' ? hexRgb(colour) : colour;
    let x0 = Math.round(a[0]), y0 = Math.round(a[1]); const x1 = Math.round(b[0]), y1 = Math.round(b[1]);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.dot(x0, y0, rgb, f, 0.02);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  strokePoly(pts, colour, f = 0.6) { for (let i = 0; i < pts.length; i++) this.line(pts[i], pts[(i + 1) % pts.length], colour, f); }
  /** Tile-space polygon [[u,v,z],...]. */
  poly3(pts, colour, f = 1, outline = true) { this.fillPoly(pts.map(([u, v, z]) => this.P(u, v, z)), colour, f, outline); }
  /**
   * Axis-aligned box. opts: {top, left, right} colours (default from colour), windows:{rows, cols, colour, lit}
   * Visible faces: top, left (v = v1, faces the viewer's left), right (u = u1).
   */
  box(u0, v0, u1, v1, z0, z1, colour, opts = {}) {
    const L = opts.left || colour, R = opts.right || colour, T = opts.top || colour;
    this.poly3([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], L, 1.0);
    this.poly3([[u1, v0, z0], [u1, v1, z0], [u1, v1, z1], [u1, v0, z1]], R, 0.72);
    if (!opts.noTop) this.poly3([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], T, 1.12);
    if (opts.windows) this.windows(u0, v0, u1, v1, z0, z1, opts.windows);
  }
  /** Window grid on the two visible faces of a box. w: {rows, cols, colour, lit (0..1 share), colsR} */
  windows(u0, v0, u1, v1, z0, z1, w) {
    const col = hexRgb(w.colour || PX.window), lit = hexRgb(PX.windowLit);
    const rows = w.rows, hz = (z1 - z0) / rows;
    const face = (cols, at, shadeF) => {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const t = (c + 0.5) / cols, z = z0 + (r + 0.35) * hz;
        const [x, y] = at(t, z);
        const isLit = hash2(r * 31 + c, Math.round(x)) < (w.lit || 0);
        this.dot(x, y, isLit ? lit : col, shadeF, 0.03); this.dot(x, y - 1, isLit ? lit : col, shadeF, 0.03);
      }
    };
    face(w.cols, (t, z) => this.P(u0 + (u1 - u0) * t, v1, z), 1);
    face(w.colsR || w.cols, (t, z) => this.P(u1, v0 + (v1 - v0) * t, z), 0.8);
  }
  /** Solid of revolution at (u,v): radius profile r(t) tiles for t in 0..1 over z0..z1, drawn as stacked shaded slices. */
  revolve(u, v, z0, z1, rOf, colour) {
    const rgb = hexRgb(colour);
    const [cx, cy0] = this.P(u, v, 0);
    for (let z = z0; z <= z1; z++) {
      const rr = rOf((z - z0) / Math.max(1, z1 - z0));
      if (rr <= 0) continue;
      const a = rr * 45.25, b = rr * 22.63, cy = cy0 - z;
      for (let y = Math.floor(cy - b); y <= Math.ceil(cy + b); y++) {
        const dy = (y + 0.5 - cy) / b; if (Math.abs(dy) > 1) continue;
        const hw = a * Math.sqrt(1 - dy * dy);
        for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
          const t = (x + 0.5 - cx) / Math.max(1, a); // -1 left .. +1 right
          const top = y < cy - b * 0.2 ? 1.12 : 1;
          this.dot(x, y, rgb, (1.05 - 0.35 * (t + 1) / 2) * top);
        }
      }
    }
  }
  /** Cylinder (radius r tiles). */
  cylinder(u, v, r, z0, z1, colour) { this.revolve(u, v, z0, z1, () => r, colour); }
  /** Cone from radius r to a point. */
  cone(u, v, r, z0, z1, colour) { this.revolve(u, v, z0, z1, (t) => r * (1 - t), colour); }
  /** Russian onion dome of radius r (tiles) sitting at z0, total height hgt px, with a small cross/spike. */
  onion(u, v, r, z0, hgt, colour, cross = PX.gold) {
    this.revolve(u, v, z0, z0 + hgt, (t) => r * (t < 0.45 ? 0.75 + 0.55 * Math.sin((t / 0.45) * Math.PI / 2) : 1.3 * Math.cos(((t - 0.45) / 0.55) * Math.PI / 2) ** 1.6), colour);
    const [x, y] = this.P(u, v, z0 + hgt);
    const c = hexRgb(cross);
    for (let k = 0; k < 4; k++) this.dot(x, y - k, c, 1, 0.02);
    this.dot(x - 1, y - 2, c, 1, 0.02); this.dot(x + 1, y - 2, c, 1, 0.02);
  }
  /** Thin spire (square pyramid, half-width hw tiles) with optional red star on top. */
  spire(u, v, hw, z0, z1, colour, starOn = false) {
    const ap = [u, v, z1];
    this.poly3([[u - hw, v + hw, z0], [u + hw, v + hw, z0], ap], colour, 1.0);
    this.poly3([[u + hw, v - hw, z0], [u + hw, v + hw, z0], ap], colour, 0.72);
    if (starOn) this.star(u, v, z1 + 3);
  }
  /** Small red star (Kremlin towers, Stalinist spires). */
  star(u, v, z) {
    const [x, y] = this.P(u, v, z); const c = hexRgb(PX.red);
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, 1], [1, 1]]) this.dot(x + dx, y + dy, c, 1.1, 0.02);
  }
  /** Gable roof over box top at z (ridge along u when alongU). */
  gable(u0, v0, u1, v1, z, rh, colour, alongU = true) {
    if (alongU) {
      const vm = (v0 + v1) / 2;
      this.poly3([[u0, v1, z], [u1, v1, z], [u1, vm, z + rh], [u0, vm, z + rh]], colour, 1.0);
      this.poly3([[u1, v0, z], [u1, v1, z], [u1, vm, z + rh]], colour, 0.72);
    } else {
      const um = (u0 + u1) / 2;
      this.poly3([[u0, v1, z], [um, v1, z + rh], [um, v0, z + rh], [u0, v0, z]], colour, 1.05);
      this.poly3([[um, v0, z + rh], [um, v1, z + rh], [u1, v1, z], [u1, v0, z]], colour, 0.78);
      this.poly3([[u0, v1, z], [u1, v1, z], [um, v1, z + rh]], colour, 0.9);
    }
  }
  /** Finish: canvas sprite compatible with canvas.js blit (pixel:true -> drawn without smoothing). */
  toSprite() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(this.buf, this.w, this.h), 0, 0);
    return { canvas: c, w: this.w, h: this.h, ax: this.ax, ay: this.ay, pixel: true };
  }
}

/**
 * New pixel sprite sized for a w×h footprint and a given max height (px), anchored at the footprint centre.
 * @returns {PixelSprite}
 */
export function footprintPixel(w, h, tallPx) {
  const W = (w + h) * 32 + 16, ext = (w + h) * 8 + 4;
  return new PixelSprite(W, tallPx + 2 * ext + 12, W / 2, tallPx + ext + 8);
}
