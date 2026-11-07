/** Link graph settings (OpenTTD LinkGraphSettings): schedule, per-class distribution, demand and MCF knobs. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { rebuildGraph, updateMonthly, noteLeg, cdMode, cdApplies, cdCargoList, mcfAugment, mcfSaturation } from '../js/simulation/cargodist.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';

/** Line A(10,24) - B(25,24) - C(40,24) of rail stations; A has the supply, B and C the same. */
function line(mode) {
  const g = flatGame(5);
  if (mode) setSetting(g.state, 'cargodist', mode);
  const s = g.state;
  for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(25, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
    g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
  const [A, B, C] = s.stations.slice(-3);
  s.date = { year: 2000, month: 1, day: 1 };
  noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
  noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
  noteLeg(s, B, A.id, [{ cargoId: 'PASS', capacity: 40 }]);
  noteLeg(s, C, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
  A.cdSupply = { PASS: 200 }; B.cdSupply = { PASS: 100 }; C.cdSupply = { PASS: 100 };
  return { s, A, B, C };
}
const share = (s, id, dest) => Object.fromEntries(s.cargoDist.PASS.dem[id])[dest];

describe('linkgraph settings', () => {
  test('defaults reproduce the current behaviour: monthly rebuild, same routing as rebuildGraph', () => {
    const a = line('symmetric'), b = line('symmetric');
    rebuildGraph(a.s, 'PASS', 'symmetric');
    updateMonthly(b.s);
    expect(b.s.cargoDist.PASS.dem).toEqual(a.s.cargoDist.PASS.dem);
    expect(b.s.cargoDist.PASS.nh).toEqual(a.s.cargoDist.PASS.nh);
    expect(b.s.cargoDist.PASS.pending).toBeUndefined();
    expect(getSetting(b.s, 'linkgraphRecalcInterval')).toBe(1);
    expect(getSetting(b.s, 'linkgraphRecalcTime')).toBe(0);
    expect(getSetting(b.s, 'linkgraphDemandDistance')).toBe(0);
    expect(mcfAugment(b.s)).toBe(8);
    expect(mcfSaturation(b.s)).toBe(100);
    expect(DEFAULT_SETTINGS.linkgraphAccuracy).toBe(16);
  });

  test('demand_distance 0 vs 100: 100 sends fewer passengers to the farther station', () => {
    const off = line('symmetric');
    rebuildGraph(off.s, 'PASS', 'symmetric');
    // B (15 tiles away) and C (30 tiles away) have equal supply: no distance effect -> equal split
    expect(share(off.s, off.A.id, off.B.id)).toBeCloseTo(share(off.s, off.A.id, off.C.id), 6);

    const on = line('symmetric');
    setSetting(on.s, 'linkgraphDemandDistance', 100);
    rebuildGraph(on.s, 'PASS', 'symmetric');
    expect(share(on.s, on.A.id, on.B.id)).toBeGreaterThan(share(on.s, on.A.id, on.C.id));
    expect(share(on.s, on.A.id, on.B.id) + share(on.s, on.A.id, on.C.id)).toBeCloseTo(1, 6);
  });

  test('demand_size 0: supply no longer weights destinations', () => {
    const { s, A, B, C } = line('symmetric');
    setSetting(s, 'linkgraphDemandSize', 0);
    B.cdSupply = { PASS: 300 }; C.cdSupply = { PASS: 100 };
    rebuildGraph(s, 'PASS', 'symmetric');
    expect(share(s, A.id, B.id)).toBeCloseTo(share(s, A.id, C.id), 6);
  });

  test('recalc_time 3 delays applying a job by three months', () => {
    const { s, A, B, C } = line('symmetric');
    setSetting(s, 'linkgraphRecalcTime', 3);
    updateMonthly(s); // month 1: job starts, result pending
    expect(s.cargoDist.PASS.pending).toBeDefined();
    expect(s.cargoDist.PASS.dem[A.id]).toBeUndefined();
    s.date.month = 2; updateMonthly(s);
    expect(s.cargoDist.PASS.dem[A.id]).toBeUndefined();
    s.date.month = 3; updateMonthly(s);
    expect(s.cargoDist.PASS.dem[A.id]).toBeUndefined(); // due at 1 + 3 = 4
    s.date.month = 4; updateMonthly(s);
    expect(s.cargoDist.PASS.dem[A.id]).toBeDefined();
    expect(share(s, A.id, B.id) + share(s, A.id, C.id)).toBeCloseTo(1, 6);
  });

  test('recalc_interval 3 starts a job only every third month', () => {
    const { s } = line('symmetric');
    setSetting(s, 'linkgraphRecalcInterval', 3);
    const starts = [];
    for (let m = 1; m <= 6; m++) {
      s.date.month = m;
      const before = s.cargoDist.PASS.month;
      updateMonthly(s);
      if (s.cargoDist.PASS.month !== before) starts.push(m);
    }
    expect(starts).toEqual([3, 6]);
  });

  test('distribution manual for pax disables per-destination routing for that class', () => {
    const { s } = line('symmetric');
    expect(cdMode(s, 'PASS')).toBe('symmetric');
    setSetting(s, 'linkgraphDistributionPax', 'manual');
    expect(cdMode(s, 'PASS')).toBe('manual');
    expect(cdApplies(s, 'PASS')).toBe(false);
    expect(cdCargoList(s)).not.toContain('PASS');
    expect(cdApplies(s, 'MAIL')).toBe(true);
  });

  test('per-class setting cannot enable pax distribution while the cargodist master switch is off', () => {
    const { s } = line(null);
    setSetting(s, 'linkgraphDistributionPax', 'symmetric');
    expect(cdApplies(s, 'PASS')).toBe(false);
  });

  test('mcf accuracy and short path saturation map to augmenting paths and capacity fraction', () => {
    const { s } = line('symmetric');
    setSetting(s, 'linkgraphAccuracy', 4);
    expect(mcfAugment(s)).toBe(2);
    setSetting(s, 'linkgraphShortPathSaturation', 80);
    expect(mcfSaturation(s)).toBe(80);
  });
});
