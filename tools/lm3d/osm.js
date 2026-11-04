/**
 * Load an Overpass `out geom` JSON and turn buildings / building:parts into single-outer polygons in metres
 * (x = east, y = south, absolute: tile coords * 200 using tools/moscow/proj.js projectF).
 */
import { readFileSync } from 'node:fs';
import { projectF, TILE_M } from '../moscow/proj.js';
import { polygonsOf } from '../moscow/multipoly.js';
import { partSpec } from './s3db.js';
import { centroid, ringArea } from './roofs.js';

export const toM = (lat, lon) => { const f = projectF(lat, lon); return [f.x * TILE_M, f.y * TILE_M]; };
const ringM = (r) => { const q = r.map((p) => toM(p.lat, p.lon)); if (q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop(); return q; };
export function inRing(p, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
/** Split a polygon with several outers into single-outer polygons (holes assigned by containment). */
function split(poly) {
  const outers = poly.outer.map(ringM).filter((r) => r.length >= 3), inners = poly.inner.map(ringM).filter((r) => r.length >= 3);
  return outers.map((o) => ({ outer: [o], inner: inners.filter((h) => inRing(h[0], o)) }));
}

/**
 * Buildings to draw: building:part polygons + building outlines that contain no part (S3DB rule).
 * @returns {{tags:object, poly:{outer:number[][][],inner:number[][][]}, spec:object, id:string}[]}
 */
export function loadBuildings(path) {
  const els = JSON.parse(readFileSync(path, 'utf8')).elements;
  const polys = polygonsOf(els);
  const parts = [], blds = [];
  for (const p of polys) {
    const t = p.el.tags || {};
    if (t.location === 'underground' || (+t.layer < 0 && !t.height) || t['building:part'] === 'no') continue;
    const isPart = t['building:part'] && t['building:part'] !== 'no';
    if (!isPart && !t.building) continue;
    for (const q of split(p)) (isPart ? parts : blds).push({ tags: t, poly: q, id: p.el.type[0] + p.el.id });
  }
  const partC = parts.map((p) => centroid(p.poly.outer[0]));
  const keep = blds.filter((b) => !partC.some((c) => inRing(c, b.poly.outer[0])));
  return [...parts, ...keep].map((b) => ({ ...b, spec: partSpec(b.tags) })).filter((b) => b.spec.top > b.spec.minH + 0.05 && ringArea(b.poly.outer[0]) > 0.5);
}

/** Ground areas (squares, paving, parks, water) as {kind, poly}. */
export function loadGround(path) {
  const els = JSON.parse(readFileSync(path, 'utf8')).elements;
  const out = [];
  for (const p of polygonsOf(els)) {
    const t = p.el.tags || {};
    let kind = null;
    if (t.natural === 'water') kind = 'water';
    else if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.natural === 'wood') kind = 'grass';
    else if (t.leisure === 'pitch' || t.leisure === 'stadium') kind = 'pitch';
    else if (t.place === 'square' || (t.highway === 'pedestrian' && t.area === 'yes') || t['area:highway'] === 'pedestrian' || t['area:highway'] === 'footway') kind = 'paving';
    else if (t['area:highway'] || t.amenity === 'parking') kind = 'asphalt';
    if (!kind) continue;
    for (const q of split(p)) out.push({ kind, poly: q, tags: t });
  }
  return out;
}
