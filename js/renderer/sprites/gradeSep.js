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
    drawRails(ctx, railMask, true, false, true);
    // road deck: same surface as an ordinary road, raised DECK px with parapets (V_SEP)
    ctx.save();
    ctx.translate(0, -DECK);
    drawRoad(ctx, roadMask, true, cls, V_SEP);
    ctx.restore();
    // no posts/fences: the deck sits on its parapets, the rail runs straight through beneath it
  }));
}
