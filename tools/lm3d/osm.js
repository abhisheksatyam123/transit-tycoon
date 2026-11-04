/**
 * Load an Overpass `out geom` JSON and turn buildings / building:parts into single-outer polygons in metres
 * (x = east, y = south, absolute: tile coords * 200 using tools/moscow/proj.js projectF).
 */
import { readFileSync, existsSync } from 'node:fs';
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

/** Building outlines by OSM id ('r51497', 'w123') from the last loadBuildings call (for overrides). */
export const OUTLINES = new Map();

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
    if (t.location === 'underground' || (+t.layer < 0 && !t.height)) continue;
    const isPart = t['building:part'] && t['building:part'] !== 'no';
    if (!isPart && !t.building) continue;
    for (const q of split(p)) (isPart ? parts : blds).push({ tags: t, poly: q, id: p.el.type[0] + p.el.id });
  }
  OUTLINES.clear();
  for (const b of blds) { if (!OUTLINES.has(b.id)) OUTLINES.set(b.id, []); OUTLINES.get(b.id).push(b.poly.outer[0]); }
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
    else if (t.place === 'square') kind = 'cobble';
    else if ((t.highway === 'pedestrian' && t.area === 'yes') || t['area:highway'] === 'pedestrian' || t['area:highway'] === 'footway') kind = 'paving';
    else if (t['area:highway'] || t.amenity === 'parking') kind = 'asphalt';
    if (!kind) continue;
    for (const q of split(p)) out.push({ kind, poly: q, tags: t });
  }
  return out;
}

const ROAD_W = { motorway: 20, trunk: 18, primary: 16, secondary: 13, tertiary: 11, residential: 8, unclassified: 8, living_street: 7, service: 5, pedestrian: 8, footway: 3.5, path: 3, cycleway: 3, steps: 3 };
/** Street centre lines as strip quads {kind:'asphalt'|'paving', pts:[[x,y]..4]} (bridges/tunnels skipped). */
export function loadStreets(path) {
  const els = JSON.parse(readFileSync(path, 'utf8')).elements; const out = [];
  for (const e of els) {
    const t = e.tags || {}; const w = ROAD_W[t.highway];
    if (e.type !== 'way' || !w || t.area === 'yes' || t.tunnel === 'yes' || t.bridge === 'yes' || +t.layer < 0 || !e.geometry) continue;
    const kind = ['pedestrian', 'footway', 'path', 'cycleway', 'steps'].includes(t.highway) ? 'paving' : 'asphalt';
    const P = e.geometry.map((g) => toM(g.lat, g.lon));
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.1) continue;
      const nx = (-(b[1] - a[1]) / l) * w / 2, ny = ((b[0] - a[0]) / l) * w / 2, ex = ((b[0] - a[0]) / l) * w / 4, ey = ((b[1] - a[1]) / l) * w / 4;
      out.push({ kind, w, pts: [[a[0] + nx - ex, a[1] + ny - ey], [b[0] + nx + ex, b[1] + ny + ey], [b[0] - nx + ex, b[1] - ny + ey], [a[0] - nx - ex, a[1] - ny - ey]] });
    }
  }
  return out;
}
