/**
 * Bake OSM 3D landmark ensembles to isometric pixel sprites.
 *   bun tools/lm3d/bake.js [id]
 * Reads scratchpad/osm3d/raw/<src>.json (Overpass `out geom`, ODbL), writes assets/landmarks/<id>@<z>.png
 * (z = 1, 2, 4) and js/config/landmarks3d.js (footprint tiles, front tile, sprite placement per level).
 * World-screen placement: (wx, wy) = zoom-1 world px of the image's top-left (tile (0,0) centre = origin, height 0).
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { loadBuildings, loadGround, loadStreets, toM, inRing } from './osm.js';
import { partFaces, centroid, ringArea } from './roofs.js';
import { render } from './raster.js';
import { encodeRGBA } from './png.js';
import { ENSEMBLES } from './ensembles.js';
import { baseStyle } from './styles.js';
import { colour } from './s3db.js';
import { TILE_M } from '../moscow/proj.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const RAW = ROOT + '../scratchpad/osm3d/raw/';
const ZOOMS = [1, 2, 4];
/**
 * Uniform landmark scale (x, y and z alike, so proportions stay photo-true). The game's OpenTTD-style houses,
 * roads and vehicles are drawn ~5-10x larger than reality; true-scale monuments looked like miniatures beside
 * them, so ensembles are enlarged 2x about their anchor (a point that should stay put, e.g. a river-side wall).
 */
export const LM_SCALE = 2;
let BLOCKED = new Set();
const GROUND = { paving: colour('#b3a898'), paved: colour('#9d9284'), cobble: colour('#8a8078'), grass: colour('#6a9e48'), pitch: colour('#4f9a3e'), asphalt: colour('#5e5e62') };

function selRing(sel) {
  if (sel.poly) return sel.poly.map(([la, lo]) => toM(la, lo));
  const [la, lo, r] = sel.circle; const c = toM(la, lo);
  return Array.from({ length: 32 }, (_, i) => [c[0] + r * Math.cos((i / 32) * 2 * Math.PI), c[1] + r * Math.sin((i / 32) * 2 * Math.PI)]);
}

/** Tiles (integer tile coords) at least `frac` covered by the ring (4x4 samples). */
function footprint(ring, frac = 0.35) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of ring) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const tiles = [];
  for (let ty = Math.floor(y0 / TILE_M - 0.5); ty <= Math.ceil(y1 / TILE_M + 0.5); ty++) for (let tx = Math.floor(x0 / TILE_M - 0.5); tx <= Math.ceil(x1 / TILE_M + 0.5); tx++) {
    let n = 0;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inRing([(tx - 0.5 + (i + 0.5) / 4) * TILE_M, (ty - 0.5 + (j + 0.5) / 4) * TILE_M], ring)) n++;
    if (n / 16 >= frac) tiles.push([tx, ty]);
  }
  return tiles;
}

/** Deterministic hash in [0,1). */
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const TREE = [[0.35, 0], [0.85, 0.18], [1, 0.42], [0.9, 0.66], [0.6, 0.86], [0, 1]];
/** Park trees: lathe crowns on a jittered grid inside park polygons, away from buildings. */
function treeFaces(parks, B, step) {
  const out = []; const cells = new Map(); const key = (x, y) => Math.floor(x / 20) + ',' + Math.floor(y / 20);
  for (const b of B) { const k = key(b.c[0], b.c[1]); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(b.poly.outer[0]); }
  const blocked = (p) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = cells.get((Math.floor(p[0] / 20) + dx) + ',' + (Math.floor(p[1] / 20) + dy)); if (l && l.some((r) => inRing(p, r) || r.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 4))) return true; } return false; };
  for (const g of parks) {
    const r = g.poly.outer[0]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of r) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0 / step) * step; y < y1; y += step) for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
      const hx = hash(x, y), hy = hash(y + 7, x - 3);
      if (hx < 0.18) continue;
      const p = [x + (hx - 0.5) * step * 0.8, y + (hy - 0.5) * step * 0.8];
      if (!inRing(p, r) || g.poly.inner.some((h) => inRing(p, h)) || blocked(p)) continue;
      const rad = 2.6 + hx * 1.8, ht = 9 + hy * 8, base = 2.2;
      const ring8 = Array.from({ length: 8 }, (_, i) => [p[0] + rad * Math.cos(i * Math.PI / 4), p[1] + rad * Math.sin(i * Math.PI / 4)]);
      const col = colour(['#2f6b2f', '#3b7a35', '#2a5f33', '#457f3a'][Math.floor(hy * 4)]);
      const rings = TREE.map(([sc, f]) => ring8.map((q) => [p[0] + (q[0] - p[0]) * sc, p[1] + (q[1] - p[1]) * sc, base + (ht - base) * f]));
      for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8; const A = rings[k], Bq = rings[k + 1];
        out.push({ pts: TREE[k + 1][0] === 0 ? [A[i], A[j], Bq[i]] : [A[i], A[j], Bq[j], Bq[i]], col, kind: 'tree' });
      }
    }
  }
  return out;
}

