/**
 * Station and depot sprites (houses and industries live in their own modules and are
 * re-exported here so callers can import every building sprite from one place).
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { COMPANY } from '../palette.js';
import { box, quad, poly, gableRoof, P } from './shapes.js';
import { drawRails, drawRoad } from './transport.js';

export { houseSprite, STYLES } from './houses.js';
export { industrySprite, industryStyle, industryPiece, SMOKE } from './industries.js';

const cache = new SpriteCache();

/**
 * Ground layer of a rail station tile: ballast + rails along axis, platform alongside.
 * @param {'x'|'y'} axis
 * @returns {import('./canvas.js').Sprite}
 */
export function railStationGround(axis) {
  return cache.get(`sg:${axis}`, () => makeSprite(TILE_W, TILE_H + 8, HALF_W, HALF_H + 8, (ctx) => {
    quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#8d8577');
    if (axis === 'x') {
      drawRails(ctx, 10, false);
      platform(ctx, -0.5, 0.26, 0.5, 0.5);
      platform(ctx, -0.5, -0.5, 0.5, -0.26);
    } else {
      drawRails(ctx, 5, false);
      platform(ctx, 0.26, -0.5, 0.5, 0.5);
      platform(ctx, -0.5, -0.5, -0.26, 0.5);
    }
  }));
}

/**
 * Raised concrete platform.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} u0
 * @param {number} v0
 * @param {number} u1
 * @param {number} v1
 */
