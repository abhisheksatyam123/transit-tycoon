/**
 * Block signal post (T3b): a small mast with a lamp drawn on a signalled rail tile.
 * Drawn in screen space at the tile centre; lamp is red when `red` is true, else green.
 */
import { HALF_H } from '../iso.js';

/**
 * @param {CanvasRenderingContext2D} ctx world-space context (tile transform active)
 * @param {number} sx tile centre x (iso)
 * @param {number} sy tile centre y (iso)
 * @param {boolean} [red]
 */
export function drawSignalPost(ctx, sx, sy, red = false) {
  // post beside the track (towards the viewer's right), tall enough to read at default zoom
  const px = sx + 6, base = sy + HALF_H * 0.3, top = base - 18;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
  // lamp head: dark plate with the lamp
  ctx.fillStyle = '#111827';
  ctx.fillRect(px - 3.5, top - 4, 7, 9);
  ctx.fillStyle = red ? '#ef4444' : '#22c55e';
  ctx.beginPath();
  ctx.arc(px, top + 0.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
}
