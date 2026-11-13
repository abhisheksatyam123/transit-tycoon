/**
 * splitVia / assignVia: the hoisted sent-total + edge-key refactor must be byte-identical to the
 * per-unit assignVia reference, including the sent counters it leaves in the graph.
 */
import { test, expect, describe } from 'bun:test';
import { splitVia, loadFilter, edgeKey } from '../js/simulation/cargodist.js';

/** Per-unit reference (the pre-refactor implementation, kept verbatim as the oracle). */
function refAssignVia(state, cargoId, st, flows, amount, dest) {
  const g = state.cargoDist[cargoId];
  if (!g.sent) g.sent = {};
  const key = edgeKey(st.id, dest ?? null);
  const row = g.sent[key] || (g.sent[key] = {});
  let total = 0;
  for (const h of Object.keys(row)) total += row[h];
  let best = null, bestDef = -Infinity;
  for (const [h, share] of flows) {
    const def = share * (total + amount) - (row[h] || 0);
    if (def > bestDef + 1e-12) { best = h; bestDef = def; }
  }
  row[best] = (row[best] || 0) + amount;
  return best;
}

function refSplitVia(state, st, cargoId, dest, amount) {
  const flows = state.cargoDist[cargoId].nhs[st.id][dest];
  if (!flows || flows.length < 2 || !(amount > 0)) return [{ via: undefined, amount }];
  const got = new Map();
  for (let u = 0; u < amount; u++) {
    const h = refAssignVia(state, cargoId, st, flows, 1, dest);
    got.set(h, (got.get(h) || 0) + 1);
  }
  return [...got.entries()].map(([via, n]) => ({ via, amount: n })).sort((a, b) => a.via - b.via);
}

function fixture({ vias, shares, sent }) {
  const state = { cargoDist: { PASS: { month: 0, edges: {}, dem: {}, nh: {}, nodes: [] } } };
  const st = { id: 7 };
  const g = state.cargoDist.PASS;
  g.nhs = { [st.id]: { 42: vias.map((h, i) => [h, shares[i]]) } };
  if (sent) g.sent = { [edgeKey(st.id, 42)]: { ...sent } };
  return { state, st };
}

describe('splitVia equivalence', () => {
  test('randomized splits match the per-unit reference and leave identical sent counters', () => {
    let seed = 987654321;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let c = 0; c < 300; c++) {
      const n = 2 + Math.floor(rnd() * 4); // 2..5 vias
      const pool = [11, 12, 13, 21, 22, 23, 31, 32, 41, 42, 51, 99];
      const vias = [];
      while (vias.length < n) {
        const h = pool[Math.floor(rnd() * pool.length)];
        if (!vias.includes(h)) vias.push(h);
      }
      vias.sort((a, b) => a - b);
      const raw = vias.map(() => 0.1 + rnd());
      const sum = raw.reduce((a, b) => a + b, 0);
      const shares = raw.map((w) => w / sum); // sum 1, unlike an even split, to exercise deficits
      const sent = {};
      for (const h of vias) if (rnd() < 0.6) sent[h] = Math.floor(rnd() * 500);
      const amount = Math.floor(rnd() * 200); // includes 0 (single-route fallback)

      const a = fixture({ vias, shares, sent });
      const b = fixture({ vias, shares, sent });
      const got = splitVia(a.state, a.st, 'PASS', 42, amount);
      const want = refSplitVia(b.state, b.st, 'PASS', 42, amount);
      expect(got).toEqual(want);
      expect(a.state.cargoDist.PASS.sent).toEqual(b.state.cargoDist.PASS.sent);
      if (amount > 0) {
        expect(got.reduce((s, v) => s + v.amount, 0)).toBe(amount);
      }
    }
  });

  test('bulk via pick (loadFilter / assignVia amount > 1) matches the reference', () => {
    let seed = 424242;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let c = 0; c < 100; c++) {
      const n = 2 + Math.floor(rnd() * 3);
      const vias = [11, 17, 23, 29, 31].slice(0, n);
      const raw = vias.map(() => 0.2 + rnd());
      const sum = raw.reduce((a, b) => a + b, 0);
      const shares = raw.map((w) => w / sum);
      const p = { amount: 1 + Math.floor(rnd() * 50), dest: 42, sourceX: 0, sourceY: 0, sinceTick: 0 };
      const a = fixture({ vias, shares });
      const b = fixture({ vias, shares });
      const pred = loadFilter(a.state, a.st, 'PASS', 11);
      const f = pred(p);
      refAssignVia(b.state, 'PASS', b.st, vias.map((h, i) => [h, shares[i]]), p.amount, 42);
      // loadFilter only loads when the assigned via is the next stop; compare the chosen via + counters
      expect(a.state.cargoDist.PASS.sent).toEqual(b.state.cargoDist.PASS.sent);
      expect(Object.keys(a.state.cargoDist.PASS.sent[edgeKey(7, 42)])).toHaveLength(1);
      expect(f).toBe(p.via === 11);
    }
  });
});
