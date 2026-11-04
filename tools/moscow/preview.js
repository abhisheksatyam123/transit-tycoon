#!/usr/bin/env bun
/**
 * Top-down PNG preview of the baked Moscow map.
 * Usage: bun tools/moscow/preview.js [mapFile] [outPng] [scale]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeRLE } from '../../js/config/maps/rle.js';
import { encodePNG } from './png.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const MAP = resolve(process.argv[2] || resolve(ROOT, 'js/config/maps/moscow.js'));
const OUT = process.argv[3] || '/home/abhi/project/city_sim/scratchpad/moscow/preview.png';
const S = Number(process.argv[4] || 4);
const Z = process.argv[5] ? process.argv[5].split(',').map(Number) : null; // optional crop x0,y0,x1,y1 in tiles

const COL = {
  '-': [200, 196, 186],
  bg: [40, 40, 44], land: [200, 196, 186], water: [40, 110, 210], park: [110, 200, 110], forest: [30, 110, 50],
  m: [230, 30, 30], t: [255, 140, 0], p: [250, 230, 40], s: [255, 255, 255], rail: [0, 0, 0], dens: [150, 150, 150],
};

/**
 * Fill a rect of S x S pixels with colour.
 * @param {Uint8Array} img
 * @param {number} W image width px
 * @param {number} x tile x
 * @param {number} y tile y
 * @param {number[]} c rgb
 */
function px(img, W, x, y, c) {
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
    const o = ((y * S + dy) * W + x * S + dx) * 3;
    img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
  }
}

/**
 * Load the map module (ESM) by dynamic import.
 * @returns {Promise<object>}
 */
async function load() {
  const mod = await import(pathToFileURL(MAP).href);
  return mod.MOSCOW;
}

/** Entry. */
async function main() {
  const M = await load();
  const { width: Wt, height: Ht } = M;
  const terr = decodeRLE(M.terrain, Wt * Ht);
  const road = decodeRLE(M.road, Wt * Ht);
  const cls = decodeRLE(M.roadClass, Wt * Ht);
  const rail = decodeRLE(M.rail, Wt * Ht);
  const metro = M.metro ? decodeRLE(M.metro, Wt * Ht) : null;
  const lu = M.landuse ? decodeRLE(M.landuse, Wt * Ht) : null;
  const lev = M.bldLevels ? decodeRLE(M.bldLevels, Wt * Ht) : null;
  const W = Wt * S, H = Ht * S;
  const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3; img[o] = COL.bg[0]; img[o + 1] = COL.bg[1]; img[o + 2] = COL.bg[2];
  }
  for (let t = 0; t < Wt * Ht; t++) {
    const x = t % Wt, y = (t - x) / Wt;
    const k = terr[t];
    const c = k === 'w' ? COL.water : k === 'p' ? COL.park : k === 'f' ? COL.forest : COL.land;
    px(img, W, x, y, c);
  }
  if (lu) for (let t = 0; t < Wt * Ht; t++) {
    const x = t % Wt, y = (t - x) / Wt;
    if (lu[t] === 'i') px(img, W, x, y, [170, 120, 200]);
    else if (lu[t] === 'c') px(img, W, x, y, [240, 200, 150]);
    else if (lu[t] === 'm') px(img, W, x, y, [250, 170, 190]);
  }
  if (lev) for (let t = 0; t < Wt * Ht; t++) {
    const x = t % Wt, y = (t - x) / Wt;
    const v = lev[t];
    if (v !== '0') { const g = Math.max(40, 200 - (Number(v) - 4) * 18); px(img, W, x, y, [g, g, g]); }
  }
  for (let t = 0; t < Wt * Ht; t++) {
    const x = t % Wt, y = (t - x) / Wt;
    if (rail[t] !== '0') px(img, W, x, y, COL.rail);
  }
  if (metro) for (let t = 0; t < Wt * Ht; t++) {
    const x = t % Wt, y = (t - x) / Wt;
    if (metro[t] !== '0') px(img, W, x, y, [255, 90, 200]);
  }
  for (const a of M.airports || []) {
    for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (x < Wt && y < Ht) px(img, W, x, y, [235, 235, 235]);
    for (const r of a.runways) {
      const n = Math.max(Math.abs(r.x2 - r.x1), Math.abs(r.y2 - r.y1), 1);
      for (let i = 0; i <= n; i++) {
        const xx = Math.round(r.x1 + ((r.x2 - r.x1) * i) / n), yy = Math.round(r.y1 + ((r.y2 - r.y1) * i) / n);
        if (xx >= 0 && yy >= 0 && xx < Wt && yy < Ht) px(img, W, xx, yy, [255, 255, 255]);
      }
    }
  }
  for (let t = 0; t < Wt * Ht; t++) {
    const x = t % Wt, y = (t - x) / Wt;
    const b = parseInt(road[t], 16);
    if (!b) continue;
    const c = COL[cls[t]] || COL.s;
    // draw a line from centre to each connected side
    const cx = x * S + S / 2, cy = y * S + S / 2;
    const seg = (ax, ay, bx, by) => {
      for (let i = 0; i <= S; i++) {
        const xx = Math.round(ax + ((bx - ax) * i) / S), yy = Math.round(ay + ((by - ay) * i) / S);
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
          const o = (yy * W + xx) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
        }
      }
    };
    if (b & 1) seg(cx, cy, cx, y * S);
    if (b & 2) seg(cx, cy, (x + 1) * S, cy);
    if (b & 4) seg(cx, cy, cx, (y + 1) * S);
    if (b & 8) seg(cx, cy, x * S, cy);
  }
  const dots = [];
  for (const l of M.metroLines) for (const s of l.stations) dots.push([s.x, s.y, l.color]);
  for (const [x, y, col] of dots) {
    const c = hex(col);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x * S + S / 2 + dx, yy = y * S + S / 2 + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const o = (yy * W + xx) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
    }
  }
  for (const lm of M.landmarks) {
    const cx = lm.x * S + S / 2, cy = lm.y * S + S / 2;
    for (let d = -3; d <= 3; d++) for (const [xx, yy] of [[cx + d, cy], [cx, cy + d]]) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const o = (Math.round(yy) * W + Math.round(xx)) * 3; img[o] = 255; img[o + 1] = 0; img[o + 2] = 255;
    }
  }
  if (Z) {
    const [x0, y0, x1, y1] = Z;
    const cw = (x1 - x0) * S, chh = (y1 - y0) * S;
    const out = new Uint8Array(cw * chh * 3);
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      const src = ((y + y0 * S) * W + x + x0 * S) * 3, dst = (y * cw + x) * 3;
      out[dst] = img[src]; out[dst + 1] = img[src + 1]; out[dst + 2] = img[src + 2];
    }
    writeFileSync(OUT, encodePNG(cw, chh, out));
    console.log(`[preview] wrote ${OUT} ${cw}x${chh} (crop)`);
    return;
  }
  writeFileSync(OUT, encodePNG(W, H, img));
  console.log(`[preview] wrote ${OUT} ${W}x${H}`);
}

/**
 * Hex colour to rgb array.
 * @param {string} h '#rrggbb'
 * @returns {number[]}
 */
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

main();
