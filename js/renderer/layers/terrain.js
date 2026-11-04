/**
 * Ground layer: sloped terrain tops and animated water following the continuous corner heights
 * (see heights.js), a dark earth skirt on the map's south/east edges only, and shore foam.
 * Called per tile in painter's order by the renderer.
 */
import { terrainTop, waterTop, TERRAIN_VARIANTS, WATER_FRAMES } from '../sprites/terrain.js';
import { tileHash } from '../sprites/canvas.js';
import { HALF_W, HALF_H, HEIGHT_STEP as S } from '../iso.js';
import { drawSloped } from '../slope.js';
import { packActive } from '../pack/state.js';
import { drawOgfxGround } from '../pack/ground.js';

/** Fast array memo of sprites (avoids string-key allocation per tile per frame). */
const KINDS = ['grass', 'forest', 'desert', 'rock', 'snow', 'water'];
const KIND_INDEX = { grass: 0, forest: 1, desert: 2, rock: 3, snow: 4, water: 5 };
/** colour of the map-edge skirt */
const SKIRT = '#3b2f22';
/** @type {any[]} index: kind*TERRAIN_VARIANTS + variant */
const tops = [];
/** @type {any[]} index: frame*TERRAIN_VARIANTS + variant */
const waters = [];

/**
 * @param {number} k kind index
 * @param {number} v variant
 */
function top(k, v) {
  const i = k * TERRAIN_VARIANTS + v;
  return tops[i] || (tops[i] = terrainTop(KINDS[k], v));
}

/**
 * Draw the ground of one tile.
 * @param {CanvasRenderingContext2D} ctx world-space context
 * @param {{width:number,height:number,tiles:any[]}} map
 * @param {number} x
 * @param {number} y
 * @param {number} sx screen x of tile centre (flat, height 0)
 * @param {number} sy screen y of tile centre (flat, height 0)
 * @param {number} frame animation frame counter
 * @param {number[]} c corner heights [hN,hE,hS,hW] (levels) from Heights.tileCorners
 */
export function drawGround(ctx, map, x, y, sx, sy, frame, c) {
  const W = map.width, H = map.height;
  const tile = map.tiles[y * W + x];
  const hash = tileHash(x, y);
  const k = KIND_INDEX[tile.terrain] ?? 0;
  if (packActive() && k === 5) { // water: OpenGFX flat water tile 4061 (water_land.h SPR_FLAT_WATER_TILE)
    if (drawOgfxGround(ctx, 'water', hash, sx, sy, c)) return;
  } else if (packActive()) { // OpenGFX slope sprite (OpenTTD clear_land.h + landscape.cpp)
    if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
    // Flat land next to water is plain land in OpenTTD; the OpenGFX shore sprites (4062..) are for
    // sloped coast tiles only, which our flat-water vertex model does not produce (pack/water.js unused).
    if (drawOgfxGround(ctx, tile.terrain, hash, sx, sy, c)) return;
  }
  if (y === H - 1 || x === W - 1) drawSkirt(ctx, x, y, W, H, sx, sy, c);
  if (k === 5) {
    const f = ((frame >> 3) + (hash & 7)) % WATER_FRAMES;
    const i = f * TERRAIN_VARIANTS + (hash % TERRAIN_VARIANTS);
    drawSloped(ctx, waters[i] || (waters[i] = waterTop(f, hash % TERRAIN_VARIANTS)), sx, sy, c);
    drawShore(ctx, map, x, y, sx, sy, c);
  } else {
    drawSloped(ctx, top(k, hash % TERRAIN_VARIANTS), sx, sy, c);
  }
}

/**
 * Dark earth wall under the south (y = H-1) and east (x = W-1) edges, from the edge corners down
 * to level -1, so the map edge reads as a solid block. Interior tiles get no skirt.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} W
 * @param {number} H
 * @param {number} sx
 * @param {number} sy flat tile centre
 * @param {number[]} c corner heights
 */
function drawSkirt(ctx, x, y, W, H, sx, sy, c) {
  ctx.fillStyle = SKIRT;
  if (y === H - 1) {
    // south-west edge: W corner (left) to S corner (bottom)
    ctx.beginPath();
    ctx.moveTo(sx - HALF_W, sy - S * c[3]);
    ctx.lineTo(sx, sy + HALF_H - S * c[2]);
    ctx.lineTo(sx, sy + HALF_H + S);
    ctx.lineTo(sx - HALF_W, sy + S);
    ctx.closePath();
    ctx.fill();
  }
  if (x === W - 1) {
    // south-east edge: E corner (right) to S corner (bottom)
    ctx.beginPath();
    ctx.moveTo(sx + HALF_W, sy - S * c[1]);
    ctx.lineTo(sx, sy + HALF_H - S * c[2]);
    ctx.lineTo(sx, sy + HALF_H + S);
    ctx.lineTo(sx + HALF_W, sy + S);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Light foam line along water edges that border land (follows the sloped corners).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number,height:number,tiles:any[]}} map
 * @param {number} x
 * @param {number} y
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number[]} c corner heights
 */
function drawShore(ctx, map, x, y, sx, sy, c) {
  const W = map.width, H = map.height, t = map.tiles;
  const land = (nx, ny) => nx >= 0 && ny >= 0 && nx < W && ny < H && t[ny * W + nx].terrain !== 'water';
  const n = land(x, y - 1), e = land(x + 1, y), s = land(x, y + 1), w = land(x - 1, y);
  if (!(n || e || s || w)) return;
  // corners (inset slightly toward the tile centre)
  const k = 0.95;
  const cy = sy - S * (c[0] + c[1] + c[2] + c[3]) / 4;
  const pt = (px, py) => [sx + (px - sx) * k, cy + (py - cy) * k];
  const N = pt(sx, sy - HALF_H - S * c[0]);
  const E = pt(sx + HALF_W, sy - S * c[1]);
  const Sp = pt(sx, sy + HALF_H - S * c[2]);
  const Wp = pt(sx - HALF_W, sy - S * c[3]);
  ctx.strokeStyle = 'rgba(220,240,255,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // neighbour N (y-1) is the top-right edge, E (x+1) bottom-right, S (y+1) bottom-left, W (x-1) top-left
  if (n) { ctx.moveTo(N[0], N[1]); ctx.lineTo(E[0], E[1]); }
  if (e) { ctx.moveTo(E[0], E[1]); ctx.lineTo(Sp[0], Sp[1]); }
  if (s) { ctx.moveTo(Sp[0], Sp[1]); ctx.lineTo(Wp[0], Wp[1]); }
  if (w) { ctx.moveTo(Wp[0], Wp[1]); ctx.lineTo(N[0], N[1]); }
  ctx.stroke();
}
