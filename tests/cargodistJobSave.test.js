/** Pending link-graph job (linkgraphRecalcTime > 0) survives save/load and applies identically. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';
import { noteLeg, updateMonthly } from '../js/simulation/cargodist.js';
import { setSetting } from '../js/simulation/settings.js';

describe('cargodist: pending link-graph job save', () => {
  // Explicit timeout: this test drives two games for ~2 months of ticks (twice the work of a
  // normal test). Under a loaded machine (full `bun test` run) that can exceed Bun's 5 s
  // default, so the work gets a generous bound instead of being shrunk. The standalone cost
  // is ~1.2 s, so 30 s keeps >4x margin even on a heavily loaded host.
  test('pending job (non-empty) survives save/load; loaded and original agree after it is applied', () => {
    const g = flatGame(5);
    const s = g.state;
    setSetting(s, 'cargodistDemandParity', false);
    setSetting(s, 'cargodist', 'symmetric');
    setSetting(s, 'linkgraphRecalcTime', 2);
    for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(25, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
      g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
    const [A, B, C] = s.stations.slice(-3);
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, A.id, [{ cargoId: 'PASS', capacity: 40 }]);
    B.cdSupply = { PASS: 300 }; C.cdSupply = { PASS: 100 }; A.cdSupply = { PASS: 200 };
    // start a job at the current month (pending, due in 2 months)
    updateMonthly(s);
    const pend = s.cargoDist.PASS.pending;
    expect(pend).toBeDefined();
    expect(pend.res.nodes.length).toBeGreaterThan(1);
    expect(Object.keys(pend.res.dem).length).toBeGreaterThan(0);
    const due = pend.due;
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.cargoDist.PASS.pending).toEqual(pend);
    // advance both copies past due
    let guard = 0;
    while (g.state.date.year * 12 + g.state.date.month <= due && guard++ < 100000) { g.step(); g2.step(); }
    // the job was applied at due (flows now set) and the next job started in the same month
    expect(g.state.cargoDist.PASS.nodes.length).toBeGreaterThan(1);
    expect(g.state.cargoDist.PASS.pending.due).toBeGreaterThan(due);
    expect(g2.state.cargoDist).toEqual(g.state.cargoDist);
    expect(g2.serialize()).toBe(g.serialize());
  }, 30000);
});
