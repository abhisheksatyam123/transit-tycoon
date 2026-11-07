/**
 * Aqueduct deck (procedural fallback: the OpenGFX aqueduct sprites are not in the pack yet).
 * A deck tile (tile.aqueduct.role 'deck') carries a water channel slab at tile.aqueduct.level with two pillars down
 * to the valley floor. Heads are ordinary canal water (drawn by terrain.js), so the ramp is the terrain's own slope.
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';

export function drawAqueductDeck(ctx, tile, sx, groundSy, heights, x, y) {
  const aq = tile.aqueduct;
  if (!aq || aq.role !== 'deck') return;
  const h = aq.level;
  const gh = heights ? heights.centerH(x, y) : h - 1;
  const deckSy = (x + y) * HALF_H - h * HEIGHT_STEP;
  const groundY = (x + y) * HALF_H - gh * HEIGHT_STEP;
  const axisX = aq.dir === 2 || aq.dir === 8; // span runs along x (E/W)
  ctx.save();
  ctx.fillStyle = '#64748b';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  const pY0 = deckSy + 2, pY1 = Math.max(pY0 + 2, groundY + 4);
  for (const px of [sx - 10, sx + 10]) {
    ctx.fillRect(px - 2, pY0, 4, pY1 - pY0);
    ctx.strokeRect(px - 2, pY0, 4, pY1 - pY0);
  }
  ctx.fillStyle = '#1e5f8a'; // water channel on the slab
  ctx.strokeStyle = '#0f3d5c';
  ctx.beginPath();
  ctx.moveTo(sx, deckSy - HALF_H);
  ctx.lineTo(sx + HALF_W, deckSy);
  ctx.lineTo(sx, deckSy + HALF_H);
  ctx.lineTo(sx - HALF_W, deckSy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#7dd3fc'; // a light line marks the channel axis
  ctx.beginPath();
  if (axisX) { ctx.moveTo(sx - HALF_W * 0.8, deckSy - HALF_H * 0.8 / 2); ctx.lineTo(sx + HALF_W * 0.8, deckSy + HALF_H * 0.8 / 2); }
  else { ctx.moveTo(sx + HALF_W * 0.8, deckSy - HALF_H * 0.8 / 2); ctx.lineTo(sx - HALF_W * 0.8, deckSy + HALF_H * 0.8 / 2); }
  ctx.stroke();
  ctx.restore();
}
