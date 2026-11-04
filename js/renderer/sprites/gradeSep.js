/**
 * Grade-separated road over railway (tile.gradeSep === 1): the rail is drawn at ground level and the
 * road deck is lifted a few px on the same tile, with thin parapets (from drawRoad's V_SEP) and
 * short dark support posts at the road's tile-edge ends. Replaces the flat slab with fences that the
 * level-crossing sprite gave these tiles.
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { P, quad } from './shapes.js';
import { drawRails, drawRoad } from './transport.js';
import { V_SEP } from './roadDiag.js';
import { EDGE, BITS } from './roadDiag.js';

const cache = new SpriteCache();
/** Deck lift in world z units (same scale as box heights). */
const DECK = 5;

/**
 * Grade-separated sprite for a road mask over a rail mask (cached).
 * @param {number} roadMask road mask (N|S or E|W, or a corner)
 * @param {number} railMask rail mask
 * @param {number} cls road class 0..3
 * @returns {HTMLCanvasElement}
 */
export function gradeSepSprite(roadMask, railMask, cls = 3) {
  return cache.get(`g:${roadMask}:${railMask}:${cls}`, () => makeSprite(TILE_W, TILE_H + 16, HALF_W, HALF_H + 16, (ctx) => {
    // railway at ground level, same drawing as the plain rail sprite
    drawRails(ctx, railMask, true, false);
    // road deck: same surface as an ordinary road, raised DECK px with parapets (V_SEP)
    ctx.save();
    ctx.translate(0, -DECK);
    drawRoad(ctx, roadMask, true, cls, V_SEP);
    ctx.restore();
    // supports: two thin posts under each road end that leaves the tile
    ctx.fillStyle = '#4b5563';
    for (const b of BITS) {
      if (!(roadMask & b)) continue;
      const [u, v] = EDGE[b];
      const [pu, pv] = u === 0 ? [1, 0] : [0, 1]; // edge-parallel offset
      for (const s of [-0.3, 0.3]) {
        const [px, py] = P(u * 0.85 + pu * s, v * 0.85 + pv * s, 0);
        ctx.fillRect(px - 1, py - DECK, 2, DECK);
      }
    }
  }));
}
