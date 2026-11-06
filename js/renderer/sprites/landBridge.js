/**
 * Minimal placeholder renderer for player valley bridges (land bridges).
 * Draws track at height h with a simple deck slab and two pillars down to the valley ground.
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';
import { straightAxis } from '../../simulation/network.js';
import { railSprite } from './transport.js';
import { drawSloped } from '../slope.js';

export function drawLandBridgeDeck(ctx, tile, sx, groundSy, heights, map, x, y) {
  if (tile.bridgeDeck === undefined) return;
  const h = tile.bridgeDeck;
  const gh = heights ? heights.centerH(x, y) : tile.height;
  const deckSy = (x + y) * HALF_H - h * HEIGHT_STEP;
  const groundY = (x + y) * HALF_H - gh * HEIGHT_STEP;

  const axis = straightAxis(tile.rail) || (tile.rail === 5 ? 'x' : 'y');

  // 1. Pillars down to the ground
  ctx.save();
  ctx.fillStyle = '#64748b'; // slate pillar
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;

  const pillarW = 4;
  const pY0 = deckSy + 2;
  const pY1 = Math.max(pY0 + 2, groundY + 4);

  let p1x, p2x;
  if (axis === 'x') {
    p1x = sx - 10;
    p2x = sx + 10;
  } else {
    p1x = sx - 10;
    p2x = sx + 10;
  }

  // Draw 2 pillars
  for (const px of [p1x, p2x]) {
    ctx.fillRect(px - pillarW / 2, pY0, pillarW, pY1 - pY0);
    ctx.strokeRect(px - pillarW / 2, pY0, pillarW, pY1 - pY0);
  }

  // 2. Deck slab (flat diamond at height h)
  ctx.fillStyle = '#475569'; // concrete deck
  ctx.strokeStyle = '#1e293b';
  ctx.beginPath();
  ctx.moveTo(sx, deckSy - HALF_H);
  ctx.lineTo(sx + HALF_W, deckSy);
  ctx.lineTo(sx, deckSy + HALF_H);
  ctx.lineTo(sx - HALF_W, deckSy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 3. Rails at height h (flat)
  const c = [h, h, h, h];
  const s = railSprite(tile.rail);
  if (s) {
    drawSloped(ctx, s, sx, (x + y) * HALF_H, c);
  }

  ctx.restore();
}
