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
import { drawTransport, drawTramOverlay, setBarredTiles } from './layers/transport.js';
import { drawNetTile } from './net/drawTile.js';
import { setSpriteLod } from './sprites/canvas.js';

export const CHUNK = 16;
/** Max chunk canvases alive at once (a scale-2 chunk is ~2048x1312 px, ~10 MB). */
export const MAX_CHUNKS = 24;
/** Per-frame time budget (ms) for building chunks: the first one is always built, more only within budget,
 *  so startup / fast pans spread chunk rasterising over frames instead of one 200-300 ms frame. */
export const BUILD_BUDGET_MS = 10;
/** Per-frame budget (ms) while visible chunks are still unbuilt (placeholder on screen, e.g. right after boot).
 *  Only applies while something visible is missing, so steady-state frames keep BUILD_BUDGET_MS. */
export const BUILD_BUDGET_MISSING_MS = 16;
/** Placeholder fill for a chunk that is still waiting to be built (flat grass diamond). */
const PLACEHOLDER = '#5b7f3a';
/** Placeholder colour for terrains whose look does not depend on the climate. */
const PLACEHOLDER_COLOUR = { forest: '#4a6e30', water: '#2a5a8a' }; // others: PLACEHOLDER grass (desert/snow/rock tiles draw climate-dependent ground)
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
    /** @type {Map<number, any>} in-progress chunk builds (tile-sliced), keyed by chunk index */
    this.jobs = new Map();
  }

  /** Release every canvas and bind to a map. */
  reset(map, heights) {
    this.releaseAll();
    this.map = map;
    this.heights = heights;
    this.cols = Math.ceil(map.width / CHUNK);
    this.rows = Math.ceil(map.height / CHUNK);
    this.chunks = new Array(this.cols * this.rows).fill(null);
    this.jobs = new Map();
  }

  /** @param {number} i chunk index */
  release(i) {
    const rec = this.chunks[i];
    if (rec && rec.canvas) { rec.canvas.width = 0; rec.canvas.height = 0; }
    this.chunks[i] = null;
  }

  releaseAll() {
    for (let i = 0; i < this.chunks.length; i++) this.release(i);
    for (const j of this.jobs.values()) j.canvas.width = 0;
    this.jobs = new Map();
  }

  /** Mark every chunk dirty (e.g. after a build command). */
  /**
   * Barred level crossings (tile indices, or null). Chunks holding a tile whose state changed are marked for
   * rebuild at once (no need to wait for the periodic signature check).
   */
  setBarred(set) {
    const prev = this.barred || null;
    if (prev === set) return;
    const W = this.map ? this.map.width : 0;
    const mark = (i) => {
      const cx = Math.floor((i % W) / CHUNK), cy = Math.floor(Math.floor(i / W) / CHUNK);
      const rec = this.chunks[cy * this.cols + cx];
      if (rec) rec.sig = -1;
    };
    if (prev) for (const i of prev) if (!set || !set.has(i)) mark(i);
    if (set) for (const i of set) if (!prev || !prev.has(i)) mark(i);
    this.barred = set;
  }

  invalidate() {
    for (const c of this.chunks) if (c) c.sig = -1;
    for (const j of this.jobs.values()) j.stale = true; // finished job will be rebuilt on next check
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
        const bar = this.barred && this.barred.has(y * m.width + x) ? 1 : 0; // level crossing barriers (levelCrossing.js)
        h = (Math.imul(h, 31) + bar * 33554393 + (TERRAIN_CODE[t.terrain] | 0) * 7 + t.height * 131 + t.rail * 1031 + t.road * 16411 + bc * 262147 + (t.avenue | 0) * 1048583 + lm + (t.tunnel | 0) * 2097143 + (t.gradeSep | 0) * 4194301 + (t.tunnelPortal | 0) * 8388593 + (t.trk | 0) * 16777259 + (t.bridgeDeck !== undefined ? t.bridgeDeck + 1 : 0) * 16777213) | 0;
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
   * Start a tile-sliced build of one chunk into a fresh canvas (the displayed chunk is untouched
   * until the job finishes, then swapped in by finishJob).
   * @param {number} cx
   * @param {number} cy
   * @param {number} sig
   */
  startJob(cx, cy, sig) {
    const m = this.map;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const x1 = Math.min(m.width, x0 + CHUNK) - 1, y1 = Math.min(m.height, y0 + CHUNK) - 1;
    const wx = (x0 - y1) * HALF_W - HALF_W;
    const ww = (x1 - x0 + y1 - y0 + 2) * HALF_W;
    const wy = (x0 + y0) * HALF_H - PAD_TOP;
    const wh = (x1 - x0 + y1 - y0) * HALF_H + PAD_TOP + PAD_BOTTOM;
    const scale = this.scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(ww * scale);
    canvas.height = Math.ceil(wh * scale);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.setTransform(scale, 0, 0, scale, -wx * scale, -wy * scale);
    // tile order identical to the one-shot build (diagonals, then x): pixels do not depend on slicing
    const order = [];
    for (let d = x0 + y0; d <= x1 + y1; d++) {
      for (let x = Math.max(x0, d - y1); x <= Math.min(x1, d - y0); x++) order.push(x, d - x);
    }
    return { idx: cy * this.cols + cx, cx, cy, sig, scale, wx, wy, ww, wh, canvas, ctx, order, k: 0, stale: false, used: this.frame };
  }

  /**
   * Draw tiles of a job until `deadline` (performance.now ms); at least one tile per call.
   * @returns {boolean} true when the job is complete
   */
  stepJob(job, deadline) {
    const m = this.map, ctx = job.ctx, order = job.order;
    setSpriteLod(job.scale);
    // always paint >=1 tile (so a job makes progress), but yield before starting the next if the
    // frame budget is exhausted — a single complex net tile (texTile.paint) can take 100ms+, and
    // the old post-tile check let that overshoot create >100ms startup frames on Moscow.
    while (job.k < order.length) {
      if (job.k > 0 && performance.now() >= deadline) break;
      const x = order[job.k], y = order[job.k + 1];
      job.k += 2;
      const tile = m.tiles[y * m.width + x];
      const sx = (x - y) * HALF_W, sy = (x + y) * HALF_H;
      const c = this.heights.tileCorners(x, y);
      drawGround(ctx, m, x, y, sx, sy, 0, c);
      drawTransport(ctx, tile, sx, sy, c, m, x, y);
      drawNetTile(ctx, m, x, y, sx, sy, this.heights);
      if (tile.tram) drawTramOverlay(ctx, tile, sx, sy, c);
    }
    return job.k >= order.length;
  }

  /** Swap a finished job in as the chunk's canvas (the old canvas is released). */
  finishJob(job) {
    const old = this.chunks[job.idx];
    if (old && old.canvas) { old.canvas.width = 0; old.canvas.height = 0; }
    this.jobs.delete(job.idx);
    this.chunks[job.idx] = { canvas: job.canvas, wx: job.wx, wy: job.wy, ww: job.ww, wh: job.wh, sig: job.stale ? -1 : job.sig, scale: job.scale, used: this.frame };
    return this.chunks[job.idx];
  }

  /**
   * Ground-coloured stand-in where a not-yet-built chunk goes (avoids holes): one quad per tile following its
   * corner heights, coloured by terrain, batched into one path per colour (no per-tile allocations or fills).
   */
  placeholder(ctx, cx, cy) {
    const m = this.map, hs = this.heights, W = m.width;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(m.height, y0 + CHUNK);
    const paths = {};
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const col = PLACEHOLDER_COLOUR[m.tiles[y * W + x].terrain] || PLACEHOLDER;
        const path = paths[col] || (paths[col] = new Path2D());
        const sx = (x - y) * HALF_W, sy = (x + y) * HALF_H;
        // (sx, sy) is the tile centre (as in stepJob); corners N, E, S, W like iso.js
        path.moveTo(sx, sy - HALF_H - hs.cornerH(x, y) * HEIGHT_STEP);
        path.lineTo(sx + HALF_W, sy - hs.cornerH(x + 1, y) * HEIGHT_STEP);
        path.lineTo(sx, sy + HALF_H - hs.cornerH(x + 1, y + 1) * HEIGHT_STEP);
        path.lineTo(sx - HALF_W, sy - hs.cornerH(x, y + 1) * HEIGHT_STEP);
        path.closePath();
      }
    }
    for (const col in paths) { ctx.fillStyle = col; ctx.fill(paths[col]); }
  }

  /** Release least-recently-drawn chunks (not drawn this frame) until within MAX_CHUNKS. */
  trim() {
    for (const [idx, j] of this.jobs) if (j.used < this.frame) { j.canvas.width = 0; this.jobs.delete(idx); }
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
    setBarredTiles(this.barred || null);
    this.scale = scale;
    this.frame++;
    const frame = this.frame;
    const cx0 = Math.floor(range.x0 / CHUNK), cx1 = Math.floor(range.x1 / CHUNK);
    const cy0 = Math.floor(range.y0 / CHUNK), cy1 = Math.floor(range.y1 / CHUNK);
    this.pending = 0; // chunks drawn as placeholders this call (whole-map export waits for 0)
    const t0 = performance.now();
    const budgetMs = this.missingLast > 0 ? BUILD_BUDGET_MISSING_MS : BUILD_BUDGET_MS;
    let worked = false;
    for (let s = cx0 + cy0; s <= cx1 + cy1; s++) {
      for (let cx = Math.max(cx0, s - cy1); cx <= Math.min(cx1, s - cy0); cx++) {
        const cy = s - cx;
        const idx = cy * this.cols + cx;
        const rec = this.chunks[idx];
        let use = rec;
        let job = this.jobs.get(idx);
        if (job && job.scale !== scale) { job.canvas.width = 0; this.jobs.delete(idx); job = null; }
        if (!job && (!rec || rec.scale !== scale || rec.sig === -1 || checkSig)) {
          const sig = this.signature(cx, cy);
          if (!rec || rec.scale !== scale || rec.sig !== sig) {
            job = this.startJob(cx, cy, sig);
            this.jobs.set(idx, job);
          } else if (rec.scale === scale) {
            rec.sig = sig;
          }
        }
        if (job) {
          job.used = frame;
          // time-sliced: the frame budget is shared by all chunks; the first tile of a frame always runs
          if (!worked || performance.now() - t0 < budgetMs) {
            worked = true;
            if (this.stepJob(job, t0 + budgetMs)) use = this.finishJob(job);
          }
          if (use === rec) {
            if (!rec) { this.placeholder(ctx, cx, cy); this.pending++; use = null; } // stale chunk is drawn meanwhile
          }
        }
        if (use) {
          use.used = frame;
          ctx.drawImage(use.canvas, use.wx, use.wy, use.ww, use.wh);
        }
      }
    }
    this.missingLast = this.pending; // next frame: larger budget while visible chunks are missing
    this.trim();
    setSpriteLod(pixelScale);
  }
}
