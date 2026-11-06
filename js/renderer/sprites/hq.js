/**
 * Company headquarters sprite (T31): a 2x2 office block in the company colours that grows one storey per level
 * (levels 0..4). Procedural, same box/poly helpers as the depot and landmark sprites; cached per level.
 */
import { footprintSprite } from './landmarks.js';
import { box, poly } from './shapes.js';
import { COMPANY } from '../palette.js';

const cache = new Map();

/**
 * @param {number} level 0..4 (clamped)
 * @returns {object} sprite (see makeSprite); anchor = footprint centre
 */
export function hqSprite(level) {
  const lv = Math.max(0, Math.min(4, level | 0));
  let s = cache.get(lv);
  if (!s) { s = buildHQ(lv); cache.set(lv, s); }
  return s;
}

function buildHQ(level) {
  const floors = 1 + level;
  const h = 10 + floors * 9; // storey height in px-ish units (tile space z)
  const tall = h + 14;
  return footprintSprite(2, 2, tall, (ctx) => {
    // plot
    poly(ctx, [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], '#c9c3b6');
    // body: glass-and-stone tower, company blue, lighter core on the front faces
    box(ctx, -0.8, -0.8, 0.8, 0.8, 0, h, COMPANY.primary, COMPANY.dark);
    // storey bands and windows on the two visible faces
    for (let f = 1; f <= floors; f++) {
      const z0 = (f - 1) * 9 + 3, z1 = z0 + 4;
      for (let i = 0; i < 3; i++) {
        const a = -0.6 + i * 0.5;
        poly(ctx, [a, 0.8, z0, a + 0.3, 0.8, z0, a + 0.3, 0.8, z1, a, 0.8, z1], '#fde68a');
        poly(ctx, [0.8, a, z0, 0.8, a + 0.3, z0, 0.8, a + 0.3, z1, 0.8, a, z1], '#fde68a');
      }
    }
    // roof sign in the company yellow
    poly(ctx, [-0.5, -0.2, h, 0.5, -0.2, h, 0.5, 0.2, h, -0.5, 0.2, h], COMPANY.secondary);
    if (level >= 3) poly(ctx, [-0.1, 0, h, 0.1, 0, h, 0.1, 0, h + 8, -0.1, 0, h + 8], '#e5e7eb');
  });
}
