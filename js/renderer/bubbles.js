/**
 * Bubble generator effect (OTTD effectvehicle.cpp EV_BUBBLE, sprites SPR_BUBBLE_* = 4748..4762, _bubble_movement).
 * Render-only: a fixed pool of bubbles (typed arrays, no per-frame allocation), spawned when a visible toyland
 * bubble generator (gfx 162) animates (pack/toyland.js). Never touches the simulation state or any cache.
 * The OTTD path is approximated: each bubble rises with a small sideways sway, swelling from the small sprite
 * (4748) to the large one (4762), then pops.
 */
import { blitPackFrom } from './pack/draw.js';

/** Hard cap on live bubbles (pool size). */
export const BUBBLE_MAX = 48;
/** Spawn offset from the tile top corner: OpenGFX child 4747 at (5,68) (industry_cmd.cpp special draw proc). */
const BUBBLE_DX = 5, BUBBLE_DY = 68;
/** Life of one bubble in seconds. */
const LIFE_S = 1.6;
/** Rise speed (world px/s) and sway amplitude (px). */
const RISE = 26, SWAY = 2.5;
/** Sprite key per 1/15 of life: 4748..4762 (precomputed; no string building per frame). */
const SPR = [];
for (let id = 4748; id <= 4762; id++) SPR.push(String(id));

const bx = new Float32Array(BUBBLE_MAX), by = new Float32Array(BUBBLE_MAX), age = new Float32Array(BUBBLE_MAX);
const ph = new Float32Array(BUBBLE_MAX);
let count = 0;

/**
 * Spawn one bubble above a generator tile (screen px of the tile top corner). No-op when the pool is full.
 * @param {number} topX tile top corner x
 * @param {number} topY tile top corner y
 */
export function spawnBubble(topX, topY) {
  if (count >= BUBBLE_MAX) return;
  bx[count] = topX + BUBBLE_DX; by[count] = topY + BUBBLE_DY; age[count] = 0; ph[count] = count * 1.7; count++;
}

/** Drop every live bubble (used when the toyland view is off). */
export function clearBubbles() { count = 0; }

/**
 * Advance and draw the pool (ctx already carries the world transform). Draws above the industries.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} pack toyland-view pack (sprites/atlases) used for the blit
 * @param {number} dt seconds since last frame
 */
export function drawBubbles(ctx, pack, dt) {
  if (!pack) { count = 0; return; }
  const d = dt > 0.1 ? 0.1 : dt;
  let w = 0;
  for (let i = 0; i < count; i++) {
    const a = age[i] + d;
    if (a >= LIFE_S) continue; // popped
    const t = a / LIFE_S;
    const x = bx[i] + Math.sin(ph[i] + a * 5) * SWAY;
    const y = by[i] - a * RISE;
    blitPackFrom(pack, ctx, SPR[(t * 14) | 0], x, y);
    bx[w] = bx[i]; by[w] = by[i]; age[w] = a; ph[w] = ph[i]; w++;
  }
  count = w;
}

