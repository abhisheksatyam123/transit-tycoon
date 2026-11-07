/**
 * Rail waypoint marker (procedural: no OpenGFX waypoint sprite in the atlas). A short yellow post with a
 * black cap sits on the rail; same sprite conventions as the other procedural sprites (SpriteCache, makeSprite).
 */
import { makeSprite, SpriteCache } from './canvas.js';
import { TILE_W, TILE_H, HALF_W, HALF_H } from '../iso.js';
import { box } from './shapes.js';

const cache = new SpriteCache();

/** Waypoint marker drawn over a rail tile: a post on the tile centre, stands up to z=9. */
export function waypointSprite() {
  return cache.get('waypoint', () => makeSprite(TILE_W, TILE_H + 20, HALF_W, HALF_H + 20, (ctx) => {
    box(ctx, -0.07, -0.07, 0.07, 0.07, 0, 9, '#facc15', '#fde68a');
    box(ctx, -0.09, -0.09, 0.09, 0.09, 9, 11, '#111827', '#374151');
  }));
}
