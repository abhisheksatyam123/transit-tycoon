/**
 * Procedural terrain sprites: tile tops (per terrain kind + variant), animated water frames,
 * cliff side faces, and tree clusters for forest tiles. All cached.
 */
import { makeSprite, texRng, SpriteCache } from './canvas.js';
import { HALF_W, HALF_H, TILE_W, TILE_H, HEIGHT_STEP } from '../iso.js';
import { TERRAIN, FACES, shade } from '../palette.js';
import { tree } from './shapes.js';

export const TERRAIN_VARIANTS = 4;
export const WATER_FRAMES = 8;

const cache = new SpriteCache();

/**
 * Path a diamond centred at the origin.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} [inset] px inset
 */
function diamondPath(ctx, inset = 0) {
  const hw = HALF_W - inset * 2, hh = HALF_H - inset;
  ctx.beginPath();
  ctx.moveTo(0, -hh);
  ctx.lineTo(hw, 0);
  ctx.lineTo(0, hh);
  ctx.lineTo(-hw, 0);
  ctx.closePath();
}

/**
 * Random point inside the diamond (uniform in tile space).
 * @param {()=>number} r
 * @param {number} [margin] tile-unit margin
 * @returns {[number,number]}
 */
function randPoint(r, margin = 0.05) {
  const u = (r() - 0.5) * (1 - margin * 2), v = (r() - 0.5) * (1 - margin * 2);
  return [(u - v) * HALF_W, (u + v) * HALF_H];
}

/**
 * Draw speckle texture of given colours.
 * @param {CanvasRenderingContext2D} ctx
 * @param {()=>number} r
 * @param {string[]} colours
 * @param {number} count
 * @param {number} size
 */
function speckle(ctx, r, colours, count, size) {
  for (let i = 0; i < count; i++) {
    const [x, y] = randPoint(r);
    ctx.fillStyle = colours[i % colours.length];
    ctx.fillRect(x, y, size * (0.6 + r()), size * 0.6);
  }
}

