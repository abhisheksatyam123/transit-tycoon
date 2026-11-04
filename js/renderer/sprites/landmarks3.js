/**
 * Landmark drawings, part 3: Seven Sisters Stalinist skyscrapers (wedding-cake tiers, central
 * spire with star), GUM arcade, Shukhov radio tower and Novodevichy Convent. Each entry:
 * { tall, draw(ctx, w, h) } in footprint-centred tile space (same as landmarks2.js).
 */
import { box, cylinder, poly } from './shapes.js';
import { shade } from '../palette.js';
import { star, dome, floors, GOLD } from './landmarkParts.js';

const STONE = '#e6dccb';
const STONE_DARK = '#a79a85';
const RED = '#dc2626';

/**
 * Stalinist skyscraper: stepped tiers with pilasters, a crown, and a tall spire with star.
 * @param {object} o { scale, tiers, base, spire, wings }
 */
function stalinSkyscraper(ctx, o) {
  const s = o.scale ?? 1;
  let z = o.base ?? 14;
  let r = 0.46 * s;
  box(ctx, -r, -r, r, r, 0, z, STONE);
  floors(ctx, -r, -r, r, r, 0, z, 6, STONE_DARK);
  for (let i = 0; i < o.tiers; i++) {
    r *= 0.8;
    const h = 16 + (i % 2) * 6;
    box(ctx, -r, -r, r, r, z, z + h, STONE);
    floors(ctx, -r, -r, r, r, z, z + h, 5, STONE_DARK);
    // cornice band at the top of each tier
    box(ctx, -r - 0.03, -r - 0.03, r + 0.03, r + 0.03, z + h, z + h + 2, shade(STONE, 1.05));
    z += h + 2;
  }
  // crown tier and tall spire with a red star
  const cr = r * 0.6;
  box(ctx, -cr, -cr, cr, cr, z, z + 10, STONE);
  box(ctx, -cr * 0.5, -cr * 0.5, cr * 0.5, cr * 0.5, z + 10, z + 22, STONE);
  const top = z + 22;
  const sp = o.spire ?? 48;
  poly(ctx, [-0.06, -0.06, top, 0.06, -0.06, top, 0, 0, top + sp], shade('#d4c39e', 0.9));
  poly(ctx, [0.06, -0.06, top, 0.06, 0.06, top, 0, 0, top + sp], shade('#d4c39e', 0.7));
  cylinder(ctx, 0, 0, 0.05, top + sp - 8, top + sp, GOLD, 0.02);
  star(ctx, 0, 0, top + sp + 4, 6, RED);
  if (o.wings) {
    for (const side of [-1, 1]) {
      const wu = side * 0.55 * s;
      box(ctx, wu - 0.1, -0.1, wu + 0.1, 0.1, 0, 26, STONE);
      floors(ctx, wu - 0.1, -0.1, wu + 0.1, 0.1, 0, 26, 6, STONE_DARK);
    }
  }
  return top;
}

/** Hotel Ukraina: tall stepped tower with a wide base and spire. */
const ukraina = (ctx) => stalinSkyscraper(ctx, { scale: 1, tiers: 3, base: 16, spire: 56, wings: false });
const kotel = (ctx) => stalinSkyscraper(ctx, { scale: 1, tiers: 2, base: 14, spire: 44, wings: false });
const kudrinskaya = (ctx) => stalinSkyscraper(ctx, { scale: 0.95, tiers: 3, base: 10, spire: 40, wings: false });
const mid = (ctx) => stalinSkyscraper(ctx, { scale: 0.9, tiers: 2, base: 10, spire: 44, wings: false });
const leningradskaya = (ctx) => stalinSkyscraper(ctx, { scale: 0.85, tiers: 3, base: 12, spire: 60, wings: false });
const redGates = (ctx) => stalinSkyscraper(ctx, { scale: 0.95, tiers: 2, base: 12, spire: 36, wings: false });

/** GUM: long glass-roofed arcade with white arches and a cream facade. */
function gum(ctx) {
  box(ctx, -0.9, -0.42, 0.9, 0.42, 0, 16, '#f3eee3');
  floors(ctx, -0.9, -0.42, 0.9, 0.42, 0, 16, 5, '#c9bfa8');
  for (let u = -0.7; u <= 0.7; u += 0.35) box(ctx, u - 0.03, -0.43, u + 0.03, -0.42, 2, 14, '#d8cfbc');
  // glass roof over the arcade
  poly(ctx, [-0.8, -0.3, 16, 0.8, -0.3, 16, 0.8, 0.3, 16, -0.8, 0.3, 16], '#9bb9c9');
  poly(ctx, [-0.8, -0.3, 16, 0.8, -0.3, 16, 0, 0, 24], '#bcd6e2');
  box(ctx, -0.5, -0.42, 0.5, -0.4, 2, 8, '#e8f0f5');
}

/** Shukhov Tower: cone-like hyperboloid lattice, tall and slender. */
function shukhov(ctx) {
  for (let i = 0; i < 4; i++) {
    const z0 = i * 56, z1 = z0 + 56;
    const r0 = 0.16 - i * 0.02, r1 = 0.16 - (i + 1) * 0.02 + 0.02;
    cylinder(ctx, 0, 0, Math.max(0.03, r0), z0, z1, '#64748b', Math.max(0.03, r1));
  }
  cylinder(ctx, 0, 0, 0.04, 220, 232, '#e5e7eb', 0.03);
  box(ctx, -0.02, -0.02, 0.02, 0.02, 232, 236, RED);
}

/** Novodevichy Convent: white walls with a bell tower and onion domes. */
function novodevichy(ctx) {
  box(ctx, -0.75, -0.7, 0.75, 0.7, 0, 9, '#f1f5f9', '#e2e8f0');
  box(ctx, -0.75, -0.7, 0.75, 0.7, 9, 11, '#c9b99a');
  // square bell tower with dome at the north-west corner
  box(ctx, -0.6, -0.6, -0.3, -0.3, 0, 36, '#f5f5f4');
  dome(ctx, -0.45, -0.45, 36, 0.14, 16, '#16a34a');
  // cathedral with five golden domes in the middle
  box(ctx, 0.0, -0.2, 0.4, 0.2, 0, 22, '#f5f5f4');
  dome(ctx, 0.2, 0.0, 22, 0.1, 14, GOLD);
  dome(ctx, 0.05, -0.12, 22, 0.06, 10, '#2563eb');
}

const ENTRIES = {
  ukraina: { tall: 190, draw: ukraina },
  kotelnicheskaya: { tall: 170, draw: kotel },
  kudrinskaya: { tall: 160, draw: kudrinskaya },
  mid: { tall: 170, draw: mid },
  leningradskaya: { tall: 200, draw: leningradskaya },
  red_gates: { tall: 160, draw: redGates },
  gum: { tall: 40, draw: gum },
  shukhov_tower: { tall: 240, draw: shukhov },
  novodevichy: { tall: 60, draw: novodevichy },
};

/** Extras for the part-3 landmark ids (null for others). */
export function landmarkExtras3(id) {
  const e = ENTRIES[id];
  return e ? { tall: e.tall, draw: (ctx) => e.draw(ctx) } : null;
}

