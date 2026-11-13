/**
 * Landmark sprites (Moscow). Each landmark is drawn ONCE on its footprint's front-most tile,
 * sized and anchored so it covers the whole w×h footprint. Ground (paved / grass) of every
 * footprint tile comes from landmarkGround(). Sprite-local tile space: origin = footprint centre.
 */
import { makeSprite, SpriteCache, blit } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { shade } from '../palette.js';
import { P, poly, quad, box, gableRoof, cylinder } from './shapes.js';
import { dome, star, GOLD } from './landmarkParts.js';
import { landmarkExtras } from './landmarks2.js';
import { landmarkExtras3 } from './landmarks3.js';
import { PIXEL_LANDMARKS } from './lm/index.js';

const cache = new SpriteCache();
const BRICK = '#9b2f2a';
const GREEN_ROOF = '#2e6b4a';

/** Ground kind per landmark id (ground layer draws it on every footprint tile). */
export function landmarkGroundKind(id) {
  return id === 'msu' || id === 'vdnkh' || id === 'luzhniki' || id === 'novodevichy' ? 'grass' : 'paved';
}

/**
 * Flat ground sprite for one footprint tile.
 * @param {'paved'|'grass'} kind
 */
export function landmarkGround(kind) {
  return cache.get(`lg:${kind}`, () => makeSprite(TILE_W, TILE_H + 4, HALF_W, HALF_H + 4, (ctx) => {
    if (kind === 'grass') {
      quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#5f9a3e');
      quad(ctx, -0.3, -0.2, 0.1, 0.25, 0.05, '#6fae4a');
      quad(ctx, 0.15, -0.4, 0.45, -0.05, 0.05, '#4f8a33');
    } else {
      quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#8e8075');
      ctx.strokeStyle = 'rgba(60,40,35,0.35)';
      ctx.lineWidth = 0.4;
      for (let i = -4; i <= 4; i++) {
        const a = P(i / 8, -0.5, 0.05), b = P(i / 8, 0.5, 0.05);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const c = P(-0.5, i / 8, 0.05), d = P(0.5, i / 8, 0.05);
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
      }
    }
  }));
}

/**
 * Sprite whose origin is the footprint centre (tile space (0,0)), tall enough for `tall` px.
 * @param {number} w
 * @param {number} h
 * @param {number} tall
 * @param {(ctx:CanvasRenderingContext2D)=>void} draw
 */
export function footprintSprite(w, h, tall, draw) {
  const ext = ((w + h) / 2) * HALF_H + 8; // half vertical extent of the footprint diamond
  const W = (w + h) * HALF_W + 24;
  const ay = tall + ext + 8;
  const H = ay + ext + 8;
  return makeSprite(W, H, W / 2, ay, draw);
}

/**
 * Draw a landmark footprint from its front-most tile (dx===w-1 && dy===h-1). Other footprint
 * tiles draw nothing here (their ground comes from drawTransport / landmarkGround).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{id:string,w:number,h:number}} b landmark building record
 * @param {number} sx screen x of the front tile centre
 * @param {number} sy screen y of the front tile centre
 */
export function drawLandmark(ctx, b, sx, sy) {
  const w = b.w | 0 || 1, h = b.h | 0 || 1;
  const s = landmarkSprite(b.id, w, h);
  // footprint centre relative to the front tile: (-(w-1)/2, -(h-1)/2) in tile units
  const cx = sx + ((h - w) / 2) * HALF_W;
  const cy = sy - ((w + h - 2) / 2) * HALF_H;
  blit(ctx, s, cx, cy);
}

/** Pyramidal roof on a square base (tile-space centre u,v; half-size; base z0; apex height rh). */
function pyramid(ctx, u, v, half, z0, rh, color) {
  const A = [u - half, v - half], B = [u + half, v - half], C = [u + half, v + half], D = [u - half, v + half];
  const ap = [u, v, z0 + rh];
  const f = (p, q) => [p[0], p[1], z0, q[0], q[1], z0, ap[0], ap[1], ap[2]];
  poly(ctx, f(A, B), shade(color, 0.7), 'rgba(0,0,0,0.25)');
  poly(ctx, f(D, A), shade(color, 0.8), 'rgba(0,0,0,0.25)');
  poly(ctx, f(B, C), shade(color, 0.95), 'rgba(0,0,0,0.25)');
  poly(ctx, f(C, D), shade(color, 0.85), 'rgba(0,0,0,0.25)');
}

/** Red brick kremlin wall with merlons along a closed polygon. */
function wall(ctx, pts, hgt) {
  const n = pts.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    edges.push({ a, b, depth: (a[0] + a[1] + b[0] + b[1]) / 2 });
  }
  edges.sort((p, q) => p.depth - q.depth);
  for (const { a, b } of edges) {
    poly(ctx, [a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], hgt, a[0], a[1], hgt], shade(BRICK, 0.9), 'rgba(0,0,0,0.3)');
    ctx.strokeStyle = 'rgba(60,15,10,0.35)';
    ctx.lineWidth = 0.5;
    for (let z = 6; z < hgt; z += 6) {
      const p = P(a[0], a[1], z), q = P(b[0], b[1], z);
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    for (let k = 0; k <= 7; k++) {
      if (k % 2) continue;
      const t = k / 7;
      const u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t;
      box(ctx, u - 0.035, v - 0.035, u + 0.035, v + 0.035, hgt, hgt + 6, BRICK);
    }
  }
}

