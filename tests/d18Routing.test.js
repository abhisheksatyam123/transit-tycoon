/** D18: OpenTTD-style batched capacity routing (setting cargodistCapacityRouting, off by default). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { rebuildGraph, nextHop, nextHops, noteLeg, cdCapacityRoutingOn } from '../js/simulation/cargodist.js';
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
