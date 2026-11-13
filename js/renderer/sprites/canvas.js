/**
 * Offscreen sprite canvas helpers shared by all sprite factories.
 * Sprites are rendered at SPRITE_SCALE resolution so they stay crisp up to 2x zoom.
 */

const SPRITE_SCALE = 2;

/**
 * @typedef {Object} Sprite
 * @property {HTMLCanvasElement} canvas
 * @property {number} w   logical width (world px)
 * @property {number} h   logical height
 * @property {number} ax  anchor x (tile centre) in logical px
 * @property {number} ay  anchor y
 * @property {HTMLCanvasElement} [low] lazily built 1x-resolution mip for zoomed-out views
 */

/** When true, blit() uses the low-resolution mip (set by the renderer per frame). */
let useLow = false;

/**
 * Select sprite level of detail for subsequent blits.
 * @param {number} pixelScale effective device pixels per world pixel (zoom * devicePixelRatio)
 */
export function setSpriteLod(pixelScale) {
  useLow = pixelScale <= 1.01;
}

/**
 * Build the 1x mip of a sprite.
 * @param {Sprite} s
 * @returns {HTMLCanvasElement}
 */
function lowRes(s) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(s.w);
  c.height = Math.ceil(s.h);
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.canvas, 0, 0, c.width, c.height);
  return c;
}

/**
 * Create a sprite by running a draw callback with the origin at the anchor.
 * @param {number} w
 * @param {number} h
 * @param {number} ax
 * @param {number} ay
 * @param {(ctx:CanvasRenderingContext2D)=>void} draw
 * @returns {Sprite}
 */
export function makeSprite(w, h, ax, ay, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * SPRITE_SCALE);
  canvas.height = Math.ceil(h * SPRITE_SCALE);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(ax, ay);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return { canvas, w, h, ax, ay };
}

/**
 * Draw a sprite with its anchor at world point (x, y).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Sprite} s
 * @param {number} x
 * @param {number} y
 */
export function blit(ctx, s, x, y) {
  if (s.pixel) { // pixel-art sprite (1:1, OpenGFX style): never smoothed, no mip
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.canvas, Math.round(x - s.ax), Math.round(y - s.ay), s.w, s.h);
    ctx.imageSmoothingEnabled = prev;
    return;
  }
  const img = useLow ? s.low || (s.low = lowRes(s)) : s.canvas;
  ctx.drawImage(img, x - s.ax, y - s.ay, s.w, s.h);
}

/**
 * Deterministic small PRNG for procedural textures (stable look between reloads).
 * @param {number} seed
 * @returns {()=>number} returns floats in [0,1)
 */
export function texRng(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Integer hash of tile coordinates (for variant selection).
 * @param {number} x
 * @param {number} y
 * @returns {number} non-negative int
 */
export function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Simple keyed cache of sprites.
 */
export class SpriteCache {
  constructor() {
    /** @type {Map<string, Sprite>} */
    this.map = new Map();
  }
  /**
   * @param {string} key
   * @param {()=>Sprite} build
   * @returns {Sprite}
   */
  get(key, build) {
    let s = this.map.get(key);
    if (!s) {
      s = build();
      this.map.set(key, s);
    }
    return s;
  }
  clear() {
    this.map.clear();
  }
}
