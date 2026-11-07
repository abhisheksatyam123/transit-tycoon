#!/usr/bin/env bun
/**
 * OpenGFX TOYLAND ground and house sprite extractor for the toyland climate (OpenTTD clear_cmd.cpp DrawClearLandTile,
 * town_land.h ClimateToyland 1x1 houses). Sources (OpenGFX sprites/toyland + base-4627-toyland-houses.pnml): groundtile
 * sets SPR 0 (bare 0%), 19 (bare 33%), 38 (bare 66%), 57 (grass), 86 (rough), 109 (rocky), each a 19-sprite group
 * (flat + 14 slopes + steep); the toyland house sprites 4629..4698 and their pavement ground 4675/4676.
 * Output: assets/opengfx/toyland/manifest.json + atlas0.png (keys = OpenGFX ids, same layout as the tropic pack).
 * Usage: bun tools/ogfx/extract_toyland.js [--src <ogfx src dir>] [--out assets/opengfx/toyland]
 * GPL-2.0 (OpenGFX).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';
import { readSpriteDefs } from './pnml.js';
import { TOYLAND_HOUSES, TOYLAND_INDUSTRY_GFX, TOYLAND_INDUSTRY_CHILDREN } from '../../js/renderer/pack/toyland_table.js';
import { TOYLAND_OVERRIDE_BLOCKS } from '../../js/renderer/pack/toyland_overrides.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = resolve(arg('--src', join(here, '../../../../ogfx/src')));
const OUT = resolve(arg('--out', join(here, '../../assets/opengfx/toyland')));
const ATLAS_W = 2048;

const text = (p) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"])\/\/[^\n]*/g, '$1');

/** Body text of the first block matching re (brace matched). */
function block(src, re) {
  const m = re.exec(src);
  if (!m) throw new Error(`block not found: ${re}`);
  const open = m.index + m[0].length - 1;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) return src.slice(open + 1, i);
  }
  throw new Error('unbalanced');
}

/** Rects `[expr, expr, w, h, xo, yo]` of a template body; expressions use x=1, y=1. */
function rects(body) {
  const out = [];
  for (const m of body.matchAll(/\[([^\]]*)\]/g)) {
    const f = m[1].split(',').map((e) => e.trim());
    if (f.length < 6) continue;
    const n = f.slice(0, 6).map((e) => Function('x', 'y', `return (${e});`)(1, 1));
    if (n.some((v) => Number.isNaN(v))) continue;
    out.push({ x: n[0], y: n[1], w: n[2], h: n[3], xo: n[4], yo: n[5] });
  }
  return out;
}

