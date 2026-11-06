/**
 * Ground chunk cache: pre-renders ground + transport of 16x16 tile chunks into offscreen canvases
 * so a visible map costs a few dozen drawImage calls per frame instead of per-tile clip/save/restore.
 * Chunk raster scale follows the device pixel scale (0.5 / 1 / 2). Chunks are invalidated by a cheap
 * per-chunk signature of the ground-relevant tile fields. Memory: at most MAX_CHUNKS canvases are kept;
 * the least-recently-drawn ones are released (width = height = 0). Stale-scale chunks are drawn
 * (scaled) until rebuilt, so a zoom change never shows a hole.
 */
import { HALF_W, HALF_H, HEIGHT_STEP } from './iso.js';
import { drawGround } from './layers/terrain.js';
import { drawTransport } from './layers/transport.js';
import { drawNetTile } from './net/drawTile.js';
import { setSpriteLod } from './sprites/canvas.js';

export const CHUNK = 16;
/** Max chunk canvases alive at once (a scale-2 chunk is ~2048x1312 px, ~10 MB). */
export const MAX_CHUNKS = 24;
/** Per-frame time budget (ms) for building chunks: the first one is always built, more only within budget,
 *  so startup / fast pans spread chunk rasterising over frames instead of one 200-300 ms frame. */
export const BUILD_BUDGET_MS = 10;
/** Placeholder fill for a chunk that is still waiting to be built (flat grass diamond). */
const PLACEHOLDER = '#5b7f3a';
const PAD_TOP = HALF_H + 8 * HEIGHT_STEP;
const PAD_BOTTOM = HALF_H + 10 * HEIGHT_STEP;
const TERRAIN_CODE = { grass: 1, forest: 2, desert: 3, rock: 4, snow: 5, water: 6 };

/**
 * Chunk raster scale for a device pixel scale (zoom * dpr).
 * @param {number} z
 */
export function chunkScaleFor(z) {
  return z <= 0.55 ? 0.5 : z <= 1.1 ? 1 : 2;
}

export class GroundCache {
  constructor() {
    /** @type {any[]} chunk records {canvas, wx, wy, ww, wh, sig, scale, used} or null */
    this.chunks = [];
    this.cols = 0;
    this.rows = 0;
    this.scale = 1;
    this.frame = 0;
    this.map = null;
  }

  /** Release every canvas and bind to a map. */
  reset(map, heights) {
    this.releaseAll();
    this.map = map;
    this.heights = heights;
    this.cols = Math.ceil(map.width / CHUNK);
    this.rows = Math.ceil(map.height / CHUNK);
    this.chunks = new Array(this.cols * this.rows).fill(null);
  }

  /** @param {number} i chunk index */
  release(i) {
    const rec = this.chunks[i];
    if (rec && rec.canvas) { rec.canvas.width = 0; rec.canvas.height = 0; }
    this.chunks[i] = null;
  }

  releaseAll() {
    for (let i = 0; i < this.chunks.length; i++) this.release(i);
  }

  /** Mark every chunk dirty (e.g. after a build command). */
  invalidate() {
    for (const c of this.chunks) if (c) c.sig = -1;
  }

  /** Number of live chunk canvases. */
  liveCount() {
    let n = 0;
    for (const c of this.chunks) if (c) n++;
    return n;
  }

  /**
   * Signature of a chunk's ground-relevant content.
   * @param {number} cx
   * @param {number} cy
   * @returns {number}
   */
  signature(cx, cy) {
    const m = this.map;
    let h = 17;
    const cx0 = cx * CHUNK, cy0 = cy * CHUNK;
    const x1 = Math.min(m.width, (cx + 1) * CHUNK), y1 = Math.min(m.height, (cy + 1) * CHUNK);
    for (let y = cy * CHUNK; y < y1; y++) {
      for (let x = cx * CHUNK; x < x1; x++) {
        const t = m.tiles[y * m.width + x];
        const b = t.building;
        const lm = b && b.type === 'landmark' ? 7 + (b.dx | 0) * 3 + (b.dy | 0) * 5 + (b.id ? b.id.length : 0) * 11 : 0;
        const bc = b ? (b.type === 'station' ? (b.kind === 'rail' ? 3 : 4) + (b.axis === 'y' ? 8 : 0) : b.type === 'depot' ? 5 : 1) : 0;
        h = (Math.imul(h, 31) + (TERRAIN_CODE[t.terrain] | 0) * 7 + t.height * 131 + t.rail * 1031 + t.road * 16411 + bc * 262147 + (t.avenue | 0) * 1048583 + lm + (t.tunnel | 0) * 2097143 + (t.gradeSep | 0) * 4194301 + (t.tunnelPortal | 0) * 8388593 + (t.bridgeDeck !== undefined ? t.bridgeDeck + 1 : 0) * 16777213) | 0;
      }
    }
    // corner heights of the chunk (incl. the shared south/east border) capture neighbour influence
    const hd = this.heights.data, cw = this.heights.cw;
    for (let yy = cy0; yy <= y1 + 1; yy++) {
      for (let xx = cx0; xx <= x1 + 1; xx++) h = (Math.imul(h, 31) + Math.round(hd[yy * cw + xx] * 64)) | 0;
    }
    return h;
  }