export function bakeOne(E) {
  const src = E.src ? RAW + E.src + '.json' : null;
  const ring = selRing(E.sel);
  let B = (src ? loadBuildings(src) : []).map((b) => ({ ...b, c: centroid(b.poly.outer[0]), area: ringArea(b.poly.outer[0]) }));
  B = B.filter((b) => inRing(b.c, ring));
  B = B.filter((b) => !(b.area < 1.5 && b.spec.top - b.spec.minH > 25)); // stray needles (flag poles / tagging errors)
  for (const b of B) baseStyle(b);
  for (const st of E.styles || []) st(B);
  for (const ov of E.overrides || []) ov(B);
  const faces = [];
  for (const b of B) faces.push(...partFaces(b.poly, b.spec));
  for (const f of E.extraFaces ? E.extraFaces(toM) : []) faces.push(f);
  // ground: footprint tile squares (base) + OSM parks/squares inside the selection
  const k = E.scale ?? LM_SCALE;
  const anc = E.anchor ? toM(E.anchor[0], E.anchor[1]) : centroid(ring);
  const S = (p) => [anc[0] + (p[0] - anc[0]) * k, anc[1] + (p[1] - anc[1]) * k, (p[2] || 0) * k];
  for (const f of faces) { f.pts = f.pts.map(S); if (f.holes) f.holes = f.holes.map((r) => r.map(S)); }
  const sring = ring.map((p) => S(p).slice(0, 2));
  let tiles = footprint(sring, E.frac ?? 0.35).filter((t) => !BLOCKED.has(t.join(',')));
  if (!tiles.length) { // small monuments: the anchor tile, else the nearest free neighbour
    const tx = Math.round(anc[0] / TILE_M), ty = Math.round(anc[1] / TILE_M);
    const cand = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cand.push([tx + dx, ty + dy]);
    cand.sort((a, b) => Math.hypot(a[0] * TILE_M - anc[0], a[1] * TILE_M - anc[1]) - Math.hypot(b[0] * TILE_M - anc[0], b[1] * TILE_M - anc[1]));
    const t = cand.find((c) => !BLOCKED.has(c.join(','))); if (t) tiles = [t];
  }
  const tset = new Set(tiles.map((t) => t.join(',')));
  const gcol = GROUND[E.ground || 'paved'];
  if (E.ground !== 'none') for (const [tx, ty] of tiles) {
    const a = (tx - 0.5) * TILE_M, b = (ty - 0.5) * TILE_M, c = (tx + 0.5) * TILE_M, d = (ty + 0.5) * TILE_M;
    faces.push({ pts: [[a, b, 0], [c, b, 0], [c, d, 0], [a, d, 0]], col: gcol, kind: 'ground', bias: -3, light: 0.82 });
  }
  for (const g of src ? loadGround(src) : []) {
    if (g.kind === 'water' || !inRing(centroid(g.poly.outer[0]), ring)) continue;
    faces.push({ pts: g.poly.outer[0].map((p) => S([p[0], p[1], 0.05])), holes: g.poly.inner.map((r) => r.map((p) => S([p[0], p[1], 0.05]))), col: GROUND[g.kind], kind: 'ground', bias: -2, light: 0.82 });
  }
  if (E.trees && src) for (const f of treeFaces(loadGround(src).filter((g) => g.kind === 'grass' && g.tags && (g.tags.leisure || g.tags.natural === 'wood') && inRing(centroid(g.poly.outer[0]), ring)), B, E.treeStep || 11)) { const q = f.pts.map(S), mx = q.reduce((a, p) => a + p[0], 0) / q.length, my = q.reduce((a, p) => a + p[1], 0) / q.length; if (tset.has(Math.round(mx / TILE_M) + ',' + Math.round(my / TILE_M))) faces.push({ ...f, pts: q }); }
  if (E.streets !== false && src) for (const st of loadStreets(src)) {
    if (!st.pts.some((p) => inRing(p, ring))) continue;
    faces.push({ pts: st.pts.map((p) => S([p[0], p[1], st.kind === 'asphalt' ? 0.08 : 0.1])), col: GROUND[st.kind === 'asphalt' ? 'asphalt' : 'paving'], kind: 'ground', bias: -1.5, light: 0.85 });
  }
  const front = tiles.reduce((m, t) => (!m || t[0] + t[1] > m[0] + m[1] || (t[0] + t[1] === m[0] + m[1] && t[0] > m[0]) ? t : m), null);
  const levels = [];
  mkdirSync(ROOT + 'assets/landmarks', { recursive: true });
  for (const z of ZOOMS) {
    // two images per level: ground (flat, drawn under every object by the renderer) and the 3D objects
    const clip = (x, y) => tset.has(Math.round(x / TILE_M) + ',' + Math.round(y / TILE_M));
    const obj = faces.filter((f) => f.kind !== 'ground'), gnd = faces.filter((f) => f.kind === 'ground');
    const img = render(obj.length ? obj : [{ pts: [[anc[0], anc[1], 0], [anc[0] + 0.1, anc[1], 0], [anc[0], anc[1] + 0.1, 0]], col: [0, 0, 0], kind: 'model' }], z, { outline: true });
    const file = `assets/landmarks/${E.id}@${z}.png`;
    writeFileSync(ROOT + file, encodeRGBA(img.w, img.h, img.rgba));
    const lv = { z, file, w: img.w, h: img.h, wx: +(-img.ox / z).toFixed(3), wy: +(-img.oy / z).toFixed(3) };
    if (gnd.length) {
      const g = render(gnd, z, { outline: false, clip });
      lv.g = { file: `assets/landmarks/${E.id}_g@${z}.png`, w: g.w, h: g.h, wx: +(-g.ox / z).toFixed(3), wy: +(-g.oy / z).toFixed(3) };
      writeFileSync(ROOT + lv.g.file, encodeRGBA(g.w, g.h, g.rgba));
    }
    levels.push(lv);
  }
  console.log(`[lm3d] ${E.id}: ${B.length} parts, ${faces.length} faces, ${tiles.length} tiles, front ${front}, z4 ${levels[2].w}x${levels[2].h}`);
  return { id: E.id, title: E.title, covers: E.covers || [E.id], tiles, front, levels };
}

