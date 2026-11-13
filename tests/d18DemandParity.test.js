/** D18: opt-in OpenTTD demand parity (setting cargodistDemandParity, off by default). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { rebuildGraph, nextHop, noteLeg, demandUnitsParity, distanceMaxPlusManhattan, demandParityOn } from '../js/simulation/cargodist.js';
import { recomputeAllAcceptance } from '../js/simulation/stations.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';

const units = (r) => Object.fromEntries(r.entries.map((e) => [e.s + '>' + e.d, e.amt]));
const pos = new Map([[1, [0, 0]], [2, [5, 0]], [3, [0, 5]]]);

describe('D18 demand parity: pure DemandCalculator', () => {
  test('setting is registered and off by default', () => {
    expect(DEFAULT_SETTINGS.cargodistDemandParity).toBe(false);
    expect(demandParityOn({ settings: {} })).toBe(false);
    expect(demandParityOn(null)).toBe(false);
  });

  test('DistanceMaxPlusManhattan is 2*max + min', () => {
    expect(distanceMaxPlusManhattan([0, 0], [3, 1])).toBe(7);
    expect(distanceMaxPlusManhattan([0, 0], [1, 3])).toBe(7);
    expect(distanceMaxPlusManhattan([0, 0], [2, 2])).toBe(6);
    expect(distanceMaxPlusManhattan([4, 4], [4, 4])).toBe(0);
  });

  test('asymmetric: one supplier, one acceptor delivers exactly its supply', () => {
    const r = demandUnitsParity({
      nodes: [1, 2], pos, supply: new Map([[1, 100], [2, 0]]), accept: new Map([[1, 0], [2, 5]]),
      mode: 'asymmetric', mapW: 10, mapH: 10,
    });
    expect(units(r)).toEqual({ '1>2': 100 });
    expect(r.approx).toBe(false);
  });

  test('symmetric: no node sends more than its supply, and an accepting-less node receives nothing', () => {
    const nodes = [1, 2, 3];
    const r = demandUnitsParity({
      nodes, pos, supply: new Map([[1, 300], [2, 120], [3, 0]]), accept: new Map([[1, 1], [2, 1], [3, 0]]),
      mode: 'symmetric', accuracy: 16, demandSize: 100, demandDistance: 100, mapW: 10, mapH: 10,
    });
    const out = new Map();
    for (const e of r.entries) {
      expect(Number.isInteger(e.amt)).toBe(true);
      expect(e.amt).toBeGreaterThan(0);
      expect(e.d).not.toBe(3); // node 3 has no acceptance
      out.set(e.s, (out.get(e.s) || 0) + e.amt);
    }
    expect(out.get(1)).toBeLessThanOrEqual(300);
    expect(out.get(2)).toBeLessThanOrEqual(120);
    expect(r.entries.length).toBeGreaterThan(0);
  });

  test('deterministic and no demand without supply, acceptance or in manual mode', () => {
    const args = { nodes: [1, 2, 3], pos, supply: new Map([[1, 90], [2, 40], [3, 10]]), accept: new Map([[1, 2], [2, 2], [3, 2]]), mapW: 10, mapH: 10 };
    expect(demandUnitsParity({ ...args, mode: 'symmetric' })).toEqual(demandUnitsParity({ ...args, mode: 'symmetric' }));
    expect(demandUnitsParity({ ...args, mode: 'manual' }).entries).toEqual([]);
    expect(demandUnitsParity({ ...args, supply: new Map(), mode: 'asymmetric' }).entries).toEqual([]);
    expect(demandUnitsParity({ ...args, accept: new Map(), mode: 'asymmetric' }).entries).toEqual([]);
  });
});

/** Coal A(10) -> C(20) on one line, A supplies 1000 units, only C accepts (same fixture idea as d18Routing). */
function coalLine(on) {
  const g = flatGame(5);
  const s = g.state;
  setSetting(s, 'freightDistribution', 'asymmetric');
  if (on) setSetting(s, 'cargodistDemandParity', true);
  for (const [x, y] of [[10, 24], [20, 24]]) expect(g.buildRailStation(x, y, 'x', 3).ok).toBe(true);
  expect(g.buildRail(10, 24, 20, 24).ok).toBe(true);
  placeIndustry(s, 'coal_mine', 8, 20);
  placeIndustry(s, 'power_station', 18, 20);
  const [A, C] = s.stations.slice(-2);
  recomputeAllAcceptance(s);
  const e = (x, y, cap) => noteLeg(s, x, y.id, [{ cargoId: 'COAL', capacity: cap }]);
  e(A, C, 40); e(C, A, 40);
  A.cdSupply = { COAL: 1000 };
  return { s, A, C };
}

describe('D18 demand parity: job integration', () => {
  test('on: the only pair gets a full row; routing still uses the first hop', () => {
    const { s, A, C } = coalLine(true);
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(s.cargoDist.COAL.dem[A.id]).toEqual([[C.id, 1]]);
    expect(nextHop(s, 'COAL', A.id, C.id)).toBe(C.id);
  });

  test('off (default): the same fixture takes the unchanged demand path', () => {
    const { s, A, C } = coalLine(false);
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(s.cargoDist.COAL.dem[A.id]).toEqual([[C.id, 1]]);
    expect(nextHop(s, 'COAL', A.id, C.id)).toBe(C.id);
  });
});
