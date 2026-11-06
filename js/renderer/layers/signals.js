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
export function drawSignalPost(ctx, sx, sy, red = false, type = 'block', dir = 0) {
  // post beside the track (towards the viewer's right), tall enough to read at default zoom
  const px = sx + 6, base = sy + HALF_H * 0.3, top = base - 18;
  if (type === 'entry' || type === 'exit' || type === 'combo') {
    drawPreSignal(ctx, px, base, top, red, type, dir);
    return;
  }
  if (type === 'path') {
    // path signal (T3c): tall post with two lamps, both lit red when the route ahead is reserved
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
    ctx.fillStyle = '#111827'; ctx.fillRect(px - 3.5, top - 4, 7, 9);
    ctx.fillStyle = red ? '#ef4444' : '#22c55e';
    ctx.beginPath(); ctx.arc(px, top - 1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px, top + 3, 2, 0, Math.PI * 2); ctx.fill();
    drawDirArrow(ctx, sx, sy, dir, '#60a5fa');
    return;
  }
  if (type === 'oneway') {
    // one-way block (T3c): post with a white plate on the lamp head to tell it from the two-way mast
    drawSignalPost(ctx, sx, sy, red, 'block');
    ctx.fillStyle = '#f9fafb'; ctx.fillRect(px - 2.5, top - 2, 5, 2);
    drawDirArrow(ctx, sx, sy, dir, '#f9fafb');
    return;
  }
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

/** Screen-space unit vector of a dirBetween bit (iso: east = right-down, south = left-down). */
const DIR_SCREEN = { 1: [1, -1], 2: [1, 1], 4: [-1, 1], 8: [-1, -1] };

/** Small triangle on the track beside the signal, pointing the way trains may pass (dir bit). */
export function drawDirArrow(ctx, sx, sy, dir, color) {
  const v = DIR_SCREEN[dir];
  if (!v) return;
  const ux = v[0] * HALF_H * 0.5, uy = v[1] * HALF_H * 0.5;
  const cx = sx + ux * 0.9, cy = sy + uy * 0.9 + 1;
  const tx = cx + ux * 0.5, ty = cy + uy * 0.5;
  const px = -uy * 0.35, py = ux * 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(cx + px, cy + py);
  ctx.lineTo(cx - px, cy - py);
  ctx.closePath();
  ctx.fill();
}

/** Pre-signal post (T3d): yellow lamp housing = entry, orange = exit, split yellow/orange = combo. */
function drawPreSignal(ctx, px, base, top, red, type, dir) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, top + 4); ctx.stroke();
  ctx.fillStyle = '#111827'; ctx.fillRect(px - 3.5, top - 4, 7, 9);
  const housing = type === 'entry' ? '#facc15' : type === 'exit' ? '#f97316' : null;
  ctx.fillStyle = housing || '#facc15';
  ctx.fillRect(px - 2.5, top - 3, 5, 3);
  ctx.fillStyle = type === 'combo' ? '#f97316' : housing;
  ctx.fillRect(px - 2.5, top + 0.5, 5, 3);
  ctx.fillStyle = red ? '#ef4444' : '#22c55e';
  ctx.beginPath(); ctx.arc(px, top - 1.5, 1.4, 0, Math.PI * 2); ctx.fill();
  drawDirArrow(ctx, px - 6, base, dir, '#f9fafb');
}
