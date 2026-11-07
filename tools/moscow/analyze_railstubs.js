#!/usr/bin/env bun
/**
 * Analysis: rail dead ends and road S-jogs of the Moscow day-0 snapshot.
 * Dead end = rail tile with exactly one connection. Category: station (station/depot tile or
 * adjacent to a station/depot tile), long tail (>3 tiles walked before a junction), short stub (<=3).
 * Usage: bun tools/moscow/analyze_railstubs.js [snapshotPath]  (default: fresh build)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Game } from '../../js/simulation/game.js';
import { countJogs } from './dejog.js';

const path = process.argv[2];
// no arg: fresh Moscow day-0 build (seed 1); arg: snapshot json path
const game = path ? Game.deserialize(readFileSync(path, 'utf8')) : Game.create({ scenario: 'moscow', seed: 1 });
const state = game.state;
const W = state.map.width, H = state.map.height;
const D = [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]];
const pc = (b) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
const rail = new Uint8Array(W * H), road = new Uint8Array(W * H);
for (let t = 0; t < W * H; t++) { rail[t] = state.map.tiles[t].rail | 0; road[t] = state.map.tiles[t].road | 0; }
const special = new Uint8Array(W * H); // station / depot tiles and their 4-neighbours
const mark = (x, y) => { for (const [, dx, dy] of [[0, 0, 0], ...D]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) special[Y * W + X] = 1; } };
for (const s of state.stations) for (const tl of s.tiles || []) mark(tl.x, tl.y);
for (const d of state.depots) mark(d.x, d.y);
const nb = (t, bit) => { const q = D.find((e) => e[0] === bit); const x = t % W + q[1], y = Math.floor(t / W) + q[2]; return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x; };

const cats = { station: 0, longTail: 0, shortStub: 0 };
const stubs = [];
for (let t = 0; t < W * H; t++) {
  if (!rail[t] || pc(rail[t]) !== 1) continue;
  if (special[t]) { cats.station++; continue; }
  // walk through degree-2 tiles
  let cur = t, from = -1, len = 0, endSpecial = false;
  let bit = rail[t];
  for (;;) {
    const nxt = nb(cur, bit);
    if (nxt < 0 || !rail[nxt] || !(rail[nxt] & (bit === 1 ? 4 : bit === 2 ? 8 : bit === 4 ? 1 : 2))) break;
    len++; if (special[nxt]) { endSpecial = true; break; }
    if (pc(rail[nxt]) !== 2) break; // junction
    const out = rail[nxt] & ~(bit === 1 ? 4 : bit === 2 ? 8 : bit === 4 ? 1 : 2);
    cur = nxt; bit = out;
  }
  if (endSpecial) { cats.station++; continue; }
  if (state.map.tiles[t].tunnel) { cats.tunnelMouth = (cats.tunnelMouth || 0) + 1; continue; }
  if (len <= 3) { cats.shortStub++; stubs.push({ t, x: t % W, y: Math.floor(t / W), len }); } else cats.longTail++;
}
const jogs = countJogs(road, W, H);
console.log(`rail dead ends: station ${cats.station} longTail ${cats.longTail} shortStub ${cats.shortStub} tunnelMouth ${cats.tunnelMouth || 0}`);
console.log(`road S-jogs: ${jogs}`);
console.log('stubs ' + JSON.stringify(stubs));

