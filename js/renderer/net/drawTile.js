/**
 * Per-tile driver of the smooth net renderer: draws the road and rail ribbons (net/index.js spans)
 * touching tile (x,y). Called from groundCache for every tile right after drawTransport.
 * Ribbons are drawn unclipped with a one-point overlap at span ends: a tile that spills onto a
 * neighbour redraws the same span there, so the neighbour's ground never hides a ribbon.
 * Ported from OpenLoco (MIT) track/road layering; geometry is our own (see r6-contract.md).
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from '../iso.js';
import { getNet } from './index.js';
import { netActive } from './state.js';
import { drawRoadSpan } from './drawRoad.js';
import { drawRailSpan } from './drawRail.js';
import { packActive } from '../pack/state.js';
import { netTileSprite, netTexReady } from './texTile.js';
import { drawSloped } from '../slope.js';

/** Reusable screen-point buffer. */
let buf = new Float32Array(256);

/**
 * True when the net draws this tile's road (or rail) surface, so the old per-tile sprite must
 * be skipped (node tiles keep their sprites). Tiles with both road and rail are nodes.
 * @param {any} map
 * @param {any} tile
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function netDrawsSurface(map, tile, x, y) {
  if (!map || !netActive()) return false;
  const road = tile.road | 0, rail = tile.tunnel ? 0 : (tile.rail | 0);
  if (road && rail) return false;
  if (road) return getNet(map, 'road').covered[y * map.width + x] === 1;
  if (rail) return getNet(map, 'rail').covered[y * map.width + x] === 1;
  return false;
}

/**
 * Draw the net ribbons of tile (x,y).
 * @param {CanvasRenderingContext2D} ctx world-space context (same origin as groundCache)
 * @param {{width:number,height:number,tiles:any[]}} map
 * @param {number} x
 * @param {number} y
 * @param {number} sx flat tile centre x (unused: screen is computed from tile coords)
 * @param {number} sy flat tile centre y (unused)
 * @param {{surfaceH:(fx:number,fy:number)=>number}} heights Heights instance
 */
export function drawNetTile(ctx, map, x, y, sx, sy, heights) {
  if (!netActive()) return;
  const i = y * map.width + x;
  { // straight road/rail texture (OpenGFX, or procedural) bent along the smooth centreline
    const s = netTileSprite(map, x, y, packActive() && netTexReady());
    if (s) drawSloped(ctx, s, sx, sy, heights.tileCorners(x, y));
    return;
  }
  // clip to this tile's (sloped) diamond: later tiles' ground would otherwise cut unclipped ribbons
  const c = heights.tileCorners(x, y);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sx, sy - HALF_H - c[0] * HEIGHT_STEP);
  ctx.lineTo(sx + HALF_W, sy - c[1] * HEIGHT_STEP);
  ctx.lineTo(sx, sy + HALF_H - c[2] * HEIGHT_STEP);
  ctx.lineTo(sx - HALF_W, sy - c[3] * HEIGHT_STEP);
  ctx.closePath();
  ctx.clip();
  const t = map.tiles[i];
  for (const kind of ['road', 'rail']) {
    const net = getNet(map, kind);
    const list = net.byTile[i];
    if (!list) continue;
    const bits = kind === 'rail' ? (t.tunnel ? 0 : t.rail | 0) : (t.road | 0);
    if (bits && !net.covered[i]) continue; // node tile keeps its own sprite
    for (const sp of list) {
      const e = net.edges[sp.e];
      const np = e.pts.length >> 1;
      const i0 = Math.max(0, sp.i0 - 1), i1 = Math.min(np - 1, sp.i1 + 1);
      const n = i1 - i0 + 1;
      if (buf.length < 2 * n) buf = new Float32Array(2 * n * 2);
      const P = e.pts;
      for (let k = 0; k < n; k++) {
        const px = P[2 * (i0 + k)], py = P[2 * (i0 + k) + 1];
        const h = heights.surfaceH(px, py);
        buf[2 * k] = (px - py) * HALF_W;
        buf[2 * k + 1] = (px + py) * HALF_H - h * HEIGHT_STEP;
      }
  if (kind === 'road') {
        const tile = map.tiles[i];
        const paved = (tile.avenue | 0) > 0 || tile.owner === 'town';
        drawRoadSpan(ctx, e, i0, buf, n, paved, e.cls | 0, ogfx, tile.highway === 1);
      } else {
        drawRailSpan(ctx, e, i0, buf, n, ogfx);
      }
    }
  }
  ctx.restore();
}
