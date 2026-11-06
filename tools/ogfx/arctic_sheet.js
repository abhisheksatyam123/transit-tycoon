#!/usr/bin/env bun
/**
 * Verification sheet for the arctic snow ground: one row per snow density (1/4..full) with the flat sprite and the
 * 14 slope sprites (SlopeToSpriteOffset 1..14), plus a temperate grass row (3981+offset) for comparison.
 * Usage: bun tools/ogfx/arctic_sheet.js [--out <png>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : '/home/abhi/project/city_sim/scratchpad/tmp/CL_snow_sheet.png';
const load = (dir) => {
  const man = JSON.parse(readFileSync(join(root, 'assets/opengfx', dir, 'manifest.json'), 'utf8'));
  const atlases = man.atlases.map((a) => decodePng(readFileSync(join(root, 'assets/opengfx', dir, a.file))));
  return { man, atlases };
};
const arctic = load('arctic');
const base = load('');

const CELL_W = 64, CELL_H = 48, LABEL = 90;
const ROWS = [
  { name: 'snow 1/4', src: arctic, ids: Array.from({ length: 15 }, (_, k) => 4493 + k) },
  { name: 'snow 2/4', src: arctic, ids: Array.from({ length: 15 }, (_, k) => 4512 + k) },
  { name: 'snow 3/4', src: arctic, ids: Array.from({ length: 15 }, (_, k) => 4531 + k) },
  { name: 'snow full', src: arctic, ids: Array.from({ length: 15 }, (_, k) => 4550 + k) },
  { name: 'temperate grass', src: base, ids: Array.from({ length: 15 }, (_, k) => 3981 + k) },
];
const W = LABEL + 15 * CELL_W, H = ROWS.length * CELL_H;
const buf = new Uint8Array(W * H * 4);
for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
const blit = (src, id, cx, cy) => {
  const s = src.man.sprites[String(id)];
  if (!s) return;
  const [ai, x0, y0, w, h, xo, yo] = s;
  const a = src.atlases[ai];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const si = (y0 + yy) * a.width + x0 + xx;
    if (a.palIdx && a.palIdx[si] === 0 && false) continue;
    const dx = cx + xx + xo + 31, dy = cy + yy + yo + 4;
    if (dx < cx || dx >= cx + CELL_W || dy < cy || dy >= cy + CELL_H) continue;
    const di = (dy * W + dx) * 4;
    const sa = a.rgba[si * 4 + 3];
    if (sa === 0) continue;
    buf.set(a.rgba.subarray(si * 4, si * 4 + 3), di);
    buf[di + 3] = 255;
  }
};
ROWS.forEach((r, ri) => r.ids.forEach((id, k) => blit(r.src, id, LABEL + k * CELL_W, ri * CELL_H)));
writeFileSync(out, encodePng(W, H, buf));
console.log('sheet', out, W, 'x', H, ROWS.map((r) => r.name).join(' | '));
