/**
 * Curated colour/pattern overrides where OSM 3D data has no colours (photo-checked against Wikimedia
 * reference photos in scratchpad/osm3d/ref). Each style mutates part specs: b = {tags, spec, c:[x,y] centroid m, area}.
 */
import { toM } from './osm.js';
import { colour as C } from './s3db.js';

const BRICK = C('#b5523b'), WHITE = C('#ece8de'), GREEN = C('#3f7a4f'), GOLD = C('#e0b040');

/** Default: windows on sizeable plain building walls; warm plaster for uncoloured walls. */
export function baseStyle(b) {
  const t = b.tags, s = b.spec;
  const kind = t['building:part'] || t.building || '';
  const tall = s.top - s.minH;
  if (b.area >= 150 && tall >= 7 && !s.glass && !['wall', 'tower', 'column', 'roof', 'dome', 'merlon', 'church', 'cathedral', 'chapel', 'steps', 'stylobate', 'stylobate2', 'abacus', 'echinus', 'base', 'basement'].includes(kind)) s.win = true;
}

/** Saint Basil's Cathedral: red brick body, white trim, green lower roofs, 8 striped onion domes, central tent. */
export function stBasil(B) {
  const ctr = toM(55.75248, 37.62302);
  const mine = B.filter((b) => Math.hypot(b.c[0] - ctr[0], b.c[1] - ctr[1]) < 34);
  // dome slices: thin uncoloured discs high up
  const slices = mine.filter((b) => !b.tags['building:colour'] && b.spec.top - b.spec.minH <= 1.05 && b.spec.minH >= 21);
  const clusters = [];
  for (const b of slices) {
    let k = clusters.find((q) => Math.hypot(q.c[0] - b.c[0], q.c[1] - b.c[1]) < 2.6);
    if (!k) { k = { c: b.c.slice(), list: [] }; clusters.push(k); }
    k.list.push(b);
  }
  const SCHEME = { // by compass direction of the dome from the cathedral centre (photo: view from the north)
    N: { type: 'spiral', cols: [C('#2e5ca8'), C('#eeece6')], n: 10, rate: 0.09 },
    W: { type: 'spiral', cols: [C('#3d7a45'), C('#e6dca4')], n: 10, rate: 0.09 },
    E: { type: 'checker', cols: [C('#b8382b'), C('#3f7a4f')], n: 12, dz: 0.5 },
    S: { type: 'spiral', cols: [C('#d9a838'), C('#3f7a4f')], n: 10, rate: 0.09 },
    NE: { type: 'checker', cols: [C('#d8b244'), C('#4f8a50')], n: 10, dz: 0.5 },
    NW: { type: 'spiral', cols: [C('#2f6a9a'), C('#e8e6dc'), C('#3f7a4f')], n: 9, rate: 0.1 },
    SE: { type: 'checker', cols: [C('#b8382b'), C('#e3c050')], n: 10, dz: 0.5 },
    SW: { type: 'spiral', cols: [C('#3d7a45'), C('#eeece6')], n: 10, rate: 0.09 },
    C: { type: 'checker', cols: [C('#c96a4c'), C('#ece2c8'), C('#3f7a4f')], n: 12, dz: 1.2 },
  };
  for (const k of clusters) {
    const dx = k.c[0] - ctr[0], dy = k.c[1] - ctr[1];
    let dir = 'C';
    if (Math.hypot(dx, dy) > 4) { const a = (Math.atan2(dx, -dy) * 180) / Math.PI; const i = Math.round(((a + 360) % 360) / 45) % 8; dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][i]; }
    for (const b of k.list) { b.spec.pattern = { ...SCHEME[dir], walls: true, c: k.c }; b.spec.wall = SCHEME[dir].cols[0]; }
  }
  for (const b of mine) {
    if (b.spec.pattern) continue;
    if (!b.tags['building:colour']) b.spec.wall = b.spec.top - b.spec.minH < 1.2 && b.spec.minH > 8 ? WHITE : BRICK;
    if (!b.tags['roof:colour'] && b.spec.shape !== 'flat') b.spec.roof = b.spec.minH > 30 ? GOLD : GREEN;
    if (!b.tags['roof:colour'] && b.spec.shape === 'flat') b.spec.roof = BRICK;
    b.spec.win = false;
  }
}

import { OUTLINES, inRing } from './osm.js';
/**
 * Colour overrides by OSM building id: parts whose centroid lies in the building outline get `wall` / `roof`
 * (only where OSM has no colour unless force). Photo-checked (Wikimedia refs).
 */
export function byBuilding(rules) {
  return (B) => {
    for (const r of rules) {
      const rings = OUTLINES.get(r.osm); if (!rings) { console.log('  [lm3d] override: no outline', r.osm); continue; }
      for (const b of B) {
        if (!rings.some((g) => inRing(b.c, g))) continue;
        if (r.wall && (r.force || !b.tags['building:colour'])) b.spec.wall = C(r.wall);
        if (r.roof && (r.force || !b.tags['roof:colour'])) b.spec.roof = C(r.roof);
        if (r.glassRound && b.spec.shape === 'round') b.spec.roof = C(r.glassRound);
        if (r.win === false) b.spec.win = false;
      }
    }
  };
}
