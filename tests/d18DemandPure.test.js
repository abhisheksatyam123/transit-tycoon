/**
 * D18: pure demand core (computeDemand). The default integrated path funnels through the same function, so the
 * pure call must reproduce the link graph's demand rows and next-hop table byte for byte, and stay deterministic.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import {
  computeDemand, shortest, acceptanceOf, rebuildGraph, noteLeg, demandSizeExponent, demandDistanceK,
} from '../js/simulation/cargodist.js';
import { recomputeAllAcceptance } from '../js/simulation/stations.js';
import { setSetting } from '../js/simulation/settings.js';

/** Line A(10,24) - B(25,24) - C(40,24), capped legs in both directions. */
function paxLine(mode) {
  const g = flatGame(5);
  const s = g.state;
  setSetting(s, 'cargodist', mode);
  for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(25, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
    g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
  const [A, B, C] = s.stations.slice(-3);
  for (const [from, to] of [[A, B], [B, C], [B, A], [C, B]]) noteLeg(s, from, to.id, [{ cargoId: 'PASS', capacity: 40 }]);
  A.cdSupply = { PASS: 200 }; B.cdSupply = { PASS: 100 }; C.cdSupply = { PASS: 100 };
  return { s, A, B, C };
}

/** Node ids referenced by the graph's live (capacity-carrying) edges, sorted. */
function graphNodes(s, cargoId) {
  const g = s.cargoDist[cargoId];
  const ids = new Set();
  for (const e of Object.values(g.edges)) if (e.cap > 0) { ids.add(e.a); ids.add(e.b); }
  return [...ids].sort((a, b) => a - b);
}

/** Rebuild the same routing inputs computeJob passes to computeDemand (positions/adjacency from the state). */
function demandTrees(s, cargoId, nodes) {
  const g = s.cargoDist[cargoId];
  const adj = new Map(), pos = new Map();
  for (const e of Object.values(g.edges)) {
    if (!(e.cap > 0)) continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    adj.get(e.a).push(e.b);
  }
  for (const st of s.stations) if (nodes.includes(st.id)) pos.set(st.id, [st.x, st.y]);
  const trees = new Map(nodes.map((n) => [n, shortest(n, adj, pos)]));
  return trees;
}

/** Supply since the last job: read before rebuildGraph, which resets every station's counter. */
function supplyOf(s, cargoId, nodes) {
  const supply = new Map();
  for (const st of s.stations) {
    if (!st.cdSupply) continue;
    if (nodes.includes(st.id)) supply.set(st.id, st.cdSupply[cargoId] || 0);
  }
  for (const n of nodes) if (!supply.has(n)) supply.set(n, 0);
  return supply;
}

/** Capture the pure inputs for a rebuild, run the integrated rebuild, and return both results. */
function integratedAndPure(s, cargoId, mode) {
  const nodesBefore = [...new Set(Object.values(s.cargoDist[cargoId].edges).flatMap((e) => [e.a, e.b]))].sort((a, b) => a - b);
  const supply = supplyOf(s, cargoId, nodesBefore);
  const freight = cargoId !== 'PASS' && cargoId !== 'MAIL';
  const acceptance = freight ? acceptanceOf(s, cargoId, new Set(nodesBefore)) : null;
  rebuildGraph(s, cargoId, mode);
  const g = s.cargoDist[cargoId];
  const nodes = graphNodes(s, cargoId);
  const trees = demandTrees(s, cargoId, nodes);
  const pure = computeDemand({
    nodes, trees, supply, mode, freight, acceptance,
    sizeExp: demandSizeExponent(s), distK: demandDistanceK(s),
  });
  return { g, pure, nodes, supply, trees };
}

const json = (x) => JSON.stringify(x);

describe('D18 pure demand core', () => {
  test('symmetric: pure computeDemand reproduces the integrated dem matrix and next hops exactly', () => {
    const { s } = paxLine('symmetric');
    const { g, pure } = integratedAndPure(s, 'PASS', 'symmetric');
    expect(json(pure.dem)).toBe(json(g.dem));
    expect(json(pure.nh)).toBe(json(g.nh));
    expect(pure.pairs.length).toBeGreaterThan(0);
  });

  test('asymmetric: pure computeDemand reproduces the integrated dem matrix exactly', () => {
    const { s } = paxLine('asymmetric');
    const { g, pure } = integratedAndPure(s, 'PASS', 'asymmetric');
    expect(json(pure.dem)).toBe(json(g.dem));
    expect(json(pure.nh)).toBe(json(g.nh));
  });

  test('freight: pure computeDemand reproduces the integrated matrix (acceptance weights, acceptance gate)', () => {
    const g = flatGame(5);
    const s = g.state;
    setSetting(s, 'freightDistribution', 'asymmetric');
    for (const [x, y] of [[10, 24], [25, 24], [40, 24]]) expect(g.buildRailStation(x, y, 'x', 3).ok).toBe(true);
    expect(g.buildRail(13, 24, 39, 24).ok).toBe(true);
    placeIndustry(s, 'coal_mine', 8, 20);
    placeIndustry(s, 'power_station', 38, 20);
    const [A, B, C] = s.stations.slice(-3);
    recomputeAllAcceptance(s);
    for (const [from, to] of [[A, B], [B, C], [B, A], [C, B]]) noteLeg(s, from, to.id, [{ cargoId: 'COAL', capacity: 40 }]);
    A.cdSupply = { COAL: 300 }; B.cdSupply = { COAL: 50 }; C.cdSupply = { COAL: 100 };
    const { g: graph, pure } = integratedAndPure(s, 'COAL', 'asymmetric');
    expect(json(pure.dem)).toBe(json(graph.dem));
    expect(json(pure.nh)).toBe(json(graph.nh));
    // only stations with acceptance are destinations; the coal mine station itself never accepts
    const destinations = new Set(pure.pairs.map((p) => p.d));
    for (const d of destinations) expect(acceptanceOf(s, 'COAL', new Set([d])).get(d)).toBeGreaterThan(0);
  });

  test('deterministic: repeated pure calls and a rebuilt input set agree byte for byte', () => {
    const { s } = paxLine('symmetric');
    const { nodes, supply, trees } = integratedAndPure(s, 'PASS', 'symmetric');
    const inputs = { nodes, trees, supply, mode: 'symmetric', freight: false, sizeExp: 1, distK: 0 };
    const a = computeDemand(inputs), b = computeDemand(inputs);
    expect(json(a)).toBe(json(b));
    // fresh maps with the same contents produce the same result
    const trees2 = demandTrees(s, 'PASS', nodes);
    const c = computeDemand({ ...inputs, trees: trees2, supply: new Map(supply) });
    expect(json(c)).toBe(json(a));
  });

  test('invariants: per-source shares sum to 1, symmetric pairs are mirrored, asymmetric is the forward row', () => {
    const { s } = paxLine('symmetric');
    const { nodes, supply, trees } = integratedAndPure(s, 'PASS', 'symmetric');
    const sym = computeDemand({ nodes, trees, supply, mode: 'symmetric', freight: false });
    const asym = computeDemand({ nodes, trees, supply, mode: 'asymmetric', freight: false });
    for (const row of Object.values(sym.dem)) expect(row.reduce((n, [, a]) => n + a, 0)).toBeCloseTo(1, 12);
    for (const row of Object.values(asym.dem)) expect(row.reduce((n, [, a]) => n + a, 0)).toBeCloseTo(1, 12);
    const pair = (r, sId, dId) => (r.pairs.find((p) => p.s === sId && p.d === dId) || {}).amt;
    for (const p of sym.pairs) expect(p.amt).toBeCloseTo(pair(sym, p.d, p.s), 12);
    // symmetric amount = mean of the two asymmetric raw demands (the unchanged TT rule)
    for (const p of sym.pairs) expect(p.amt).toBeCloseTo((pair(asym, p.s, p.d) + pair(asym, p.d, p.s)) / 2, 12);
  });

  test('invariant: freight destinations are gated by acceptance (zero acceptance = no demand row)', () => {
    const nodes = [1, 2, 3];
    const trees = new Map([
      [1, { dist: new Map([[1, 0], [2, 4], [3, 8]]), first: new Map([[2, 2], [3, 2]]) }],
      [2, { dist: new Map([[2, 0], [1, 4], [3, 4]]), first: new Map([[1, 1], [3, 3]]) }],
      [3, { dist: new Map([[3, 0], [2, 4], [1, 8]]), first: new Map([[2, 2], [1, 2]]) }],
    ]);
    const supply = new Map([[1, 100], [2, 100], [3, 100]]);
    const acceptance = new Map([[1, 0], [2, 0], [3, 12]]);
    const out = computeDemand({ nodes, trees, supply, mode: 'asymmetric', freight: true, acceptance });
    expect(Object.keys(out.dem)).toEqual(['1', '2']);
    for (const row of Object.values(out.dem)) expect(row.map(([d]) => d)).toEqual([3]);
    // pax (no acceptance gate) reaches every reachable node
    const pax = computeDemand({ nodes, trees, supply, mode: 'asymmetric', freight: false });
    expect(Object.keys(pax.dem).sort()).toEqual(['1', '2', '3']);
  });
});
