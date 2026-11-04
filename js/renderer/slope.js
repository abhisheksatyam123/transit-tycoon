/**
 * Draws flat (height-0) tile sprites onto sloped tile surfaces. A tile's surface is two planar
 * triangles split along the screen-vertical N–S diagonal (see heights.js). Each triangle is
 * clipped and receives an affine transform so the sprite follows its plane. Planar tiles
 * (hN+hS == hE+hW) need neither clipping nor splitting.
 */
import { HALF_W, HALF_H, HEIGHT_STEP as S } from './iso.js';
import { blit } from './sprites/canvas.js';

const EPS = 1e-6;
/** outward expansion of clip polygons (hides seams between triangles) */
const SEAM = 0.6;

/**
 * Affine map of a flat sprite onto plane h(u,v)=h0+a*u+b*v (see module doc).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} sprite
 * @param {number} sx flat tile centre x
 * @param {number} sy flat tile centre y
 * @param {number} h0 plane height at tile centre
 * @param {number} a
 * @param {number} b
 */
function drawPlane(ctx, sprite, sx, sy, h0, a, b) {
  const c = (-S * (a - b)) / (2 * HALF_W);
  const d = 1 - (S * (a + b)) / (2 * HALF_H);
  const e = -S * h0;
  ctx.transform(1, c, 0, d, sx, sy + e);
  blit(ctx, sprite, 0, 0);
}

/**
 * Clip the context to a triangle given in screen points, grown by SEAM px from its centroid.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}[]} p three points
 */
function clipTri(ctx, p) {
  const gx = (p[0].x + p[1].x + p[2].x) / 3, gy = (p[0].y + p[1].y + p[2].y) / 3;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const dx = p[i].x - gx, dy = p[i].y - gy;
    const l = Math.hypot(dx, dy) || 1;
    const px = p[i].x + (dx / l) * SEAM, py = p[i].y + (dy / l) * SEAM;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.clip();
}

/**
 * Draw a flat tile sprite on a sloped tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} sprite sprite whose anchor is the tile centre
 * @param {number} sx flat (height 0) screen x of tile centre
 * @param {number} sy flat (height 0) screen y of tile centre
 * @param {number[]} c corner heights [hN,hE,hS,hW] in levels
 */
export function drawSloped(ctx, sprite, sx, sy, c) {
  const [hN, hE, hS, hW] = c;
  if (hN === hE && hE === hS && hS === hW) {
    blit(ctx, sprite, sx, sy - S * hN);
    return;
  }
  // corner plane coefficients: h(u,v) = h0 + a*u + b*v
  const aA = hE - hN, bA = hS - hE; // triangle N,E,S
  if (Math.abs(hN + hS - hE - hW) < EPS) {
    ctx.save();
    drawPlane(ctx, sprite, sx, sy, (hN + hS) / 2, aA, bA);
    ctx.restore();
    return;
  }
  const aB = hS - hW, bB = hW - hN; // triangle N,S,W
  const pN = { x: sx, y: sy - HALF_H - S * hN };
  const pE = { x: sx + HALF_W, y: sy - S * hE };
  const pS = { x: sx, y: sy + HALF_H - S * hS };
  const pW = { x: sx - HALF_W, y: sy - S * hW };
  ctx.save();
  clipTri(ctx, [pN, pE, pS]);
  drawPlane(ctx, sprite, sx, sy, hN + 0.5 * (aA + bA), aA, bA);
  ctx.restore();
  ctx.save();
  clipTri(ctx, [pN, pS, pW]);
  drawPlane(ctx, sprite, sx, sy, hN + 0.5 * (aB + bB), aB, bB);
  ctx.restore();
}
