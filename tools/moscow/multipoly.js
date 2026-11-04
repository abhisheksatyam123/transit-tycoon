/**
 * Polygon sources for area layers: closed ways and multipolygon relations (outer rings assembled
 * from member ways, inner rings as holes). Works on Overpass `out geom` JSON.
 */
import { tag } from './io.js';
import { WIDTH, HEIGHT } from './proj.js';
import { ringF, fillRing } from './raster.js';

const same = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;

/**
 * Join way segments into rings by matching endpoints (segments reversed as needed).
 * Unclosed chains with >= 3 points are kept (treated as implicitly closed).
 * @param {Array<Array<{lat:number,lon:number}>>} segs
 * @returns {Array<Array<{lat:number,lon:number}>>}
 */
export function assembleRings(segs) {
  const left = segs.filter((s) => s && s.length > 1).map((s) => s.slice());
  const rings = [];
  while (left.length) {
    let ring = left.shift();
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      const end = ring[ring.length - 1];
      for (let k = 0; k < left.length; k++) {
        const s = left[k];
        if (same(s[0], end)) ring = ring.concat(s.slice(1));
        else if (same(s[s.length - 1], end)) ring = ring.concat(s.slice(0, -1).reverse());
        else continue;
        left.splice(k, 1); grew = true; break;
      }
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}

/**
 * Area polygons in a layer: closed ways (one outer ring) and multipolygon / boundary relations.
 * @param {Array<object>|null} els
 * @returns {Array<{el:object, outer:Array<Array<{lat,lon}>>, inner:Array<Array<{lat,lon}>>}>}
 */
export function polygonsOf(els) {
  const out = [];
  for (const e of els || []) {
    if (e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length > 3
      && same(e.geometry[0], e.geometry[e.geometry.length - 1])) {
      out.push({ el: e, outer: [e.geometry], inner: [] });
    } else if (e.type === 'relation' && Array.isArray(e.members)) {
      const ways = e.members.filter((m) => m.type === 'way' && Array.isArray(m.geometry));
      const outer = assembleRings(ways.filter((m) => m.role !== 'inner').map((m) => m.geometry));
      const inner = assembleRings(ways.filter((m) => m.role === 'inner').map((m) => m.geometry));
      if (outer.length) out.push({ el: e, outer, inner });
    }
  }
  return out;
}

/**
 * Rasterise one polygon (outer rings minus inner holes) into a fresh mask.
 * @returns {{mask:Uint8Array, n:number}}
 */
export function polygonMask(poly) {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  let n = 0;
  for (const r of poly.outer) n += fillRing(mask, ringF(r), 1);
  if (!n) return { mask, n };
  const hole = new Uint8Array(WIDTH * HEIGHT);
  for (const r of poly.inner) fillRing(hole, ringF(r), 1);
  for (let t = 0; t < mask.length; t++) if (hole[t] && mask[t]) { mask[t] = 0; n--; }
  return { mask, n };
}

/** Tag lookup helper re-exported for area classifiers. */
export { tag };
