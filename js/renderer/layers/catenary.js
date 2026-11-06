/**
 * Catenary (electrified rail, cmdElectrify.js): a thin pole per electrified rail tile and a wire to each
 * electrified neighbour along the track. Drawn in the object pass (screen space, tile centre), cheap:
 * only tiles with `elec` cost anything.
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';

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

/** Tram bit -> [corner a, corner b] (edge), direction offset; matches transport.js TRAM_EDGE. */
const TRAM_DIRS = [[1, 0, -1, 0, 1], [2, 1, 0, 1, 2], [4, 0, 1, 2, 3], [8, -1, 0, 3, 0]];

/**
 * Overhead wires of tram track (OpenTTD electrified tram track): a pole at the tile centre and a wire from
 * the pole top to each track edge, following the corner heights like the tram rails do.
 * @param {CanvasRenderingContext2D} ctx world-space context (tile transform active)
 * @param {object} tile tile.tram (lazy, track bits N=1 E=2 S=4 W=8)
 * @param {number} sx tile centre x (iso)
 * @param {number} sy tile centre y (iso, already lifted by the centre height)
 * @param {number[]} c corner heights [hN,hE,hS,hW] (levels)
 */
export function drawTramWires(ctx, tile, sx, sy, c) {
  const hc = (c[0] + c[1] + c[2] + c[3]) / 4 * HEIGHT_STEP;
  const top = sy - POLE;
  const px = sx + 4;
  ctx.save();
  ctx.strokeStyle = POLE_COL;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, sy + 2);
  ctx.lineTo(px, top);
  ctx.moveTo(px - 3, top + 1);
  ctx.lineTo(px + 3, top - 1);
  ctx.stroke();
  ctx.strokeStyle = WIRE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const [bit, dx, dy, a, b] of TRAM_DIRS) {
    if (!(tile.tram & bit)) continue;
    const he = (c[a] + c[b]) / 2 * HEIGHT_STEP;
    const ex = (dx - dy) * HALF_W / 2, ey = (dx + dy) * HALF_H / 2;
    ctx.moveTo(px, top);
    ctx.lineTo(sx + ex, sy + ey - (he - hc) - POLE); // edge height relative to the centre
  }
  ctx.stroke();
  ctx.restore();
}
