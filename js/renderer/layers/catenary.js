/**
 * Catenary (electrified rail, cmdElectrify.js): a thin pole per electrified rail tile and a wire to each
 * electrified neighbour along the track. Drawn in the object pass (screen space, tile centre), cheap:
 * only tiles with `elec` cost anything.
 */
import { HALF_W, HALF_H } from '../iso.js';

const POLE = 13; // pole height in px
const WIRE = '#15151c';
const POLE_COL = '#5b5f68';

/**
 * @param {CanvasRenderingContext2D} ctx world-space context (tile transform active)
 * @param {object} tile the electrified rail tile (tile.elec)
 * @param {object} east neighbour tile at x+1 (or undefined)
 * @param {object} south neighbour tile at y+1 (or undefined)
 * @param {number} sx tile centre x (iso)
 * @param {number} sy tile centre y (iso)
 */
export function drawCatenary(ctx, tile, east, south, sx, sy) {
  const top = sy - POLE;
  const px = sx + 4;
  ctx.save();
  // pole (2 px, dark steel) with a short cross-arm at the top
  ctx.strokeStyle = POLE_COL;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, sy + 2);
  ctx.lineTo(px, top);
  ctx.moveTo(px - 3, top + 1);
  ctx.lineTo(px + 3, top - 1);
  ctx.stroke();
  // contact wires along the rail axis to electrified neighbours (E and S only: each pair drawn once)
  ctx.strokeStyle = WIRE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (tile.rail & 2 && east && east.elec) { // E bit
    ctx.moveTo(px, top);
    ctx.lineTo(px + HALF_W, top + HALF_H);
  }
  if (tile.rail & 4 && south && south.elec) { // S bit
    ctx.moveTo(px, top);
    ctx.lineTo(px - HALF_W, top + HALF_H);
  }
  ctx.stroke();
  ctx.restore();
}
