#!/usr/bin/env bun
/**
 * OpenGFX ARCTIC (snowy) ground sprite extractor: the snow-dusted flat/slope ground used by the sub-arctic
 * climate (OpenTTD clear_cmd.cpp DrawClearLandTile + _clear_land_sprites_snow_desert). Sources are the
 * base-4404-houses-town-snow.pnml groundtile sets: SPR 4493 (1/4 snow), 4512 (2/4), 4531 (3/4), 4550 (full).

 * Output: assets/opengfx/arctic/manifest.json + atlas0.png (no cc masks), same layout as the extra pack.
 *
 * Usage: bun tools/ogfx/extract_arctic.js [--src <ogfx src dir>] [--out assets/opengfx/arctic]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';
import { readSpriteDefs } from './pnml.js';
import { ARCTIC_HOUSES } from '../../js/renderer/pack/arctic_house_table.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = resolve(arg('--src', join(here, '../../../scratchpad/ogfx/src')));
const OUT = resolve(arg('--out', join(here, '../../assets/opengfx/arctic')));
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

/** Rects `[expr, expr, w, h, xo, yo]` of a template body; expressions use x=1, y=1 (tmpl_groundtiles(1, 1)). */
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

// base set files (spr id -> png) as listed in base-4404-houses-town-snow.pnml
const SETS = [
  { density: 0, file: 'sprites/png/terrain/grass-arctic-snow14.gimp.png' },
  { density: 1, file: 'sprites/png/terrain/grass-arctic-snow24.gimp.png' },
  { density: 2, file: 'sprites/png/terrain/grass-arctic-snow34.gimp.png' },
  { density: 3, file: 'sprites/png/terrain/grass-snow.gimp.png' },
];
// OpenTTD table/sprites.h: SPR_FLAT_{1,2,3}_QUART_SNOW_DESERT_TILE = 4493/4512/4531, SPR_FLAT_SNOW_DESERT_TILE = 4550.
// Each density is a 19-sprite group: offset 0 flat, 1..14 slopes (= SlopeToSpriteOffset, identity for bits 0..14), 15..18 steep.
// Sprite id = 4493 + 19*density + offset; the manifest is keyed by that real id.
const STRIDE = 19, BASE_ID = 4493;
const pieces = [];
for (const s of SETS) {
  groundRects.slice(0, STRIDE).forEach((r, off) => pieces.push({ key: String(BASE_ID + STRIDE * s.density + off), order: BASE_ID + STRIDE * s.density + off, file: s.file, ...r }));
}
// Sub-arctic rocky ground (arctic-0073-rough-land.pnml: spr96 = rocks-arctic.png, 19 groundtile sprites, ids 96..114,
// OpenTTD SPR_FLAT_ROCKY_LAND_*-like slopes). Keys are the OpenGFX ids themselves; order 200000+ keeps the others unchanged.
for (let off = 0; off < STRIDE; off++) {
  pieces.push({ key: String(96 + off), order: 200000 + off, file: 'sprites/png/terrain/rocks-arctic.png', ...groundRects[off] });
}
// Sub-arctic town houses + their garden ground (table/town_land.h, see arctic_house_table.js). Original OpenGFX ids
// as keys, appended after the snow ground (order 100000+) so the existing ground entries keep their ids and atlas slots.
// Company colour (palette 198..205) masks are kept, like the base extractor.
const houseIds = new Set();
for (const h of ARCTIC_HOUSES) for (const p of h.pairs) { if (p[0] > 0) houseIds.add(p[0]); if (p[1] > 0) houseIds.add(p[1]); }
const defs = readSpriteDefs(SRC);
for (const id of [...houseIds].sort((a, b) => a - b)) {
  const d = defs.get(id);
  if (!d) throw new Error(`house sprite ${id} has no OpenGFX definition`);
  pieces.push({ key: String(id), order: 100000 + id, file: d.file, x: d.x, y: d.y, w: d.w, h: d.h, xo: d.xo, yo: d.yo });
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
    if (src.palIdx && src.palIdx[si] === 0) rgba[di + 3] = 0;
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
console.log(`arctic sprites ${placed.length}, atlas ${ATLAS_W}x${H}, ${(png.length / 1024).toFixed(1)} KB PNG`);
