/**
 * Moscow metro entrance pavilion (surface part of an underground station), drawn on the station tile
 * over a paved plaza (sprites/metroPlaza.js); the rail under it is tunnel. About a quarter of a tile
 * in footprint, low dark-red stone pavilion with a line-colour band, a grey cap, and a red
 * illuminated "M" sign on a short pole (OpenGFX pixel style, roughly 16 px tall).
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { P, poly, box } from './shapes.js';

const cache = new SpriteCache();

/**
 * Entrance pavilion sprite for one axis and line colour (cached per pair).
 * @param {'x'|'y'} axis
 * @param {string} color '#RRGGBB'
 */
export function metroEntranceSprite(axis, color) {
  const col = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#1e6fd9';
  return cache.get(`me:${axis}:${col}`, () => makeSprite(TILE_W, TILE_H + 24, HALF_W, HALF_H + 24, (ctx) => {
    // pavilion footprint ~0.4 x 0.32 tile: walls, grey cap with a slight overhang
    const [u0, u1, v0, v1] = axis === 'x' ? [-0.2, 0.2, -0.16, 0.16] : [-0.16, 0.16, -0.2, 0.2];
    box(ctx, u0, v0, u1, v1, 0, 7, '#7f1d1d', '#991b1b');
    box(ctx, u0 - 0.03, v0 - 0.03, u1 + 0.03, v1 + 0.03, 7, 8.5, '#44403c', '#57534e');
    // line-colour band on the front face
    const fv = axis === 'x' ? v1 : u1;
    const [a, b] = axis === 'x' ? [u0, u1] : [v0, v1];
    const pts = axis === 'x'
      ? [a + 0.03, fv, 2.5, b - 0.03, fv, 2.5, b - 0.03, fv, 4, a + 0.03, fv, 4]
      : [fv, a + 0.03, 2.5, fv, b - 0.03, 2.5, fv, b - 0.03, 4, fv, a + 0.03, 4];
    poly(ctx, pts, col);
    // short pole with a red illuminated "M" sign at the front corner
    const [px, py] = axis === 'x' ? P(0.24, -0.2, 0) : P(0.2, -0.24, 0);
    ctx.fillStyle = '#374151';
    ctx.fillRect(px - 0.4, py - 13, 0.8, 13);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(px - 2.6, py - 19, 5.2, 6);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(px - 1.8, py - 17); ctx.lineTo(px - 1.8, py - 14.6);
    ctx.lineTo(px, py - 16.4); ctx.lineTo(px + 1.8, py - 14.6); ctx.lineTo(px + 1.8, py - 17);
    ctx.stroke();
  }));
}
