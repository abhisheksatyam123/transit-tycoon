/** Group B style helpers: Stalinist cream stone and gold spires (photo-checked against Wikimedia refs). */
import { colour } from '../s3db.js';

/** Cream/beige stone for every part without an OSM colour; roof tops darkened (green-grey copper/tin). */
export const stStone = (wall = '#e6d8b8', roof = '#6f7d7a') => (B) => {
  for (const b of B) {
    if (!b.tags || !b.tags['building:colour']) b.spec.wall = colour(wall);
    if (!b.tags || !b.tags['roof:colour']) b.spec.roof = colour(roof);
  }
};

/** Gold-leaf tip for thin spires (height < 15 m tall tower parts stay stone; tall narrow tops get gold). */
export const stGoldTop = (B) => {
  for (const b of B) if (b.area < 60 && b.spec.top - b.spec.minH > 60) b.spec.roof = colour('#c9a54a');
};

/** Real spire height (Wikipedia) where OSM stops short: stretch the pyramidal spire part `id` to `top` metres and gild it. */
export const spireTo = (id, top) => (B) => {
  for (const b of B) if (b.id === id) { b.spec.roofH += top - b.spec.top; b.spec.top = top; b.spec.roof = colour('#c9a54a'); }
};

/**
 * Stepped crown + gilded spire on top of part `id` where OSM has no upper tiers (e.g. Kotelnicheskaya: OSM ends at
 * 102.4 m, real 176 m). tiers: [[height m, scale of the part's footprint]..]; the spire rises to `top`.
 */
export const crownOn = (id, tiers, top, wall = '#e6d8b8') => (B) => {
  const base = B.find((b) => b.id === id); if (!base) return;
  const r = base.poly.outer[0], c = base.c;
  const ring = (k) => r.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k]);
  let z = base.spec.top;
  for (const [h, k] of tiers) {
    B.push({ id: id + '+t', tags: {}, poly: { outer: [ring(k)], inner: [] }, c, area: base.area * k * k,
      spec: { ...base.spec, minH: z, wallH: z + h, top: z + h, roofH: 0, shape: 'flat', wall: colour(wall), win: true, pattern: null } });
    z += h;
  }
  const k = tiers.length ? tiers[tiers.length - 1][1] * 0.45 : 0.3;
  B.push({ id: id + '+s', tags: {}, poly: { outer: [ring(k)], inner: [] }, c, area: base.area * k * k,
    spec: { ...base.spec, minH: z, wallH: z, top, roofH: top - z, shape: 'pyramidal', wall: colour(wall), roof: colour('#c9a54a'), win: false, pattern: null } });
};
