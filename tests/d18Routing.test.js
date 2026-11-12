/** D18: OpenTTD-style batched capacity routing (setting cargodistCapacityRouting, off by default). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { rebuildGraph, nextHop, nextHops, noteLeg, cdCapacityRoutingOn, ottdDistance } from '../js/simulation/cargodist.js';
import { recomputeAllAcceptance } from '../js/simulation/stations.js';
import { setSetting } from '../js/simulation/settings.js';

/**
 * Coal line A(10) - C(20) direct (capacity 40) plus a long detour A(10) - B(40) - C(20) (capacity 4000 each).
 * Only A generates coal (1000), only C accepts it, so there is exactly one demand pair A->C of 1000 units.
 */
function cappedLine(opts = {}) {
  const g = flatGame(5);
  const s = g.state;
  setSetting(s, 'freightDistribution', 'asymmetric');
  if (opts.routing !== undefined) setSetting(s, 'cargodistCapacityRouting', opts.routing);
  if (opts.mcf) setSetting(s, 'cargodistMcf', true);
  for (const [x, y] of [[10, 24], [40, 24], [20, 24]]) expect(g.buildRailStation(x, y, 'x', 3).ok).toBe(true);
  expect(g.buildRail(10, 24, 20, 24).ok).toBe(true);
  expect(g.buildRail(10, 24, 40, 24).ok).toBe(true);
  placeIndustry(s, 'coal_mine', 8, 20);
  placeIndustry(s, 'power_station', 18, 20);
  const [A, B, C] = s.stations.slice(-3);
  recomputeAllAcceptance(s);
  expect(A.accepts.COAL).toBeUndefined();
  expect(C.accepts.COAL).toBe(true);
  const e = (x, y, cap) => noteLeg(s, x, y.id, [{ cargoId: 'COAL', capacity: cap }]);
  // insertion order is varied by the caller to prove the solver does not depend on it
  const legs = [
    () => e(A, C, 40), () => e(A, B, 4000), () => e(B, C, 4000),
    () => e(C, A, 4000), () => e(B, A, 4000), () => e(C, B, 4000),
  ];
  for (const leg of opts.reversed ? legs.slice().reverse() : legs) leg();
  A.cdSupply = { COAL: 1000 };
  return { s, A, B, C };
}

const graphJson = (s) => JSON.stringify({ dem: s.cargoDist.COAL.dem, nh: s.cargoDist.COAL.nh, nhs: s.cargoDist.COAL.nhs });

describe('D18 capacity routing', () => {
  test('off (default): no flow table, one shortest-path next hop, same as before', () => {
    const { s, A, B, C } = cappedLine({});
    expect(cdCapacityRoutingOn(s)).toBe(false);
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(s.cargoDist.COAL.nhs).toEqual({}); // no per-via flow splits
    expect(nextHop(s, 'COAL', A.id, C.id)).toBe(C.id); // direct short link
    expect(nextHops(s, 'COAL', A.id, C.id)).toEqual([C.id]);
    expect(s.cargoDist.COAL.nh[A.id][B.id]).toBe(B.id); // B is only a detour, still one hop
    // explicitly setting it false is byte-identical to the default
    const base = cappedLine({});
    rebuildGraph(base.s, 'COAL', 'asymmetric');
    const off = cappedLine({ routing: false });
    rebuildGraph(off.s, 'COAL', 'asymmetric');
    expect(graphJson(off.s)).toBe(graphJson(base.s));
  });

  test('on: deterministic (same graph twice, and independent of edge insertion order)', () => {
    const a = cappedLine({ routing: true });
    rebuildGraph(a.s, 'COAL', 'asymmetric');
    const b = cappedLine({ routing: true });
    rebuildGraph(b.s, 'COAL', 'asymmetric');
    expect(graphJson(a.s)).toBe(graphJson(b.s));
    const r = cappedLine({ routing: true, reversed: true });
    rebuildGraph(r.s, 'COAL', 'asymmetric');
    expect(graphJson(r.s)).toBe(graphJson(a.s));
    expect(cdCapacityRoutingOn(a.s)).toBe(true);
  });

  test('on: the short link is capped, overflow uses the long detour, all demand is assigned', () => {
    const { s, A, B, C } = cappedLine({ routing: true });
    rebuildGraph(s, 'COAL', 'asymmetric');
    const flows = s.cargoDist.COAL.nhs[A.id][C.id];
    expect(Array.isArray(flows)).toBe(true);
    const hops = Object.fromEntries(flows.map(([h, sh]) => [h, sh]));
    expect(Object.keys(hops).map(Number).sort((x, y) => x - y)).toEqual([B.id, C.id].sort((x, y) => x - y));
    // 1000 units on the pair: the direct hop never exceeds the 40-unit link capacity
    expect(hops[C.id] * 1000).toBeLessThanOrEqual(40 + 1e-9);
    expect(hops[B.id] * 1000).toBeGreaterThan(900);
    expect(hops[C.id] + hops[B.id]).toBeCloseTo(1, 9);
    // the single unload next hop is the largest share (the detour here)
    expect(nextHop(s, 'COAL', A.id, C.id)).toBe(B.id);
    expect(nextHops(s, 'COAL', A.id, C.id).length).toBe(2);
  });

  test('routing only: the demand matrix is unchanged by the new solver', () => {
    const mcf = cappedLine({ mcf: true });
    rebuildGraph(mcf.s, 'COAL', 'asymmetric');
    const plain = cappedLine({ mcf: true, routing: true });
    rebuildGraph(plain.s, 'COAL', 'asymmetric');
    expect(JSON.stringify(plain.s.cargoDist.COAL.dem)).toBe(JSON.stringify(mcf.s.cargoDist.COAL.dem));
    // and both leave every row normalised to 1
    for (const row of Object.values(plain.s.cargoDist.COAL.dem)) {
      expect(row.reduce((n, [, v]) => n + v, 0)).toBeCloseTo(1, 9);
    }
  });
});