/** Tiles an ensemble must not own (water, stations/depots/industries) in the scenario world without ensembles. Roads under an ensemble are removed by the scenario. */
async function blockedTiles() {
  const cache = ROOT + 'tools/lm3d/.blocked.json';
  if (existsSync(cache) && !process.env.LM_REBLOCK) return new Set(JSON.parse(readFileSync(cache, 'utf8')));
  process.env.NO_LM3D = '1';
  const { Game } = await import('../../js/simulation/game.js');
  const m = Game.create({ scenario: 'moscow', seed: 1 }).state.map; const out = [];
  m.tiles.forEach((t, i) => { if (t.terrain === 'water' || (t.building && t.building.type !== 'house' && t.building.type !== 'landmark')) out.push((i % m.width) + ',' + Math.floor(i / m.width)); });
  delete process.env.NO_LM3D;
  writeFileSync(cache, JSON.stringify(out));
  return new Set(out);
}
BLOCKED = await blockedTiles();

const only = process.argv[2];
let done = false;
const OUT = ROOT + 'js/config/landmarks3d.js';
for (const E of ENSEMBLES) {
  if (only && E.id !== only) { // tiles of earlier ensembles are claimed (read their last bake)
    const f = ROOT + `assets/landmarks/${E.id}.json`;
    if (!done && existsSync(f)) for (const t of JSON.parse(readFileSync(f, 'utf8')).tiles) BLOCKED.add(t.join(','));
    continue;
  }
  const r = bakeOne(E);
  writeFileSync(ROOT + `assets/landmarks/${E.id}.json`, JSON.stringify(r));
  for (const t of r.tiles) BLOCKED.add(t.join(','));
  if (only) done = true;
}
// regenerate the config from every baked ensemble (per-id JSON files, so parallel bakes of different ids are safe)
const data = {};
for (const E of ENSEMBLES) { const f = ROOT + `assets/landmarks/${E.id}.json`; if (existsSync(f)) data[E.id] = JSON.parse(readFileSync(f, 'utf8')); }
writeFileSync(OUT, `/**\n * Baked OSM 3D landmark ensembles (generated by tools/lm3d/bake.js; geometry (c) OpenStreetMap contributors, ODbL).\n * tiles: footprint tile coords; front: tile that draws the sprite; levels: sprite per zoom with zoom-1 world-px top-left.\n */\nexport const LM3D = ${JSON.stringify(data)};\n`);
console.log('[lm3d] wrote', OUT, Object.keys(data).join(','));
