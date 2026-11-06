/** Freight distribution (freightDistribution = asymmetric) and capacity-constrained routing (cargodistMcf). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { rebuildGraph, nextHop, nextHops, splitByDest, noteLeg, edgeKey } from '../js/simulation/cargodist.js';
import { addWaiting, recomputeAllAcceptance } from '../js/simulation/stations.js';
import { setSetting } from '../js/simulation/settings.js';

/** Mine station M (coal source) and two power stations P1 (big catchment) / P2 (small) on a rail line. */
function freightNet(opts = {}) {
  const g = flatGame(5);
  const s = g.state;
  if (opts.freight !== undefined) setSetting(s, 'freightDistribution', opts.freight);
  if (opts.mcf) setSetting(s, 'cargodistMcf', true);
  for (const [x, y] of [[10, 24], [25, 24], [40, 24]]) expect(g.buildRailStation(x, y, 'x', 3).ok).toBe(true);
  expect(g.buildRail(13, 24, 39, 24).ok).toBe(true);
  placeIndustry(s, 'coal_mine', 8, 20);
  placeIndustry(s, 'power_station', 23, 20);
  placeIndustry(s, 'power_station', 38, 20);
  const [M, P1, P2] = s.stations.slice(-3);
  recomputeAllAcceptance(s);
  return { g, s, M, P1, P2 };
}

describe('freight distribution', () => {
  test('manual (default): no freight graph, freight keeps no destinations', () => {
    const { s, M, P1 } = freightNet({});
    noteLeg(s, M, P1.id, [{ cargoId: 'COAL', capacity: 40 }]);
    expect(s.cargoDist).toBeUndefined();
    addWaiting(M, 'COAL', 10, M.x, M.y, 0, 4000, 0, null);
    expect(M.cargo.COAL[0].dest).toBeUndefined();
  });

  test('asymmetric: coal from one mine station splits between the two accepting power stations by acceptance', () => {
    const { s, M, P1, P2 } = freightNet({ freight: 'asymmetric' });
    expect(P1.accepts.COAL).toBe(true);
    expect(P2.accepts.COAL).toBe(true);
    expect(M.accepts.COAL).toBeUndefined();
    noteLeg(s, M, P1.id, [{ cargoId: 'COAL', capacity: 40 }]);
    noteLeg(s, M, P2.id, [{ cargoId: 'COAL', capacity: 40 }]);
    noteLeg(s, P1, M.id, [{ cargoId: 'COAL', capacity: 40 }]);
    noteLeg(s, P2, M.id, [{ cargoId: 'COAL', capacity: 40 }]);
    M.cdSupply = { COAL: 1000 };
    rebuildGraph(s, 'COAL', 'asymmetric');
    const parts = splitByDest(s, M, 'COAL', 1000);
    const byDest = Object.fromEntries(parts.map((p) => [p.dest, p.amount]));
    expect(byDest[P1.id] + byDest[P2.id]).toBe(1000);
    expect(byDest[P1.id]).toBeGreaterThan(0);
    expect(byDest[P2.id]).toBeGreaterThan(0);
    // no return demand: the power stations send no coal back to the mine (not an accepting destination)
    expect(byDest[M.id]).toBeUndefined();
  });

  test('asymmetric: a non-accepting station never becomes a freight destination', () => {
    const { s, M, P1, P2 } = freightNet({ freight: 'asymmetric' });
    // M does not accept coal; remove P2 from accepting by checking the destination set only has acceptors
    noteLeg(s, M, P1.id, [{ cargoId: 'COAL', capacity: 40 }]);
    noteLeg(s, M, P2.id, [{ cargoId: 'COAL', capacity: 40 }]);
    M.cdSupply = { COAL: 500 };
    rebuildGraph(s, 'COAL', 'asymmetric');
    const dests = splitByDest(s, M, 'COAL', 500).map((p) => p.dest);
    for (const d of dests) if (d !== undefined) expect([P1.id, P2.id]).toContain(d);
  });

  test('pax setting is independent: freight asymmetric does not touch passengers', () => {
    const { s, M, P1 } = freightNet({ freight: 'asymmetric' });
    noteLeg(s, M, P1.id, [{ cargoId: 'PASS', capacity: 40 }]);
    expect(s.cargoDist && s.cargoDist.PASS).toBeUndefined();
  });
});

describe('capacity-constrained routing (MCF)', () => {
  /** Stations A(10), B(25), C(40) on a line; A->B short link, A->C->B detour. */
  function diamond(mcf) {
    const { s, M: A, P1: B, P2: C } = freightNet({ freight: 'asymmetric', mcf });
    const e = (x, y, cap) => { noteLeg(s, x, y.id, [{ cargoId: 'COAL', capacity: cap }]); };
    e(A, B, 40); e(A, C, 4000); e(C, B, 4000); e(B, A, 40); e(C, A, 4000); e(B, C, 4000);
    A.cdSupply = { COAL: 1000 }; B.cdSupply = { COAL: 1000 }; C.cdSupply = { COAL: 1000 };
    rebuildGraph(s, 'COAL', 'asymmetric');
    return { s, A, B, C };
  }

  test('mcf off: one next hop per destination (shortest path), no flow table', () => {
    const { s, A, B } = diamond(false);
    expect(s.cargoDist.COAL.nhs).toEqual({});
    expect(nextHop(s, 'COAL', A.id, B.id)).toBe(B.id);
    expect(nextHops(s, 'COAL', A.id, B.id)).toEqual([B.id]);
  });

  test('mcf on: the short link saturates, the overflow takes the longer detour via C', () => {
    const { s, A, B, C } = diamond(true);
    const flows = s.cargoDist.COAL.nhs[A.id][B.id];
    const hops = Object.fromEntries(flows.map(([h, sh]) => [h, sh]));
    expect(Object.keys(hops).map(Number).sort()).toEqual([B.id, C.id].sort((a, b) => a - b));
    expect(hops[B.id]).toBeGreaterThan(0);
    expect(hops[C.id]).toBeGreaterThan(0);
    expect(hops[B.id] + hops[C.id]).toBeCloseTo(1, 9);
    // the direct link has 40 units of capacity: its share is far below the overflow
    expect(hops[C.id]).toBeGreaterThan(hops[B.id]);
    expect(nextHops(s, 'COAL', A.id, B.id).length).toBe(2);
  });

  test('mcf is deterministic: same graph, same flows', () => {
    const a = diamond(true).s.cargoDist.COAL.nhs;
    const b = diamond(true).s.cargoDist.COAL.nhs;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(edgeKey(1, 2)).toBe('1>2');
  });
});
