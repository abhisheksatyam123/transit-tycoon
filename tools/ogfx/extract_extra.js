#!/usr/bin/env bun
/**
 * OpenGFX EXTRA sprite extractor (temperate only): canal water, canal dikes, locks, river slopes and
 * tram overlays from the extra sets (sprites/extra/extra-plus-canals.pnml, extra-plus-locks.pnml,
 * extra-plus-rivers.pnml, extra-tram-tracks.pnml, extra-canals.pnml templates). These are NOT base ids,
 * so they go to a separate pack: assets/opengfx/extra/manifest.json + atlas0.png (no cc masks).
 *
 * Usage: bun tools/ogfx/extract_extra.js [--src <ogfx src dir>] [--out assets/opengfx/extra]
 *
 * Keys: "<set>.<index>" -> [atlas, x, y, w, h, xoff, yoff, 0]. Index order = OpenTTD sprite offset order:
 *   canal_water.0      flat canal/lock water (river_water.gimp.png)
 *   canal_water.1..4   lock water slopes SE, NE, SW, NW (OpenTTD DrawWaterLock: index = 1 + dir)
 *   river_slope.0..4   same layout from set_riverwater_1 (flat river + riverrapids slopes, DrawRiverWater)
 *   canal_dikes.0..11  DrawWaterEdges offsets: 0..3 edge dikes (neighbour 0..3 land), 4..7 corners, 8..11 small corners
 *   locks.0..23        _lock_display_data sprite index: middle 0-7, lower 8-15, upper 16-23 (dir + 4 = front wall)
 *   tram_overlay.0..18 SPR_TRAMWAY_OVERLAY + road offset (road_cmd.cpp GetRoadSpriteOffset), offset 0..18
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = resolve(arg('--src', join(here, '../../../scratchpad/ogfx/src')));
const OUT = resolve(arg('--out', join(here, '../../assets/opengfx/extra')));
const ATLAS_W = 2048;

const text = (p) => readFileSync(join(SRC, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"])\/\/[^\n]*/g, '$1');

/** Body text of the first `header {` block matching the regex (brace matched). */
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

/** Literal rectangles `[x, y, w, h, xo, yo, ...]` in a body, in order. */
function rects(body) {
  const out = [];
  for (const m of body.matchAll(/\[([^\]]*)\]/g)) {
    const f = m[1].split(',').map((s) => s.trim());
    const n = f.slice(0, 6).map(Number);
    if (n.some((v) => Number.isNaN(v))) continue;
    out.push({ x: n[0], y: n[1], w: n[2], h: n[3], xo: n[4], yo: n[5] });
  }
  return out;
}

const pieces = [];
/** Add one set: list of {key, file, rect}. */
function add(set, file, list) {
  list.forEach((r, i) => pieces.push({ key: `${set}.${i}`, file, ...r }));
}

// canal + lock water (set_canal_water in extra-plus-canals.pnml; flat first, then 4 slopes)
{
  const f = 'sprites/png/terrain/waterfeatures.png';
  const body = block(text('sprites/extra/extra-plus-canals.pnml'), /spriteset\(\s*set_canal_water/);
  add('canal_water', 'sprites/png/terrain/waterfeatures/river_water.gimp.png', [{ x: 1, y: 1, w: 64, h: 31, xo: -31, yo: 0 }]);
  const slopes = rects(body).map((r) => r); // literal rects from waterfeatures.png
  if (slopes.length !== 4) throw new Error(`canal water slopes ${slopes.length}`);
  pieces.push(...slopes.map((r, i) => ({ key: `canal_water.${i + 1}`, file: f, ...r })));
}

// river slopes (set_riverwater_1: flat river + riverrapids slopes)
{
  const body = block(text('sprites/extra/extra-plus-rivers.pnml'), /spriteset\(set_riverwater_1,/);
  const slopes = rects(body);
  if (slopes.length !== 4) throw new Error(`river slopes ${slopes.length}`);
  pieces.push({ key: 'river_slope.0', file: 'sprites/png/terrain/waterfeatures/river_water.gimp.png', x: 1, y: 1, w: 64, h: 31, xo: -31, yo: 0 });
  // set_riverwater_1 slope rects are on riverrapids.png (not waterfeatures.png)
  pieces.push(...slopes.map((r, i) => ({ key: `river_slope.${i + 1}`, file: 'sprites/png/terrain/waterfeatures/riverrapids.png', ...r })));
}

// canal dikes (tmpl_canalsides, temperate args in call order: ne, se, sw, nw, cornerE, cornerS, cornerW, cornerN, small)
{
  const t = 'sprites/png/terrain/waterfeatures/canaldike_temperate_';
  const files = ['ne', 'se', 'sw', 'nw', 'cornerE', 'cornerS', 'cornerW', 'cornerN'].map((n) => t + n + '.gimp.png');
  const tb = block(text('sprites/templates/sprite_templates.pnml'), /template tmpl_canalsides\(/);
  const small = rects(tb);
  if (small.length !== 4) throw new Error(`smallcorners ${small.length}`);
  files.forEach((file, i) => pieces.push({ key: `canal_dikes.${i}`, file, x: 1, y: 1, w: 64, h: 31, xo: -31, yo: 0 }));
  small.forEach((r, i) => pieces.push({ key: `canal_dikes.${8 + i}`, file: t + 'smallcorners.gimp.png', ...r }));
}

// locks (tmpl_locks, temperate file locks_normal)
{
  const body = block(text('sprites/templates/sprite_templates.pnml'), /template tmpl_locks\(/);
  const r = rects(body);
  if (r.length !== 24) throw new Error(`locks ${r.length}`);
  add('locks', 'sprites/png/infrastructure/locks_normal.gimp.png', r);
}

// tram overlay (extra-tram-tracks.pnml ottd_tramway2 starts at TRAMWAY_BASE+2, so SPR_TRAMWAY_OVERLAY (base+4) is rect 2; rects 2..20 = overlay 0..18)
{
  const body = block(text('sprites/extra/extra-tram-tracks.pnml'), /replacenew ottd_tramway2\(/);
  const r = rects(body);
  for (let k = 0; k <= 18; k++) {
    if (!r[2 + k]) throw new Error('tram overlay rect missing');
    pieces.push({ key: `tram_overlay.${k}`, file: "sprites/png/infrastructure/infra08.png", ...r[2 + k] });
  }
}

// ---- pack ----
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

pieces.sort((a, b) => b.h - a.h || a.key.localeCompare(b.key));
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
console.log(`extra sprites ${placed.length}, atlas ${ATLAS_W}x${H}, ${(png.length / 1024).toFixed(1)} KB PNG`);