/** @type {Record<string,(ctx:CanvasRenderingContext2D, r:()=>number, base:string)=>void>} */
const DECOR = {
  grass(ctx, r, base) {
    speckle(ctx, r, [shade(base, 1.15), shade(base, 0.85), shade(base, 1.25)], 70, 1.2);
    if (r() < 0.5) {
      for (let i = 0; i < 3; i++) {
        const [x, y] = randPoint(r, 0.15);
        ctx.fillStyle = ['#f5e663', '#ffffff', '#e879f9'][i % 3];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },
  forest(ctx, r, base) {
    speckle(ctx, r, [shade(base, 0.8), shade(base, 1.1), '#5b4a2a'], 80, 1.3);
  },
  desert(ctx, r, base) {
    speckle(ctx, r, [shade(base, 1.08), shade(base, 0.9)], 60, 1);
    ctx.strokeStyle = shade(base, 0.88);
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      const [x, y] = randPoint(r, 0.2);
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.quadraticCurveTo(x, y - 2, x + 6, y);
      ctx.stroke();
    }
  },
  rock(ctx, r, base) {
    speckle(ctx, r, [shade(base, 1.15), shade(base, 0.8)], 50, 1.2);
    for (let i = 0; i < 6; i++) {
      const [x, y] = randPoint(r, 0.15);
      const s = 1.5 + r() * 2.5;
      ctx.fillStyle = shade(base, 0.7);
      ctx.beginPath();
      ctx.ellipse(x + 0.6, y + 0.6, s, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(base, 1.1);
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  snow(ctx, r, base) {
    speckle(ctx, r, ['#ffffff', shade(base, 0.92), '#d6e4f0'], 50, 1.2);
  },
};

/**
 * Tile top sprite for a land terrain kind.
 * @param {string} kind
 * @param {number} variant 0..TERRAIN_VARIANTS-1
 * @returns {import('./canvas.js').Sprite}
 */
export function terrainTop(kind, variant) {
  return cache.get(`t:${kind}:${variant}`, () => makeSprite(TILE_W, TILE_H, HALF_W, HALF_H, (ctx) => {
    const cols = TERRAIN[kind] || TERRAIN.grass;
    const base = cols[variant % cols.length];
    const r = texRng(variant * 31 + kind.length * 7 + 1);
    diamondPath(ctx, -0.6);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    diamondPath(ctx);
    ctx.clip();
    (DECOR[kind] || DECOR.grass)(ctx, r, base);
    ctx.restore();
    // subtle edge lighting: north edges lighter, south edges darker
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(-HALF_W, 0); ctx.lineTo(0, -HALF_H); ctx.lineTo(HALF_W, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.beginPath(); ctx.moveTo(-HALF_W, 0); ctx.lineTo(0, HALF_H); ctx.lineTo(HALF_W, 0); ctx.stroke();
  }));
}

/**
 * Animated water tile sprite.
 * @param {number} frame 0..WATER_FRAMES-1
 * @param {number} variant
 * @returns {import('./canvas.js').Sprite}
 */
export function waterTop(frame, variant) {
  return cache.get(`w:${frame}:${variant}`, () => makeSprite(TILE_W, TILE_H, HALF_W, HALF_H, (ctx) => {
    const base = TERRAIN.water[variant % TERRAIN.water.length];
    diamondPath(ctx, -0.6);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.save();
    diamondPath(ctx);
    ctx.clip();
    const r = texRng(variant * 13 + 5);
    const phase = (frame / WATER_FRAMES) * Math.PI * 2;
    for (let i = 0; i < 9; i++) {
      const [x, y] = randPoint(r, 0.1);
      const a = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(phase + i * 1.7));
      ctx.strokeStyle = `rgba(200,230,255,${a.toFixed(3)})`;
      ctx.lineWidth = 0.8;
      const dx = Math.sin(phase + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 4 + dx, y);
      ctx.quadraticCurveTo(x + dx, y - 1.2, x + 4 + dx, y);
      ctx.stroke();
    }
    // shimmer sparkles (OpenTTD-style): a few pixels per tile, each on its own phase, deterministic
    const sr = texRng(variant * 29 + 11);
    for (let i = 0; i < 4; i++) {
      const [x, y] = randPoint(sr, 0.14);
      const ph = (frame / WATER_FRAMES) * Math.PI * 2 + i * 2.1 + variant;
      const a = Math.max(0, Math.sin(ph)) ** 3 * 0.9;
      if (a < 0.05) continue;
      ctx.fillStyle = `rgba(240,250,255,${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1.2, 1.2);
    }
    ctx.restore();
  }));
}

/**
 * Cliff side face sprite hanging below a raised tile edge.
 * side 'sw' = edge toward y+1 (screen lower-left), 'se' = edge toward x+1 (screen lower-right).
 * Anchor = tile centre at the tile's own height.
 * @param {string} kind terrain kind
 * @param {'sw'|'se'} side
 * @param {number} levels height difference (>=1)
 * @returns {import('./canvas.js').Sprite}
 */
export function cliffFace(kind, side, levels) {
  return cache.get(`f:${kind}:${side}:${levels}`, () => {
    const dz = levels * HEIGHT_STEP;
    return makeSprite(TILE_W, TILE_H + dz, HALF_W, HALF_H, (ctx) => {
      const cols = FACES[kind] || FACES.grass;
      ctx.beginPath();
      if (side === 'sw') {
        ctx.moveTo(-HALF_W, 0); ctx.lineTo(0, HALF_H); ctx.lineTo(0, HALF_H + dz); ctx.lineTo(-HALF_W, dz);
        ctx.fillStyle = cols[0];
      } else {
        ctx.moveTo(0, HALF_H); ctx.lineTo(HALF_W, 0); ctx.lineTo(HALF_W, dz); ctx.lineTo(0, HALF_H + dz);
        ctx.fillStyle = cols[1];
      }
      ctx.closePath();
      ctx.fill();
      // strata lines
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 0.6;
      for (let l = 1; l < levels; l++) {
        const y = l * HEIGHT_STEP;
        ctx.beginPath();
        if (side === 'sw') { ctx.moveTo(-HALF_W, y); ctx.lineTo(0, HALF_H + y); }
        else { ctx.moveTo(0, HALF_H + y); ctx.lineTo(HALF_W, y); }
        ctx.stroke();
      }
      // grass lip on top edge
      if (kind === 'grass' || kind === 'forest') {
        ctx.strokeStyle = shade(TERRAIN.grass[0], 0.8);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (side === 'sw') { ctx.moveTo(-HALF_W, 0.6); ctx.lineTo(0, HALF_H + 0.6); }
        else { ctx.moveTo(0, HALF_H + 0.6); ctx.lineTo(HALF_W, 0.6); }
        ctx.stroke();
      }
    });
  });
}

/**
 * Cluster of trees for a forest tile (object layer; depth-sorted).
 * @param {number} variant
 * @param {boolean} [snowy] snow-dusted conifers
 * @returns {import('./canvas.js').Sprite}
 */
export function treeCluster(variant, snowy = false) {
  return cache.get(`tr:${variant}:${snowy ? 1 : 0}`, () => makeSprite(TILE_W, TILE_H + 40, HALF_W, HALF_H + 40, (ctx) => {
    const r = texRng(variant * 97 + 3);
    const n = 5 + Math.floor(r() * 4);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([(r() - 0.5) * 0.75, (r() - 0.5) * 0.75, r()]);
    pts.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [u, v, k] of pts) {
      const conifer = snowy || k < 0.5;
      const col = snowy ? '#2f5a3a' : conifer ? '#2f6b2a' : ['#4e8f2f', '#5a9a34', '#3f7f2a'][Math.floor(k * 3) % 3];
      tree(ctx, u, v, 0.75 + k * 0.45, col, conifer);
    }
  }));
}

/** Drop all cached terrain sprites. */
export function clearTerrainCache() {
  cache.clear();
}