function platform(ctx, u0, v0, u1, v1) {
  box(ctx, u0, v0, u1, v1, 0, 3, '#b8b4aa', '#cfcac0');
  // yellow safety line along track edge
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 0.7;
  const a = v0 < 0 ? P(u0, v1 - 0.02, 3.1) : P(u0, v0 + 0.02, 3.1);
  const b = v0 < 0 ? P(u1, v1 - 0.02, 3.1) : P(u1, v0 + 0.02, 3.1);
  if (u1 - u0 > v1 - v0) {
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
}

/**
 * Canopies above both platforms (object layer).
 * @param {'x'|'y'} axis
 * @returns {import('./canvas.js').Sprite}
 */
export function railStationCanopy(axis, tint = null) {
  return cache.get(tint ? `sc:${axis}:${tint}` : `sc:${axis}`, () => makeSprite(TILE_W, TILE_H + 40, HALF_W, HALF_H + 40, (ctx) => {
    const sides = axis === 'x' ? [[-0.5, 0.3, 0.5, 0.5], [-0.5, -0.5, 0.5, -0.3]] : [[0.3, -0.5, 0.5, 0.5], [-0.5, -0.5, -0.3, 0.5]];
    for (const [u0, v0, u1, v1] of sides) {
      const pu = axis === 'x' ? 0 : (u0 + u1) / 2, pv = axis === 'x' ? (v0 + v1) / 2 : 0;
      for (const k of [-0.3, 0.3]) {
        const [x, y] = axis === 'x' ? P(k, pv, 3) : P(pu, k, 3);
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(x - 0.7, y - 13, 1.4, 13);
      }
      poly(ctx, [u0, v0, 16, u1, v0, 16, u1, v1, 16, u0, v1, 16], tint || 'rgba(30,111,217,0.92)', 'rgba(0,0,0,0.35)');
      poly(ctx, axis === 'x' ? [u0, v1, 16, u1, v1, 16, u1, v1, 14, u0, v1, 14] : [u1, v0, 16, u1, v1, 16, u1, v1, 14, u1, v0, 14], COMPANY.dark);
    }
  }));
}

/**
 * Bus / truck stop shelter (object layer); road is drawn by the transport layer.
 * @param {'bus'|'truck'} kind
 * @param {'x'|'y'} axis
 * @returns {import('./canvas.js').Sprite}
 */
export function roadStopSprite(kind, axis, tint = null) {
  return cache.get(tint ? `rs:${kind}:${axis}:${tint}` : `rs:${kind}:${axis}`, () => makeSprite(TILE_W, TILE_H + 40, HALF_W, HALF_H + 40, (ctx) => {
    const roof = tint || (kind === 'bus' ? '#1e6fd9' : '#d97706');
    const bays = axis === 'x' ? [[-0.3, 0.34, 0.3, 0.48]] : [[0.34, -0.3, 0.48, 0.3]];
    for (const [u0, v0, u1, v1] of bays) {
      box(ctx, u0, v0, u1, v1, 0, 1.5, '#b8b4aa');
      ctx.fillStyle = '#374151';
      const ends = axis === 'x' ? [[u0 + 0.03, (v0 + v1) / 2], [u1 - 0.03, (v0 + v1) / 2]] : [[(u0 + u1) / 2, v0 + 0.03], [(u0 + u1) / 2, v1 - 0.03]];
      for (const [u, v] of ends) {
        const [x, y] = P(u, v, 1.5);
        ctx.fillRect(x - 0.6, y - 11, 1.2, 11);
      }
      poly(ctx, [u0, v0, 12, u1, v0, 12, u1, v1, 12, u0, v1, 12], roof, 'rgba(0,0,0,0.35)');
      // glass back wall
      poly(ctx, axis === 'x' ? [u0, v1, 1.5, u1, v1, 1.5, u1, v1, 11, u0, v1, 11] : [u1, v0, 1.5, u1, v1, 1.5, u1, v1, 11, u1, v0, 11], 'rgba(186,230,253,0.35)');
      // sign
      const [sx, sy] = axis === 'x' ? P(u1 + 0.06, v1, 0) : P(u1, v1 + 0.06, 0);
      ctx.fillStyle = '#9ca3af'; ctx.fillRect(sx - 0.5, sy - 16, 1, 16);
      ctx.fillStyle = roof; ctx.beginPath(); ctx.arc(sx, sy - 17, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 4px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(kind === 'bus' ? 'B' : 'T', sx, sy - 15.5);
    }
  }));
}

/**
 * Depot shed with doors toward `dir`.
 * @param {'rail'|'road'} kind
 * @param {1|2|4|8} dir exit direction
 * @returns {import('./canvas.js').Sprite}
 */
export function depotSprite(kind, dir) {
  return cache.get(`dp:${kind}:${dir}`, () => makeSprite(TILE_W, TILE_H + 50, HALF_W, HALF_H + 50, (ctx) => {
    quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, kind === 'rail' ? '#8d8577' : '#7b7f86');
    if (kind === 'rail') drawRails(ctx, dir, false);
    else drawRoad(ctx, dir, false);
    const along = dir === 2 || dir === 8 ? 'u' : 'v';
    const body = kind === 'rail' ? '#8b5e3c' : '#6b7280';
    box(ctx, -0.38, -0.38, 0.38, 0.38, 0, 18, body);
    gableRoof(ctx, -0.42, -0.42, 0.42, 0.42, 18, 10, along, kind === 'rail' ? '#3f4a56' : '#1e3a5f');
    // door on visible face if facing S or E; otherwise a sign on the front
    if (dir === 4) poly(ctx, [-0.2, 0.38, 0, 0.2, 0.38, 0, 0.2, 0.38, 13, -0.2, 0.38, 13], '#1f2937');
    if (dir === 2) poly(ctx, [0.38, -0.2, 0, 0.38, 0.2, 0, 0.38, 0.2, 13, 0.38, -0.2, 13], '#111827');
    if (dir === 1 || dir === 8) {
      const face = dir === 1 ? [-0.25, 0.38, 6, 0.25, 0.38, 6, 0.25, 0.38, 11, -0.25, 0.38, 11] : [0.38, -0.25, 6, 0.38, 0.25, 6, 0.38, 0.25, 11, 0.38, -0.25, 11];
      poly(ctx, face, COMPANY.secondary);
    }
  }));
}