/**
 * Five stations whose shortest A->E path differs between the two metrics:
 * manhattan A(25,30)-B(10,33)-D(10,24)-E(28,30) = 51 vs A-C-E = 57, but openTTD (max+manhattan+1)
 * A-C-E = 89 vs A-B-D-E = 96 (the manhattan detour is more diagonal per edge).
 */
function metricNet(opts = {}) {
  const g = flatGame(5);
  const s = g.state;
  setSetting(s, 'cargodist', 'asymmetric');
  if (opts.routing !== undefined) setSetting(s, 'cargodistCapacityRouting', opts.routing);
  if (opts.mcf) setSetting(s, 'cargodistMcf', true);
  for (const [x, y] of [[25, 30], [10, 33], [13, 15], [10, 24], [28, 30]]) expect(g.buildRailStation(x, y, 'x', 1).ok).toBe(true);
  const [A, B, C, D, E] = s.stations.slice(-5);
  const legs = [[A, B], [A, C], [B, C], [B, D], [C, D], [C, E], [D, E]];
  for (const [u, v] of legs) {
    noteLeg(s, u, v.id, [{ cargoId: 'PASS', capacity: 4000 }]);
    noteLeg(s, v, u.id, [{ cargoId: 'PASS', capacity: 4000 }]);
  }
  A.cdSupply = { PASS: 1000 };
  return { s, A, B, C, D, E };
}

describe('D18 routing metric', () => {
  test('ottdDistance is DistanceMaxPlusManhattan + 1 (integer, symmetric, strictly positive)', () => {
    expect(ottdDistance([0, 0], [3, 0])).toBe(3 + 0 + 3 + 1);
    expect(ottdDistance([0, 0], [0, 4])).toBe(0 + 4 + 4 + 1);
    expect(ottdDistance([0, 0], [3, 4])).toBe(3 + 4 + 4 + 1);
    expect(ottdDistance([2, 2], [0, 0])).toBe(7); // diagonal: dx+dy+max+1
    expect(ottdDistance([1, 2], [1, 2])).toBe(1); // same tile: only the +1
    expect(ottdDistance([1, 7], [9, 3])).toBe(ottdDistance([9, 3], [1, 7]));
    expect(Number.isInteger(ottdDistance([1, 2], [4, 6]))).toBe(true);
    for (const [a, b] of [[[0, 0], [3, 0]], [[0, 0], [3, 4]], [[2, 2], [0, 0]]]) {
      const dx = Math.abs(a[0] - b[0]), dy = Math.abs(a[1] - b[1]);
      expect(ottdDistance(a, b)).toBeGreaterThan(dx + dy); // manhattan for distinct tiles
    }
  });

  test('default (opt-ins off) routing stays on manhattan; both opt-in solvers switch to the OpenTTD metric', () => {
    const base = metricNet({});
    rebuildGraph(base.s, 'PASS', 'asymmetric');
    expect(nextHop(base.s, 'PASS', base.A.id, base.E.id)).toBe(base.B.id); // manhattan A-B-D-E
    expect(nextHops(base.s, 'PASS', base.A.id, base.E.id)).toEqual([base.B.id]);

    for (const opts of [{ mcf: true }, { routing: true }]) {
      const net = metricNet(opts);
      rebuildGraph(net.s, 'PASS', 'asymmetric');
      expect(nextHop(net.s, 'PASS', net.A.id, net.E.id)).toBe(net.C.id); // openTTD A-C-E
      // the demand matrix itself is unchanged by routing (metric affects paths only)
      expect(JSON.stringify(net.s.cargoDist.PASS.dem[net.A.id]))
        .toBe(JSON.stringify(base.s.cargoDist.PASS.dem[base.A.id]));
      for (const row of Object.values(net.s.cargoDist.PASS.dem)) {
        expect(row.reduce((n, [, v]) => n + v, 0)).toBeCloseTo(1, 9);
      }
      // flow shares are normalised per (source, destination) and pick the openTTD-metric first hop C
      const shares = net.s.cargoDist.PASS.nhs[net.A.id][net.E.id];
      expect(shares.reduce((n, [, v]) => n + v, 0)).toBeCloseTo(1, 9);
      expect(shares.map(([hop]) => hop)).toEqual([net.C.id]);
      for (const byDest of Object.values(net.s.cargoDist.PASS.nhs)) {
        for (const list of Object.values(byDest)) expect(list.reduce((n, [, v]) => n + v, 0)).toBeCloseTo(1, 9);
      }
      // deterministic: same graph, same metric -> identical demand/next-hop tables
      const again = metricNet(opts);
      rebuildGraph(again.s, 'PASS', 'asymmetric');
      expect(JSON.stringify(again.s.cargoDist.PASS.nh)).toBe(JSON.stringify(net.s.cargoDist.PASS.nh));
      expect(JSON.stringify(again.s.cargoDist.PASS.nhs)).toBe(JSON.stringify(net.s.cargoDist.PASS.nhs));
    }
  });
});
