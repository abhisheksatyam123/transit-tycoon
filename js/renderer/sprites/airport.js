/**
 * Airport sprites: ground tiles per footprint part (runway, apron) and 3-D object sprites for
 * terminal, control tower and hangar. Parts come from station buildings
 * `{ type:'station', kind:'airport', part }` and air depots (`kind:'air'`, hangar).
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { quad, box, gableRoof, poly } from './shapes.js';
import { shade } from '../palette.js';

const cache = new SpriteCache();

/**
 * Flat ground sprite for an airport tile.
 * @param {'runway'|'apron'} part
 * @param {'x'|'y'} axis runway direction (x = along +u, y = along +v)
 */
export function airportGround(part, axis) {
  const a = axis === 'y' ? 'y' : 'x';
  return cache.get(`ag:${part}:${a}`, () => makeSprite(TILE_W, TILE_H + 8, HALF_W, HALF_H + 8, (ctx) => {
    if (part === 'runway') drawRunway(ctx, a);
    else if (part === 'helipad') drawHelipad(ctx);
    else drawApron(ctx);
  }));
}

/** Helipad: painted square with a white H, on apron concrete. */
function drawHelipad(ctx) {
  drawApron(ctx);
  quad(ctx, -0.36, -0.36, 0.36, 0.36, 0.015, '#e5e7eb', '#d1d5db');
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 0.9;
  line(ctx, -0.18, -0.2, -0.18, 0.2, 0.03);
  line(ctx, 0.18, -0.2, 0.18, 0.2, 0.03);
  line(ctx, -0.18, 0, 0.18, 0, 0.03);
}

