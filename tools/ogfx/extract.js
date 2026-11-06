#!/usr/bin/env bun
/**
 * OpenGFX extractor (GPL-2.0 source sprites, see assets/opengfx/README.md).
 * Usage: bun tools/ogfx/extract.js [--src <ogfx src dir>] [--out assets/opengfx]
 * Reads sprites/base/*.pnml, decodes the referenced palette PNGs, packs every sprite listed in
 * groups.js into shelf-packed RGBA atlases (atlasN.png) plus company-colour masks (atlasN_cc.png).
 * Writes manifest.json: { sprites: { id: [atlas, x, y, w, h, xoff, yoff, cc] }, groups: {...}, atlases }.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';
import { readSpriteDefs } from './pnml.js';
import { GROUPS } from './groups.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SRC = resolve(arg('--src', join(here, '../../../scratchpad/ogfx/src')));
const OUT = resolve(arg('--out', join(here, '../../assets/opengfx')));
const ATLAS_W = 2048;
const CC_LO = 198, CC_HI = 205;

/** Expand group ranges to a sorted unique id list (with group membership). */
function collectIds() {
  const ids = new Map();
  for (const [name, ranges] of Object.entries(GROUPS)) {
    for (const [a, b] of ranges) for (let i = a; i <= b; i++) {
      if (!ids.has(i)) ids.set(i, name);
    }
  }
  return ids;
}

const defs = readSpriteDefs(SRC);
// 693 (buoy GUI art) is written as base_graphics spr693(693, "") with its file in the body; the parser needs a file string
if (!defs.has(693)) defs.set(693, { file: 'sprites/png/miscellaneous/random.png', x: 394, y: 10, w: 20, h: 20, xo: 0, yo: 0 });
const wanted = collectIds();
const missing = [...wanted.keys()].filter((id) => !defs.has(id));
if (missing.length) console.warn(`warning: ${missing.length} ids without definition (first: ${missing.slice(0, 8).join(', ')})`);

/** Decoded source images cache. */
const srcCache = new Map();
function loadSrc(file) {
  if (!srcCache.has(file)) {
    const path = join(SRC, file);
    if (!existsSync(path)) return null;
    const img = decodePng(readFileSync(path));
    srcCache.set(file, img);
  }
  return srcCache.get(file);
}

/** Shelf packer over a list of atlases. */
class Packer {
  constructor() { this.atlases = []; this.cur = this.newAtlas(); }
  newAtlas() {
    const a = { w: ATLAS_W, h: 0, x: 0, y: 0, rowH: 0, rects: [] };
    this.atlases.push(a);
    return a;
  }
  place(w, h) {
    const a = this.cur;
    if (a.x + w > ATLAS_W) { a.x = 0; a.y += a.rowH; a.rowH = 0; }
    if (a.y + h > 4096) { this.cur = this.newAtlas(); return this.place(w, h); }
    const x = a.x, y = a.y;
    a.x += w + 1; a.rowH = Math.max(a.rowH, h + 1);
    a.h = Math.max(a.h, y + h);
    return { ai: this.atlases.indexOf(a), x, y };
  }
}

const packer = new Packer();
const manifest = { sprites: {}, groups: {}, atlases: [] };
const pieces = []; // { ai, x, y, w, h, rgba, cc }
let skipped = 0;
for (const [id, grp] of wanted) {
  const d = defs.get(id);
  if (!d) continue;
  const src = loadSrc(d.file);
  if (!src) { skipped++; continue; }
  const w = d.w, h = d.h;
  const rgba = new Uint8Array(w * h * 4);
  let cc = false;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = d.x + xx, sy = d.y + yy;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const si = sy * src.width + sx, di = (yy * w + xx) * 4;
      rgba.set(src.rgba.subarray(si * 4, si * 4 + 4), di);
      if (src.palIdx && src.palIdx[si] === 0) rgba[di + 3] = 0; // OpenGFX: index 0 is transparent
      if (src.palIdx && src.palIdx[si] >= CC_LO && src.palIdx[si] <= CC_HI) cc = true;
    }
  }
  // transparent index 0 is alpha 0 already (palette tRNS); mark cc pixels separately below
  const ccMask = new Uint8Array(w * h);
  if (cc) for (let k = 0; k < w * h; k++) {
    const si = (d.y + Math.floor(k / w)) * src.width + d.x + (k % w);
    const pi = src.palIdx ? src.palIdx[si] : -1;
    if (pi >= CC_LO && pi <= CC_HI) ccMask[k] = 255;
  }
  pieces.push({ id, grp, w, h, xo: d.xo, yo: d.yo, rgba, ccMask: cc ? ccMask : null, cc });
}
pieces.sort((a, b) => b.h - a.h || a.id - b.id);
for (const p of pieces) {
  const pos = packer.place(p.w, p.h);
  p.ai = pos.ai; p.x = pos.x; p.y = pos.y;
}

// Render atlases
mkdirSync(OUT, { recursive: true });
const atlasBuf = packer.atlases.map((a) => new Uint8Array(ATLAS_W * Math.max(1, a.h) * 4));
const maskBuf = packer.atlases.map((a) => new Uint8Array(ATLAS_W * Math.max(1, a.h) * 4));
for (const p of pieces) {
  const A = atlasBuf[p.ai], M = maskBuf[p.ai];
  const stride = ATLAS_W * 4;
  for (let yy = 0; yy < p.h; yy++) {
    A.set(p.rgba.subarray(yy * p.w * 4, (yy + 1) * p.w * 4), (p.y + yy) * stride + p.x * 4);
  }
  if (p.cc) {
    for (let yy = 0; yy < p.h; yy++) for (let xx = 0; xx < p.w; xx++) {
      const v = p.ccMask[yy * p.w + xx];
      const o = (p.y + yy) * stride + (p.x + xx) * 4;
      M[o] = M[o + 1] = M[o + 2] = v; M[o + 3] = 255;
    }
  }
  manifest.sprites[p.id] = [p.ai, p.x, p.y, p.w, p.h, p.xo, p.yo, p.cc ? 1 : 0];
}
let total = 0;
packer.atlases.forEach((a, i) => {
  const h = Math.max(1, a.h);
  const png = encodePng(ATLAS_W, h, atlasBuf[i]);
  writeFileSync(join(OUT, `atlas${i}.png`), png);
  total += png.length;
  if (maskBuf[i].some((v) => v)) {
    const m = encodePng(ATLAS_W, h, maskBuf[i]);
    writeFileSync(join(OUT, `atlas${i}_cc.png`), m);
    total += m.length;
  }
  manifest.atlases.push({ file: `atlas${i}.png`, cc: maskBuf[i].some((v) => v) ? `atlas${i}_cc.png` : null, w: ATLAS_W, h });
});
for (const [name, ranges] of Object.entries(GROUPS)) manifest.groups[name] = ranges;
manifest.license = 'OpenGFX base graphics, GPL-2.0 (https://github.com/OpenTTD/OpenGFX)';
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest));
console.log(`sprites ${pieces.length} (skipped ${skipped}), atlases ${packer.atlases.length}, ${(total / 1e6).toFixed(2)} MB PNG (+manifest)`);
void statSync;
