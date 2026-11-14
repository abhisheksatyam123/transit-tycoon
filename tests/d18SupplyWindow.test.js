/** D18: supply accumulator with the OpenTTD 256-day halving (opt-in: setting cargodistDemandParity, off by default). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { rebuildGraph, noteLeg, noteSupplyAcc, compressSupply, COMPRESSION_INTERVAL_DAYS } from '../js/simulation/cargodist.js';
import { recomputeAllAcceptance } from '../js/simulation/stations.js';
import { setSetting } from '../js/simulation/settings.js';

/** Coal line A(10) -> C(20) with a power station accepting at C. */
function coalLine(parity) {
  const g = flatGame(5);
  const s = g.state;
  setSetting(s, 'freightDistribution', 'asymmetric');
  if (parity) setSetting(s, 'cargodistDemandParity', true);
  expect(g.buildRailStation(10, 24, 'x', 3).ok).toBe(true);
  expect(g.buildRailStation(20, 24, 'x', 3).ok).toBe(true);
  expect(g.buildRail(10, 24, 20, 24).ok).toBe(true);
  placeIndustry(s, 'power_station', 18, 20);
  const [A, C] = s.stations.slice(-2);
  recomputeAllAcceptance(s);
  expect(C.accepts.COAL).toBe(true);
  noteLeg(s, A, C.id, [{ cargoId: 'COAL', capacity: 4000 }]);
  noteLeg(s, C, A.id, [{ cargoId: 'COAL', capacity: 4000 }]);
  return { s, A, C };
}

const demFrom = (s, id) => Object.keys(s.cargoDist.COAL.dem).map(Number).includes(id) && s.cargoDist.COAL.dem[id].length > 0;

describe('D18 supply window / accumulator', () => {
  test('compressSupply: halves every 256 days with OpenTTD midpoint and integer floor', () => {
    expect(COMPRESSION_INTERVAL_DAYS).toBe(256);
    const st = { cdSupplyAcc: { COAL: 101 } };
    const state = { stations: [st] };
    const g = {};
    compressSupply(state, 'COAL', g, 0);
    expect(g.lastCompressDay).toBe(0);
    expect(st.cdSupplyAcc.COAL).toBe(101);
    compressSupply(state, 'COAL', g, 256); // not more than 256 days
    expect(st.cdSupplyAcc.COAL).toBe(101);
    compressSupply(state, 'COAL', g, 300); // 300 > 256: halve, last = (300+0)/2
    expect(st.cdSupplyAcc.COAL).toBe(50);
    expect(g.lastCompressDay).toBe(150);
    compressSupply(state, 'COAL', g, 410); // 410-150 = 260 > 256
    expect(st.cdSupplyAcc.COAL).toBe(25);
    expect(g.lastCompressDay).toBe(280);
  });

  test('noteSupplyAcc accumulates and ignores non-positive amounts', () => {
    const st = {};
    noteSupplyAcc(st, 'COAL', 30);
    noteSupplyAcc(st, 'COAL', 0);
    noteSupplyAcc(st, 'COAL', -5);
    expect(st.cdSupplyAcc).toEqual({ COAL: 30 });
  });

  test('off: the accumulator is ignored and never created (demand identical to a game without it)', () => {
    const control = coalLine(false);
    control.A.cdSupply = { COAL: 1000 };
    rebuildGraph(control.s, 'COAL', 'asymmetric');
    const { s, A } = coalLine(false);
    A.cdSupply = { COAL: 1000 };
    A.cdSupplyAcc = { COAL: 7 }; // would change the parity demand only
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(s.cargoDist.COAL.dem).toEqual(control.s.cargoDist.COAL.dem);
    expect(s.cargoDist.COAL.lastCompressDay).toBeUndefined();
  });

  test('on: demand supply is the accumulator, not the per-job window', () => {
    const { s, A } = coalLine(true);
    A.cdSupply = { COAL: 1000 }; // window is ignored under parity
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(demFrom(s, A.id)).toBe(false);
    expect(A.cdSupply.COAL).toBe(0);
  });

  test('on: the cumulative accumulator is the supply and is not reset by a job', () => {
    const { s, A } = coalLine(true);
    A.cdSupplyAcc = { COAL: 1000 };
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(demFrom(s, A.id)).toBe(true);
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(demFrom(s, A.id)).toBe(true);
    expect(A.cdSupplyAcc.COAL).toBe(1000);
  });

  test('on: the accumulator is halved after more than 256 days, lazily timed from the first job', () => {
    const { s, A } = coalLine(true);
    A.cdSupplyAcc = { COAL: 1000 };
    s.date = { year: 2000, month: 0, day: 1 };
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(s.cargoDist.COAL.lastCompressDay).toBeDefined();
    expect(A.cdSupplyAcc.COAL).toBe(1000);
    s.date = { year: 2000, month: 6, day: 1 }; // ~181 days: no halving
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(A.cdSupplyAcc.COAL).toBe(1000);
    s.date = { year: 2001, month: 0, day: 1 }; // 365 days after the first job: halved
    rebuildGraph(s, 'COAL', 'asymmetric');
    expect(A.cdSupplyAcc.COAL).toBe(500);
  });
});