const tb = block(text('sprites/templates/sprite_templates.pnml'), /template tmpl_groundtiles\(/);
const groundRects = rects(tb);
if (groundRects.length < 16) throw new Error(`groundtile rects ${groundRects.length}`);

const STRIDE = 19;
const SETS = [
  { base: 0, file: 'sprites/png/terrain/bare-03-toyland.png' },
  { base: 19, file: 'sprites/png/terrain/bare-13-toyland.png' },
  { base: 38, file: 'sprites/png/terrain/bare-23-toyland.png' },
  { base: 57, file: 'sprites/png/terrain/grass-toyland.png' },
  { base: 86, file: 'sprites/png/terrain/rough-toyland.png' },
  { base: 109, file: 'sprites/png/terrain/rocks-toyland.png' },
];
const pieces = [];
for (const s of SETS) {
  groundRects.slice(0, STRIDE).forEach((r, off) => pieces.push({ key: String(s.base + off), order: s.base + off, file: s.file, ...r }));
}

// toyland town houses + their pavement ground (table/town_land.h, see toyland_table.js). Keys = OpenGFX ids, order 100000+.
const houseIds = new Set();
for (const h of TOYLAND_HOUSES) for (const p of h.pairs) { if (p[0] > 0) houseIds.add(p[0]); if (p[1] > 0) houseIds.add(p[1]); }
const defs = readSpriteDefs(SRC);
/** Fallback: a base_graphics line `spr<id>(<id>, "<file>") { [x, y, w, h, xo, yo] }` read as plain numbers. */
function rawDef(id) {
  const re = new RegExp(`base_graphics spr${id}\\(\\s*${id}\\s*,\\s*"([^"]+)"\\s*\\)\\s*\\{\\s*\\[([^\\]]*)\\]`);
  for (const f of ['base/base-4627-toyland-houses.pnml', 'base/base-4677-toyland-industries.pnml', 'base/base-2011-industries.pnml', 'toyland/toyland-0128-industry-candy-forest.pnml']) {
    const m = re.exec(text('sprites/' + f));
    if (!m) continue;
    const n = m[2].split(',').map((e) => Number(e.trim().replace(/^0+(?=\\d)/, '')));
    return { file: m[1], x: n[0], y: n[1], w: n[2], h: n[3], xo: n[4], yo: n[5] };
  }
  return null;
}
for (const id of [...houseIds].sort((a, b) => a - b)) {
  // readSpriteDefs skips rects written with a leading-zero literal (4629: "[ 0, 00, 64, 95, -31, -64]"): parse those lines directly
  const d = defs.get(id) || rawDef(id);
  if (!d) throw new Error(`house sprite ${id} has no OpenGFX definition`);
  pieces.push({ key: String(id), order: 100000 + id, file: d.file, x: d.x, y: d.y, w: d.w, h: d.h, xo: d.xo, yo: d.yo });
}

/** Candy forest sprites 128..133 from sprites/toyland/toyland-0128-industry-candy-forest.pnml (OpenGFX toyland set). */
function candyDef(id) {
  const re = new RegExp(`base_graphics spr${id}\\(\\s*${id}\\s*,\\s*"([^"]+)"\\s*\\)\\s*\\{\\s*\\[([^\\]]*)\\]`);
  const m = re.exec(text('sprites/toyland/toyland-0128-industry-candy-forest.pnml')) || re.exec(readFileSync(join(SRC, 'sprites/toyland/toyland-0128-industry-candy-forest.pnml'), 'utf8'));
  if (!m) return null;
  const n = m[2].split(',').map((e) => Number(e.trim()));
  return { file: m[1], x: n[0], y: n[1], w: n[2], h: n[3], xo: n[4], yo: n[5] };
}

// toyland industry tiles (TY3): ground + building sprite ids of every stage-3 draw (toyland_table.js TOYLAND_INDUSTRY_GFX).
const indIds = new Set([128, 129, 130, 131, 132, 133]); // candy forest trees + ground (toyland-0128 pnml)

for (const [ground, building] of Object.values(TOYLAND_INDUSTRY_GFX)) { if (ground > 0) indIds.add(ground); if (building > 0) indIds.add(building); }
for (const kids of Object.values(TOYLAND_INDUSTRY_CHILDREN)) for (const [sid] of kids) indIds.add(sid); // special-proc child sprites (TY3)
for (const id of [...indIds].sort((a, b) => a - b)) {
  if (pieces.some((p) => p.key === String(id))) continue; // already packed (ground 57/4675/4676, houses): keep the first definition
  const d = (id >= 128 && id <= 133 ? candyDef(id) : null) || defs.get(id) || rawDef(id);
  if (!d) throw new Error(`industry sprite ${id} has no OpenGFX definition`);
  pieces.push({ key: String(id), order: 200000 + id, file: d.file, x: d.x, y: d.y, w: d.w, h: d.h, xo: d.xo, yo: d.yo });
}

// TY4 infrastructure (roads, rail, water, stations, depots, bridges, tunnels, foundations): OpenGFX toyland sprite ids
// (toyland-grf numbers, sprites/toyland/*.pnml). Each block maps 1:1 onto a base sprite block (TOYLAND_OVERRIDE_BLOCKS in
// toyland.js, verified by sprite size/anchor); the composite view in toyland.js redirects base ids to these keys.
// Packed last (order 300000+) so every existing pack entry keeps its atlas position and pixels (TY3 lesson).
const tdefs = readSpriteDefs(SRC, 'toyland');
for (const [a, b] of TOYLAND_OVERRIDE_BLOCKS) {
  for (let id = a; id <= b; id++) {
    if (pieces.some((p) => p.key === String(id))) continue;
    const d = tdefs.get(id);
    if (!d) throw new Error(`toyland infra sprite ${id} has no OpenGFX definition`);
    pieces.push({ key: String(id), order: 300000 + id, file: d.file, x: d.x, y: d.y, w: d.w, h: d.h, xo: d.xo, yo: d.yo });
  }
}

// TY4: legacy key 3981 (temperate grass, packed since TY3). Kept so no HEAD pack id is dropped (TY3 lesson); the toyland
// view maps base 3981 to toyland grass 57, so this entry is not drawn in toyland games.
if (!pieces.some((p) => p.key === '3981') && defs.get(3981)) {
  const d = defs.get(3981);
  pieces.push({ key: '3981', order: 300000 - 1, file: d.file, x: d.x, y: d.y, w: d.w, h: d.h, xo: d.xo, yo: d.yo });
}

// ---- pack (same layout as extract_extra.js) ----
const srcCache = new Map();
function loadSrc(file) {
  if (!srcCache.has(file)) {
    const p = join(SRC, file);
    if (!existsSync(p)) throw new Error(`missing source ${file}`);
    srcCache.set(file, decodePng(readFileSync(p)));
  }
  return srcCache.get(file);
}
const atlases = [{ w: ATLAS_W, h: 0, x: 0, y: 0, rowH: 0 }];
function place(w, h) {
  const a = atlases[atlases.length - 1];
  if (a.x + w > ATLAS_W) { a.x = 0; a.y += a.rowH; a.rowH = 0; }
  const x = a.x, y = a.y;
  a.x += w + 1; a.rowH = Math.max(a.rowH, h + 1); a.h = Math.max(a.h, y + h);
  return { ai: atlases.length - 1, x, y };
}
pieces.sort((a, b) => a.order - b.order);
const manifest = { sprites: {}, atlases: [], license: 'OpenGFX base graphics, GPL-2.0 (https://github.com/OpenTTD/OpenGFX)' };
const placed = [];
for (const p of pieces) {
  const src = loadSrc(p.file);
  const rgba = new Uint8Array(p.w * p.h * 4);
  const ccMask = new Uint8Array(p.w * p.h);
  let cc = false;
  for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) {
    const sx = p.x + xx, sy = p.y + yy;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
    const si = sy * src.width + sx, di = (yy * p.w + xx) * 4;
    rgba.set(src.rgba.subarray(si * 4, si * 4 + 4), di);
    if (src.palIdx && (src.palIdx[si] === 0 || (p.file.includes('industries/') && src.palIdx[si] === 255))) rgba[di + 3] = 0;
    if (src.palIdx && src.palIdx[si] >= 198 && src.palIdx[si] <= 205) { ccMask[yy * p.w + xx] = 255; cc = true; }
  }
  p.ccMask = cc ? ccMask : null;
  p.cc = cc;
  const pos = place(p.w, p.h);
  placed.push({ ...p, rgba, ...pos });
}
const H = Math.max(1, atlases[0].h);
const buf = new Uint8Array(ATLAS_W * H * 4);
const maskBuf = new Uint8Array(ATLAS_W * H * 4);
for (const p of placed) {
  for (let yy = 0; yy < p.h; yy++) buf.set(p.rgba.subarray(yy * p.w * 4, (yy + 1) * p.w * 4), ((p.y + yy) * ATLAS_W + p.x) * 4);
  if (p.cc) for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) {
    const v = p.ccMask[yy * p.w + xx];
    const o = ((p.y + yy) * ATLAS_W + p.x + xx) * 4;
    maskBuf[o] = maskBuf[o + 1] = maskBuf[o + 2] = v; maskBuf[o + 3] = 255;
  }
  manifest.sprites[p.key] = [p.ai, p.x, p.y, p.w, p.h, p.xo, p.yo, p.cc ? 1 : 0];
}
mkdirSync(OUT, { recursive: true });
const png = encodePng(ATLAS_W, H, buf);
writeFileSync(join(OUT, 'atlas0.png'), png);
const hasCc = maskBuf.some((v) => v);
if (hasCc) writeFileSync(join(OUT, 'atlas0_cc.png'), encodePng(ATLAS_W, H, maskBuf));
manifest.atlases.push({ file: 'atlas0.png', cc: hasCc ? 'atlas0_cc.png' : null, w: ATLAS_W, h: H });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`toyland sprites ${placed.length}, atlas ${ATLAS_W}x${H}, ${(png.length / 1024).toFixed(1)} KB PNG`);