  /**
   * Render one chunk canvas (replacing any previous canvas of this chunk).
   * @param {number} cx
   * @param {number} cy
   * @param {number} sig
   * @returns {any}
   */
  build(cx, cy, sig) {
    const m = this.map;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const x1 = Math.min(m.width, x0 + CHUNK) - 1, y1 = Math.min(m.height, y0 + CHUNK) - 1;
    const wx = (x0 - y1) * HALF_W - HALF_W;
    const ww = (x1 - x0 + y1 - y0 + 2) * HALF_W;
    const wy = (x0 + y0) * HALF_H - PAD_TOP;
    const wh = (x1 - x0 + y1 - y0) * HALF_H + PAD_TOP + PAD_BOTTOM;
    const idx = cy * this.cols + cx;
    const scale = this.scale;
    const old = this.chunks[idx];
    let canvas;
    if (old && old.canvas && old.canvas.width === Math.ceil(ww * scale) && old.canvas.height === Math.ceil(wh * scale)) {
      canvas = old.canvas; // same size: reuse the canvas
    } else {
      if (old && old.canvas) { old.canvas.width = 0; old.canvas.height = 0; }
      canvas = document.createElement('canvas');
      canvas.width = Math.ceil(ww * scale);
      canvas.height = Math.ceil(wh * scale);
    }
    const rec = { canvas, wx, wy, ww, wh, sig, scale, used: this.frame };
    this.chunks[idx] = rec;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, -wx * scale, -wy * scale);
    setSpriteLod(scale);
    for (let d = x0 + y0; d <= x1 + y1; d++) {
      for (let x = Math.max(x0, d - y1); x <= Math.min(x1, d - y0); x++) {
        const y = d - x;
        const tile = m.tiles[y * m.width + x];
        const sx = (x - y) * HALF_W, sy = (x + y) * HALF_H;
        const c = this.heights.tileCorners(x, y);
        drawGround(ctx, m, x, y, sx, sy, 0, c);
        drawTransport(ctx, tile, sx, sy, c, m, x, y);
        drawNetTile(ctx, m, x, y, sx, sy, this.heights);
      }
    }
    return rec;
  }

  /** Flat diamond in the ground colour where a not-yet-built chunk goes (avoids holes). */
  placeholder(ctx, cx, cy) {
    const m = this.map;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const x1 = Math.min(m.width, x0 + CHUNK) - 1, y1 = Math.min(m.height, y0 + CHUNK) - 1;
    ctx.fillStyle = PLACEHOLDER;
    ctx.beginPath();
    ctx.moveTo((x0 - y0) * HALF_W, (x0 + y0) * HALF_H - HALF_H);
    ctx.lineTo((x1 - y0) * HALF_W + HALF_W, (x1 + y0) * HALF_H);
    ctx.lineTo((x1 - y1) * HALF_W, (x1 + y1) * HALF_H + HALF_H);
    ctx.lineTo((x0 - y1) * HALF_W - HALF_W, (x0 + y1) * HALF_H);
    ctx.closePath();
    ctx.fill();
  }

  /** Release least-recently-drawn chunks (not drawn this frame) until within MAX_CHUNKS. */
  trim() {
    let live = this.liveCount();
    while (live > MAX_CHUNKS) {
      let best = -1, bestUsed = Infinity;
      for (let i = 0; i < this.chunks.length; i++) {
        const c = this.chunks[i];
        if (c && c.used < this.frame && c.used < bestUsed) { bestUsed = c.used; best = i; }
      }
      if (best < 0) break;
      this.release(best);
      live--;
    }
  }

  /**
   * Draw cached ground + transport for the visible tile range.
   * @param {CanvasRenderingContext2D} ctx world-space context
   * @param {{x0:number,y0:number,x1:number,y1:number}} range visible tiles
   * @param {number} pixelScale zoom * dpr
   * @param {boolean} checkSig re-validate signatures this frame
   * @param {number} buildBudget max chunks to rebuild (re-validate) this frame
   */
  draw(ctx, range, pixelScale, checkSig, buildBudget = 6) {
    const scale = chunkScaleFor(pixelScale);
    this.scale = scale;
    this.frame++;
    const frame = this.frame;
    const cx0 = Math.floor(range.x0 / CHUNK), cx1 = Math.floor(range.x1 / CHUNK);
    const cy0 = Math.floor(range.y0 / CHUNK), cy1 = Math.floor(range.y1 / CHUNK);
    let built = 0;
    const t0 = performance.now();
    for (let s = cx0 + cy0; s <= cx1 + cy1; s++) {
      for (let cx = Math.max(cx0, s - cy1); cx <= Math.min(cx1, s - cy0); cx++) {
        const cy = s - cx;
        const idx = cy * this.cols + cx;
        const rec = this.chunks[idx];
        let use = rec;
        if (!rec || rec.scale !== scale || rec.sig === -1 || checkSig) {
          const sig = this.signature(cx, cy);
          if (!rec || rec.scale !== scale || rec.sig !== sig) {
            if (built === 0 || (built < buildBudget && performance.now() - t0 < BUILD_BUDGET_MS)) {
              use = this.build(cx, cy, sig);
              built++;
            } else if (!rec) {
              this.placeholder(ctx, cx, cy); // built in a later frame
            }
          } else if (rec.scale === scale) {
            rec.sig = sig;
          }
        }
        if (use) {
          use.used = frame;
          ctx.drawImage(use.canvas, use.wx, use.wy, use.ww, use.wh);
        }
      }
    }
    this.trim();
    setSpriteLod(pixelScale);
  }
}