/** Kremlin: wall polygon, towers with pointed green roofs and red stars, palaces, golden domes. */
const KPTS = [[-1.25, -0.15], [-0.6, -1.2], [0.7, -1.2], [1.25, 0.05], [0.6, 1.15], [-0.75, 1.1]];
function kremlin(ctx) {
  wall(ctx, KPTS, 22);
  // palaces and cathedrals inside
  box(ctx, -0.15, -0.5, 0.45, -0.05, 0, 24, '#f2d27a');
  gableRoof(ctx, -0.15, -0.5, 0.45, -0.05, 24, 9, 'u', GREEN_ROOF);
  box(ctx, -0.6, 0.1, -0.2, 0.55, 0, 18, '#f7f0d6');
  gableRoof(ctx, -0.6, 0.1, -0.2, 0.55, 18, 7, 'v', GREEN_ROOF);
  box(ctx, 0.15, 0.15, 0.5, 0.45, 0, 26, '#e8e2cf');
  dome(ctx, 0.3, 0.3, 26, 9, 22, GOLD);
  dome(ctx, -0.35, -0.2, 18, 7, 16, GOLD);
  dome(ctx, 0.05, -0.2, 24, 6, 14, '#f5c542');
  // Ivan the Great bell tower: stacked white octagons with golden top
  cylinder(ctx, -0.25, 0.42, 0.13, 0, 46, '#f8f8f4', 0.12);
  cylinder(ctx, -0.25, 0.42, 0.11, 46, 92, '#f8f8f4', 0.1);
  cylinder(ctx, -0.25, 0.42, 0.09, 92, 128, '#f8f8f4', 0.07);
  dome(ctx, -0.25, 0.42, 128, 7, 20, GOLD);
  // towers: Spasskaya (index 0) tallest with clock; others pointed green roofs + red stars
  const towers = [[-1.2, -0.1, 118], [-0.6, -1.15, 70], [0.7, -1.15, 80], [1.2, 0.05, 66], [0.6, 1.1, 74], [-0.7, 1.05, 62]];
  const sorted = towers.slice().sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  for (const [u, v, hgt] of sorted) {
    box(ctx, u - 0.1, v - 0.1, u + 0.1, v + 0.1, 0, hgt, BRICK, '#b84a3f');
    pyramid(ctx, u, v, 0.12, hgt, 30, GREEN_ROOF);
    star(ctx, u, v, hgt + 36, 5.5, '#dc2626');
  }
  // clock on Spasskaya tower (faces +v side)
  const [cx, cy] = P(-1.2, -0.1 + 0.105, 84);
  ctx.fillStyle = '#fff8e1'; ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1; ctx.stroke();
}

/** Spiral-striped onion dome helper stripes. */
const STRIPES = ['#dc2626', '#16a34a', '#facc15', '#2563eb', '#f8fafc'];
/** St Basil's Cathedral on the south end tile (footprint 1×2, front tile at (0, +0.5)). */
function basil(ctx) {
  const c = [0, 0.5];
  box(ctx, c[0] - 0.3, c[1] - 0.3, c[0] + 0.3, c[1] + 0.3, 0, 22, BRICK, '#a63d32');
  const tiers = [[-0.2, -0.2, 0.2, 0.2, 22, 40, '#b91c1c'], [-0.12, -0.12, 0.12, 0.12, 40, 60, '#c2410c']];
  for (const t of tiers) box(ctx, c[0] + t[0], c[1] + t[1], c[0] + t[2], c[1] + t[3], t[4], t[5], t[6]);
  const corners = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];
  corners.forEach(([u, v], i) => {
    box(ctx, c[0] + u - 0.07, c[1] + v - 0.07, c[0] + u + 0.07, c[1] + v + 0.07, 22, 38, '#f1f5f9');
    dome(ctx, c[0] + u, c[1] + v, 38, 6, 18, STRIPES[i], STRIPES);
  });
  box(ctx, c[0] - 0.09, c[1] - 0.09, c[0] + 0.09, c[1] + 0.09, 60, 72, '#f1f5f9');
  dome(ctx, c[0], c[1], 72, 8, 26, '#16a34a', STRIPES);
  dome(ctx, c[0] + 0.0, c[1] - 0.12, 60, 5, 16, '#2563eb', STRIPES);
}

/** Generic monument for unknown landmark ids: plinth + obelisk. */
function monument(ctx, w, h) {
  box(ctx, -0.45 * (w / 1.5), -0.45 * (h / 1.5), 0.45 * (w / 1.5), 0.45 * (h / 1.5), 0, 10, '#c9c2b5');
  box(ctx, -0.12, -0.12, 0.12, 0.12, 10, 70, '#e7e2d3');
  pyramid(ctx, 0, 0, 0.12, 70, 14, '#d4af37');
}

const SPECS = {
  kremlin: [3, 3, 200, kremlin],
  red_square: [1, 2, 130, basil],
};

/**
 * Sprite for a landmark id (memoised). Unknown ids get a generic monument.
 * @param {string} id
 * @param {number} w
 * @param {number} h
 * @returns {import('./canvas.js').Sprite}
 */
function landmarkSprite(id, w, h) {
  return cache.get(`lm:${id}:${w}x${h}`, () => {
    const px = PIXEL_LANDMARKS.get(id);
    if (px) return px(w, h);
    const spec = SPECS[id];
    if (spec) return footprintSprite(w, h, spec[2], spec[3]);
    const extra = landmarkExtras(id) || landmarkExtras3(id);
    if (extra) return footprintSprite(w, h, extra.tall, (ctx) => extra.draw(ctx, w, h));
    return footprintSprite(w, h, 90, (ctx) => monument(ctx, w, h));
  });
}
