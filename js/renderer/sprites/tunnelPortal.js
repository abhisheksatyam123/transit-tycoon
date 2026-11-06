/**
 * Player rail tunnel portal: a dark arched mouth in the tile face that faces the underground run.
 * Drawn over the portal's surface track (layers/transport.js). Procedural, one sprite per
 * (axis, side) pair, cached.
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { P } from './shapes.js';

const cache = new SpriteCache();

/**
 * Arch sprite for a portal whose underground run lies toward `side` ('+' = increasing coordinate
 * along the axis, '-' = decreasing) on the given axis ('x' = E|W track, 'y' = N|S track).
 * @param {'x'|'y'} axis
 * @param {'+'|'-'} side
 */
export function tunnelPortalSprite(axis, side) {
  return cache.get(`tp:${axis}:${side}`, () => makeSprite(TILE_W, TILE_H + 16, HALF_W, HALF_H + 16, (ctx) => {
    // the mouth lies on the tile face at u (axis x) or v (axis y) = side * 0.5, spanning the track width
    const f = side === '+' ? 0.5 : -0.5;
    const half = 0.2;
    // dark arch: a rectangle with a rounded top (semicircle), stone-coloured rim
    const top = 6.5;
    const outline = [];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI * k / 8;
      const w = half * Math.cos(a);
      const z = 1.5 + top * Math.sin(a) * 0.6;
      outline.push([w, z]);
    }
    const toXY = (w, z) => (axis === 'x' ? P(f, w, z) : P(w, f, z));
    const rim = [];
    for (const [w, z] of outline) rim.push(toXY(w, z));
    ctx.beginPath();
    rim.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    const [bx0, by0] = toXY(-half, 0), [bx1, by1] = toXY(half, 0);
    ctx.lineTo(bx1, by1); ctx.lineTo(bx0, by0); ctx.closePath();
    ctx.fillStyle = '#1c1917';
    ctx.fill();
    ctx.strokeStyle = '#a8a29e';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }));
}
