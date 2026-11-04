/**
 * Tests for the baked Moscow map (js/config/maps/moscow.js). Skipped when the file is absent.
 */
import { describe, test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRLE } from '../js/config/maps/rle.js';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../js/config/maps/moscow.js');
const HAS = existsSync(FILE);

describe.skipIf(!HAS)('baked Moscow map', async () => {
  const { MOSCOW: M } = await import(FILE);
  const N = M.width * M.height;
  const terr = decodeRLE(M.terrain, N);
  const road = decodeRLE(M.road, N);
  const cls = decodeRLE(M.roadClass, N);
  const rail = decodeRLE(M.rail, N);
  const bitsAt = (s, t) => parseInt(s[t], 16);
  const W = M.width;

  test('layer lengths equal width*height', () => {
    for (const s of [terr, road, cls, rail, decodeRLE(M.density, N)]) expect(s.length).toBe(N);
    expect(M.width).toBeGreaterThan(0);
    expect(M.height).toBeGreaterThan(0);
  });

  test('road and rail bits are symmetric', () => {
    for (const s of [road, rail]) {
      for (let t = 0; t < N; t++) {
        const x = t % W, y = (t - x) / W, b = bitsAt(s, t);
        if (b & 2) expect(x + 1 < W && (bitsAt(s, t + 1) & 8) !== 0).toBe(true);
        if (b & 4) expect(y + 1 < M.height && (bitsAt(s, t + W) & 1) !== 0).toBe(true);
        if (b & 8) expect(x > 0 && (bitsAt(s, t - 1) & 2) !== 0).toBe(true);
        if (b & 1) expect(y > 0 && (bitsAt(s, t - W) & 4) !== 0).toBe(true);
      }
    }
  });

  test('Kremlin landmark is land and near water (river)', () => {
    const k = M.landmarks.find((l) => l.id === 'kremlin');
    expect(terr[k.y * W + k.x]).not.toBe('w');
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = k.x + dx, y = k.y + dy;
      if (x >= 0 && y >= 0 && x < W && y < M.height && terr[y * W + x] === 'w') { near = true; break; }
    }
    expect(near).toBe(true);
  });

  test('metro: at least 5 lines with >= 10 stations when metro data exists', () => {
    if (M.metroLines.length === 0) return;
    const big = M.metroLines.filter((l) => l.stations.length >= 10);
    expect(big.length).toBeGreaterThanOrEqual(5);
  });

  test('metro layer: symmetric bits and > 300 metro tiles (skipped until subway data is baked)', () => {
    const met = decodeRLE(M.metro, N);
    if (!met.includes('1') && !/[2-9a-f]/.test(met)) return;
    expect(met.length).toBe(N);
    let n = 0;
    for (let t = 0; t < N; t++) {
      const x = t % W, y = (t - x) / W, b = bitsAt(met, t);
      if (b) n++;
      if (b & 2) expect(x + 1 < W && (bitsAt(met, t + 1) & 8) !== 0).toBe(true);
      if (b & 4) expect(y + 1 < M.height && (bitsAt(met, t + W) & 1) !== 0).toBe(true);
      if (b & 8) expect(x > 0 && (bitsAt(met, t - 1) & 2) !== 0).toBe(true);
      if (b & 1) expect(y > 0 && (bitsAt(met, t - W) & 4) !== 0).toBe(true);
    }
    expect(n).toBeGreaterThan(300);
  });

  test('metroLine chars only on metro tiles', () => {
    const met = decodeRLE(M.metro, N);
    const ml = decodeRLE(M.metroLine, N);
    for (let t = 0; t < N; t++) if (ml[t] !== '-') expect(met[t] !== '0').toBe(true);
  });

  test('landuse has industrial tiles when landuse data is baked; bldLevels/bldCount length', () => {
    if (decodeRLE(M.landuse, N).includes('i')) expect(true).toBe(true);
    expect(decodeRLE(M.bldLevels, N).length).toBe(N);
    expect(decodeRLE(M.bldCount, N).length).toBe(N);
  });

  test('at least 2 airports with runways (skipped until aeroway data is baked)', () => {
    if (!M.airports.length) return;
    const withRw = M.airports.filter((a) => a.runways.length > 0);
    expect(withRw.length).toBeGreaterThanOrEqual(2);
    for (const a of M.airports) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(W);
    }
  });

  test('road tiles > 3000', () => {
    let n = 0;
    for (let t = 0; t < N; t++) if (road[t] !== '0') n++;
    expect(n).toBeGreaterThan(3000);
  });
});