/** @param {CanvasRenderingContext2D} ctx */
function drawApron(ctx) {
  quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#b4b1a8', '#9c998f');
  // painted stand boundary + nose-in marking
  ctx.strokeStyle = 'rgba(250,204,21,0.8)';
  ctx.lineWidth = 0.45;
  line(ctx, -0.36, -0.36, 0.36, -0.36, 0.02);
  line(ctx, -0.36, -0.36, -0.36, 0.36, 0.02);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  line(ctx, -0.5, 0, 0.5, 0, 0.02);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {'x'|'y'} a
 */
function drawRunway(ctx, a) {
  quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#3a3d43', '#2a2d33');
  // shoulders
  quad(ctx, -0.5, -0.5, 0.5, -0.4, 0.01, '#8a8780');
  quad(ctx, -0.5, 0.4, 0.5, 0.5, 0.01, '#8a8780');
  // edge lines (white) and edge lights
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.4;
  line(ctx, -0.5, -0.36, 0.5, -0.36, 0.03);
  line(ctx, -0.5, 0.36, 0.5, 0.36, 0.03);
  // centreline dashes (along the runway axis)
  ctx.lineWidth = 0.9;
  for (let t = -0.42; t < 0.42; t += 0.2) {
    if (a === 'x') line(ctx, t, 0, t + 0.11, 0, 0.03);
    else line(ctx, 0, t, 0, t + 0.11, 0.03);
  }
  // threshold piano keys at both runway ends of the tile row
  ctx.lineWidth = 0.5;
  const keys = [-0.28, -0.16, -0.04, 0.08, 0.2, 0.32];
  for (const k of keys) {
    if (a === 'x') {
      line(ctx, -0.46, k - 0.03, -0.46, k + 0.03, 0.03);
      line(ctx, 0.46, k - 0.03, 0.46, k + 0.03, 0.03);
    } else {
      line(ctx, k - 0.03, -0.46, k + 0.03, -0.46, 0.03);
      line(ctx, k - 0.03, 0.46, k + 0.03, 0.46, 0.03);
    }
  }
  // blue edge lights
  ctx.fillStyle = '#60a5fa';
  for (const e of [-0.46, 0.0, 0.46]) {
    dot(ctx, a === 'x' ? e : -0.44, a === 'x' ? -0.44 : e, 0.04);
    dot(ctx, a === 'x' ? e : 0.44, a === 'x' ? 0.44 : e, 0.04);
  }
}

/** Draw a ground-level line segment in tile space. */
function line(ctx, u0, v0, u1, v1, z) {
  const a = [(u0 - v0) * HALF_W, (u0 + v0) * HALF_H - z];
  const b = [(u1 - v1) * HALF_W, (u1 + v1) * HALF_H - z];
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

/** Small light dot at ground level. */
function dot(ctx, u, v, r) {
  const x = (u - v) * HALF_W, y = (u + v) * HALF_H;
  ctx.beginPath();
  ctx.arc(x, y, r * HALF_W, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 3-D airport object for a footprint part on a single tile (terminal, tower, hangar).
 * @param {'terminal'|'tower'|'hangar'} part
 * @param {number} variant small hash variant (colour / window variation)
 */
export function airportObject(part, variant) {
  const v = variant & 1;
  return cache.get(`ao:${part}:${v}`, () => makeSprite(TILE_W + 16, 90, (TILE_W + 16) / 2, 80, (ctx) => {
    if (part === 'terminal') drawTerminal(ctx, v);
    else if (part === 'tower') drawTower(ctx);
    else drawHangar(ctx, v);
  }));
}

/** Long glass-and-concrete terminal with jet bridge. */
function drawTerminal(ctx, v) {
  const wall = v ? '#e2e8f0' : '#d6dce4';
  box(ctx, -0.46, -0.44, 0.46, 0.2, 0, 16, wall, '#f1f5f9');
  // glass band on the two visible faces
  const edge = 'rgba(0,0,0,0)';
  poly(ctx, [-0.46, 0.2, 5, 0.46, 0.2, 5, 0.46, 0.2, 11, -0.46, 0.2, 11], 'rgba(56,189,248,0.75)', edge);
  poly(ctx, [0.46, -0.44, 5, 0.46, 0.2, 5, 0.46, 0.2, 11, 0.46, -0.44, 11], 'rgba(30,64,110,0.8)', edge);
  // roof cornice
  box(ctx, -0.48, -0.46, 0.48, 0.22, 16, 18, '#94a3b8');
  // jet bridge arms towards the apron
  box(ctx, 0.2, 0.22, 0.46, 0.34, 0, 8, '#cbd5e1', '#e2e8f0');
  box(ctx, -0.2, 0.22, 0.04, 0.34, 0, 8, '#cbd5e1', '#e2e8f0');
}

/** Control tower: slim shaft with glazed cab. */
function drawTower(ctx) {
  box(ctx, -0.12, -0.12, 0.12, 0.12, 0, 40, '#d6d3cd', '#f5f5f4');
  box(ctx, -0.22, -0.22, 0.22, 0.22, 40, 50, '#334155', '#0f172a');
  // glazing band
  poly(ctx, [-0.22, 0.22, 42, 0.22, 0.22, 42, 0.22, 0.22, 48, -0.22, 0.22, 48], 'rgba(125,211,252,0.85)');
  poly(ctx, [0.22, -0.22, 42, 0.22, 0.22, 42, 0.22, 0.22, 48, 0.22, -0.22, 48], 'rgba(56,189,248,0.8)');
  box(ctx, -0.25, -0.25, 0.25, 0.25, 50, 53, '#cbd5e1');
  // antenna mast
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -53);
  ctx.lineTo(0, -68);
  ctx.stroke();
}

/** Arched hangar with door on the front face. */
function drawHangar(ctx, v) {
  const body = v ? '#e5e7eb' : '#cfd4da';
  box(ctx, -0.46, -0.38, 0.46, 0.38, 0, 10, body, '#f3f4f6');
  gableRoof(ctx, -0.46, -0.38, 0.46, 0.38, 10, 10, 'u', shade(body, 0.95));
  // door on +v face
  poly(ctx, [-0.3, 0.38, 0.5, 0.3, 0.38, 0.5, 0.3, 0.38, 8, -0.3, 0.38, 8], '#334155');
  // a few horizontal ribs
  ctx.strokeStyle = 'rgba(71,85,105,0.5)';
  ctx.lineWidth = 0.35;
  for (let z = 2; z < 8; z += 2) {
    ctx.beginPath();
    ctx.moveTo((-0.3 - 0.38) * HALF_W, (-0.3 + 0.38) * HALF_H - z);
    ctx.lineTo((0.3 - 0.38) * HALF_W, (0.3 + 0.38) * HALF_H - z);
    ctx.stroke();
  }
}
