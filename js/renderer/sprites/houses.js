/**
 * Procedural town house sprites by level (1..4) and variant.
 * Level 1: cottage, 2: town house, 3: apartment block, 4: office tower.
 */
import { makeSprite, texRng, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { HOUSE_COLOURS, shade } from '../palette.js';
import { box, gableRoof, quad, windows, tree } from './shapes.js';
import { historic, stalinka, khrushchyovka } from './housesMoscow.js';
import { panel, modern, glass, cottage, industrial, warehouse, mall } from './housesModern.js';

const cache = new SpriteCache();
const TALL = 110;
const WIN = 'rgba(30,45,70,0.85)';
const WIN_LIT = '#fde68a';

/**
 * Draw a small garden/pavement ground for a house tile.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} level
 */
function ground(ctx, level) {
  quad(ctx, -0.46, -0.46, 0.46, 0.46, 0, level >= 3 ? '#9aa0a6' : '#6f9f48');
  if (level < 3) quad(ctx, 0.3, -0.1, 0.46, 0.1, 0.1, '#b9b4a6');
}

/** @type {Array<(ctx:CanvasRenderingContext2D,c:string[],r:()=>number)=>void>} */
const LEVELS = [
  // level 1: cottage
  (ctx, c, r) => {
    const ridge = r() < 0.5 ? 'u' : 'v';
    box(ctx, -0.28, -0.25, 0.22, 0.25, 0, 11, c[0]);
    windows(ctx, 'v', -0.22, 0.18, 0.25, 4, 2, WIN, 3);
    windows(ctx, 'u', -0.18, 0.2, 0.22, 4, 2, WIN, 3);
    gableRoof(ctx, -0.32, -0.29, 0.26, 0.29, 11, 9, ridge, c[1]);
    if (r() < 0.7) tree(ctx, 0.36, 0.34, 0.55, '#4e8f2f', false);
  },
  // level 2: two-storey town house
  (ctx, c, r) => {
    box(ctx, -0.34, -0.3, 0.3, 0.3, 0, 20, c[0]);
    windows(ctx, 'v', -0.3, 0.26, 0.3, 4, 3, WIN, 4);
    windows(ctx, 'v', -0.3, 0.26, 0.3, 12, 3, r() < 0.3 ? WIN_LIT : WIN, 4);
    windows(ctx, 'u', -0.26, 0.26, 0.3, 4, 3, WIN, 4);
    windows(ctx, 'u', -0.26, 0.26, 0.3, 12, 3, WIN, 4);
    gableRoof(ctx, -0.38, -0.34, 0.34, 0.34, 20, 10, r() < 0.5 ? 'u' : 'v', c[1]);
  },
  // level 3: apartment block
  (ctx, c, r) => {
    const h = 34 + Math.floor(r() * 3) * 6;
    box(ctx, -0.38, -0.36, 0.36, 0.36, 0, h, c[0], shade(c[0], 0.9));
    for (let z = 4; z < h - 4; z += 7) {
      windows(ctx, 'v', -0.34, 0.32, 0.36, z, 4, r() < 0.2 ? WIN_LIT : WIN, 4);
      windows(ctx, 'u', -0.32, 0.32, 0.36, z, 4, r() < 0.2 ? WIN_LIT : WIN, 4);
    }
    box(ctx, -0.1, -0.1, 0.1, 0.1, h, h + 4, '#8a8f96');
  },
  // level 4: office tower
  (ctx, c, r) => {
    const h = 58 + Math.floor(r() * 4) * 8;
    const glass = ['#4b6f8f', '#3f5f7a', '#56738a', '#5b6b7d'][Math.floor(r() * 4)];
    box(ctx, -0.4, -0.4, 0.4, 0.4, 0, 8, '#a3a3a3');
    box(ctx, -0.32, -0.32, 0.32, 0.32, 8, h, glass, shade(glass, 0.8));
    for (let z = 12; z < h - 2; z += 5) {
      windows(ctx, 'v', -0.3, 0.3, 0.32, z, 5, r() < 0.25 ? WIN_LIT : 'rgba(180,210,235,0.45)', 2.5);
      windows(ctx, 'u', -0.3, 0.3, 0.32, z, 5, r() < 0.15 ? WIN_LIT : 'rgba(150,180,205,0.35)', 2.5);
    }
    box(ctx, -0.12, -0.12, 0.12, 0.12, h, h + 6, '#7c838c');
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-0.5, -h - 14, 1, 1.5);
  },
];

/** Moscow building styles (index = style id used in cache keys; 0 = none/generic). */
export const STYLES = ['', 'historic', 'stalinka', 'khrushchyovka', 'panel', 'modern', 'glass', 'cottage', 'industrial', 'warehouse', 'mall'];
const STYLE_DRAW = [null, historic, stalinka, khrushchyovka, panel, modern, glass, cottage, industrial, warehouse, mall];
/** Sprite height above the ground for Moscow styles (tall towers and spires). */
const STYLE_TALL = 150;

/**
 * House sprite.
 * @param {number} level 1..4
 * @param {number} variant
 * @param {string} [style] one of STYLES; absent or unknown = generic level drawing
 * @returns {import('./canvas.js').Sprite}
 */
export function houseSprite(level, variant, style) {
  const lv = Math.max(1, Math.min(4, level | 0));
  const v = Math.abs(variant | 0) % 16;
  const si = STYLES.indexOf(style || '');
  if (si > 0) {
    return cache.get(`s:${si * 64 + lv * 16 + v}`, () => makeSprite(TILE_W, TILE_H + STYLE_TALL, HALF_W, HALF_H + STYLE_TALL, (ctx) => {
      const r = texRng(si * 977 + lv * 101 + v * 7);
      STYLE_DRAW[si](ctx, lv, v, r);
    }));
  }
  return cache.get(`h:${lv}:${v}`, () => makeSprite(TILE_W, TILE_H + TALL, HALF_W, HALF_H + TALL, (ctx) => {
    const r = texRng(lv * 101 + v * 7);
    const colours = HOUSE_COLOURS[v % HOUSE_COLOURS.length];
    ground(ctx, lv);
    LEVELS[lv - 1](ctx, colours, r);
  }));
}
