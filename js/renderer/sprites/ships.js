/**
 * Procedural ship sprites: hull + superstructure per model, dock (quay), buoy and ship depot tiles.
 * Same conventions as the other sprite modules (tile space, makeSprite / SpriteCache).
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { box, quad, cylinder } from './shapes.js';

const cache = new SpriteCache();

const HULL = { ship_oiltanker: '#1f2937', ship_ferry: '#f8fafc', ship_cargo: '#7c2d12' };

/**
 * Hull and superstructure of a ship segment. The bow points along +s on the axis (u for E-W, v for N-S).
 * @param {CanvasRenderingContext2D} ctx
 * @param {'u'|'v'} axis
 * @param {number} s +1 / -1
 * @param {string} modelId
 */
function drawShip(ctx, axis, s, modelId, colour) {
  const L = 0.36, W = 0.11;
  const hull = colour || HULL[modelId] || '#7c2d12'; // colour: player colour scheme / group colour (hull)
  const [a0, a1] = axis === 'u' ? [-L, L] : [-L, L];
  const u0 = axis === 'u' ? a0 : -W, u1 = axis === 'u' ? a1 : W;
  const v0 = axis === 'v' ? a0 : -W, v1 = axis === 'v' ? a1 : W;
  box(ctx, u0, v0, u1, v1, 0, 3, hull, '#94a3b8');
  // superstructure on the aft half (away from the bow)
  const cut = s > 0 ? [-L, -L * 0.1] : [L * 0.1, L];
  const su0 = axis === 'u' ? cut[0] : -W * 0.7, su1 = axis === 'u' ? cut[1] : W * 0.7;
  const sv0 = axis === 'v' ? cut[0] : -W * 0.7, sv1 = axis === 'v' ? cut[1] : W * 0.7;
  box(ctx, su0, sv0, su1, sv1, 3, 7, '#f1f5f9', '#e2e8f0');
  if (modelId === 'ship_oiltanker') cylinder(ctx, 0, 0, 0.05, 3, 5, '#0f172a');
}

/** Ship segment sprite area is the same as the other vehicles (SIZE 56 px at anchor centre). */
export function shipDockSprite() {
  return cache.get('dock', () => makeSprite(TILE_W, TILE_H + 40, HALF_W, HALF_H + 40, (ctx) => {
    quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#c9b48a');
    box(ctx, -0.46, -0.12, 0.46, 0.12, 0, 6, '#8b6b3d', '#a88a57');
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(-4, -3, 8, 4);
  }));
}

/** Buoy (waypoint) on water: a red and white marker. */
export function buoySprite() {
  return cache.get('buoy', () => makeSprite(TILE_W, TILE_H + 20, HALF_W, HALF_H + 20, (ctx) => {
    cylinder(ctx, 0, 0, 0.1, 0, 10, '#dc2626', 0.07);
    cylinder(ctx, 0, 0, 0.1, 4, 6, '#f8fafc', 0.07);
  }));
}

/** Ship depot on water: a small dock shed. */
export function shipDepotSprite() {
  return cache.get('shipdepot', () => makeSprite(TILE_W, TILE_H + 40, HALF_W, HALF_H + 40, (ctx) => {
    box(ctx, -0.38, -0.38, 0.38, 0.38, 0, 2, '#8b5e3c', '#a16b43');
    box(ctx, -0.3, -0.3, 0.3, 0.3, 2, 12, '#1e3a5f', '#2b4c7a');
  }));
}

/** Ship vehicle segment sprite (56 px box, anchor at the centre like the other vehicle sprites). */
export function shipSegmentSprite(modelId, dir, colour) {
  const d = dir === 1 || dir === 2 || dir === 4 || dir === 8 ? dir : 2;
  const c = colour || '';
  return cache.get(`seg:${modelId}:${d}:${c}`, () => makeSprite(56, 56, 28, 37, (ctx) => {
    const axis = d === 2 || d === 8 ? 'u' : 'v';
    const s = d === 2 || d === 4 ? 1 : -1;
    drawShip(ctx, axis, s, modelId, c || undefined);
  }));
}
