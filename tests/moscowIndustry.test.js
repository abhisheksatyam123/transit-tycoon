import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { MOSCOW } from '../js/config/maps/moscow.js';
import { decodeRLE } from '../js/config/maps/rle.js';
import { landuseClusters, SUPPLIERS } from '../js/simulation/scenarios/moscowIndustry.js';
import { INDUSTRY_BY_ID } from '../js/config/industries.js';

const W = MOSCOW.width, H = MOSCOW.height;
const LU = decodeRLE(MOSCOW.landuse || '', W * H);
const hasLanduse = LU.includes('i');
const SUPPLIER_TYPES = new Set(SUPPLIERS.map((s) => s.typeId));

describe('moscow industries from landuse', () => {
  const g = Game.create({ scenario: 'moscow', seed: 1 });
  const { state } = g;
  const inds = state.industries;

  test('clusters are connected, sorted by size, and cover all i tiles', () => {
    const cl = landuseClusters(LU, W, H, 'i');
    const total = cl.reduce((a, c) => a + c.size, 0);
    expect(total).toBe([...LU].filter((c) => c === 'i').length);
    for (let k = 1; k < cl.length; k++) expect(cl[k - 1].size).toBeGreaterThanOrEqual(cl[k].size);
  });

  test('at least 20 industries in Moscow', () => {
    expect(inds.length).toBeGreaterThanOrEqual(20);
  });

  test('>= 70% of non-supplier industries touch landuse industry (within 2 tiles)', () => {
    const urban = inds.filter((i) => !SUPPLIER_TYPES.has(i.typeId) && i.typeId !== 'refinery');
    if (!hasLanduse || urban.length === 0) return;
    let ok = 0;
    for (const ind of urban) {
      let near = false;
      for (let y = ind.y - 2; y < ind.y + ind.h + 2 && !near; y++) for (let x = ind.x - 2; x < ind.x + ind.w + 2 && !near; x++) {
        if (x >= 0 && y >= 0 && x < W && y < H && LU[y * W + x] === 'i') near = true;
      }
      if (near) ok++;
    }
    expect(ok / urban.length).toBeGreaterThanOrEqual(0.7);
  });

  test('no industry tile overlaps a landmark, airport, or metro station; no road on footprint', () => {
    for (const ind of inds) {
      for (let y = ind.y; y < ind.y + ind.h; y++) for (let x = ind.x; x < ind.x + ind.w; x++) {
        const t = state.map.tiles[y * W + x];
        expect(t.building && t.building.type).toBe('industry');
        expect(t.road ?? 0).toBe(0);
      }
    }
    const reserved = [];
    state.map.tiles.forEach((t, i) => { if (t.building && ['landmark', 'station'].includes(t.building.type)) reserved.push(i); });
    const industryTileSet = new Set();
    for (const ind of inds) for (let y = ind.y; y < ind.y + ind.h; y++) for (let x = ind.x; x < ind.x + ind.w; x++) industryTileSet.add(y * W + x);
    expect(reserved.filter((i) => industryTileSet.has(i))).toEqual([]);
    expect(reserved.length).toBeGreaterThan(0);
  });

  test('industry types are known; factories/steel/power present', () => {
    for (const ind of inds) expect(INDUSTRY_BY_ID[ind.typeId]).toBeDefined();
    const types = new Set(inds.map((i) => i.typeId));
    expect(types.has('factory') || types.has('steel_mill')).toBe(true);
    expect(types.has('power_station')).toBe(true);
  });

  test('scenario log records the landuse planner', () => {
    expect(state.scenarioLog.some((l) => /industries from landuse/.test(l))).toBe(true);
  });
});
