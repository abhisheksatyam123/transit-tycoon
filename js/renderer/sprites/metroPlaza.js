/**
 * Paved plaza ground for Moscow metro entrance tiles (tunnel + metro station). Replaces the rail
 * track and platform: a flat stone pavement with a fine paving-slab grid, drawn under the
 * entrance pavilion (sprites/metro.js). No rail, no platform.
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { quad, P } from './shapes.js';

const cache = new SpriteCache();

/**
 * Full-tile paved plaza ground (cached once).
 * @returns {HTMLCanvasElement}
 */
export function metroPlazaGround() {
  return cache.get('plaza', () => makeSprite(TILE_W, TILE_H + 8, HALF_W, HALF_H + 8, (ctx) => {
    quad(ctx, -0.5, -0.5, 0.5, 0.5, 0, '#a8a29e');
    ctx.strokeStyle = '#8b8580';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const k of [-0.25, 0, 0.25]) {
      const [x0, y0] = P(-0.5, k, 0), [x1, y1] = P(0.5, k, 0);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      const [x2, y2] = P(k, -0.5, 0), [x3, y3] = P(k, 0.5, 0);
      ctx.moveTo(x2, y2); ctx.lineTo(x3, y3);
    }
    ctx.stroke();
  }));
}
