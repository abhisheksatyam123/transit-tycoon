/**
 * One-way road arrow (T42): a small arrow over a one-way straight road tile, pointing the travel direction.
 * oneWay 1 = +axis (east on x-straights, south on y-straights), 2 = -axis. Screen space, tile centre.
 */
import { HALF_W, HALF_H } from '../iso.js';

/**
 * @param {CanvasRenderingContext2D} ctx world-space context (tile transform active)
 * @param {number} sx tile centre x (iso)
 * @param {number} sy tile centre y (iso)
 * @param {number} oneWay 1 or 2 (see module doc)
 * @param {number} road road bits of the tile (decides the axis: E|W = x, N|S = y)
 */
export function drawOneWayArrow(ctx, sx, sy, oneWay, road) {
  // iso: east (+x) runs to screen (+HALF_W,+HALF_H); south (+y) runs to (-HALF_W,+HALF_H)
  const xAxis = (road & 10) !== 0 && (road & 5) === 0;
  const s = oneWay === 1 ? 1 : -1;
  const ux = (xAxis ? HALF_W : -HALF_W) * s * 0.7, uy = HALF_H * s * 0.7;
  const tipX = sx + ux, tipY = sy + uy;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx - ux, sy - uy); ctx.lineTo(tipX, tipY);
  // arrow head: two barbs back from the tip, perpendicular-ish in screen space
  const bx = -ux * 0.35, by = -uy * 0.35;
  ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + bx - by * 0.6, tipY + by + bx * 0.6);
  ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + bx + by * 0.6, tipY + by - bx * 0.6);
  ctx.stroke();
  ctx.restore();
}
