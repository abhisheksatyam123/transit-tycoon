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
  for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) {
    const sx = p.x + xx, sy = p.y + yy;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
    const si = sy * src.width + sx, di = (yy * p.w + xx) * 4;
    rgba.set(src.rgba.subarray(si * 4, si * 4 + 4), di);
    if (src.palIdx && src.palIdx[si] === 0) rgba[di + 3] = 0;
  }
  const pos = place(p.w, p.h);
  placed.push({ ...p, rgba, ...pos });
}
const H = Math.max(1, atlases[0].h);
const buf = new Uint8Array(ATLAS_W * H * 4);
for (const p of placed) {
  for (let yy = 0; yy < p.h; yy++) buf.set(p.rgba.subarray(yy * p.w * 4, (yy + 1) * p.w * 4), ((p.y + yy) * ATLAS_W + p.x) * 4);
  manifest.sprites[p.key] = [p.ai, p.x, p.y, p.w, p.h, p.xo, p.yo, 0];
}
mkdirSync(OUT, { recursive: true });
const png = encodePng(ATLAS_W, H, buf);
writeFileSync(join(OUT, 'atlas0.png'), png);
manifest.atlases.push({ file: 'atlas0.png', cc: null, w: ATLAS_W, h: H });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`arctic sprites ${placed.length}, atlas ${ATLAS_W}x${H}, ${(png.length / 1024).toFixed(1)} KB PNG`);
