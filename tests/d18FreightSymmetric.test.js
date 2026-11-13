/** D18 remainder: freight uses symmetric demand under demand parity (cargodistDemandParity), default off. */
import { test, expect, describe } from 'bun:test';
import { cdMode, freightMode, demandUnitsParity } from '../js/simulation/cargodist.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';

const pos = new Map([[1, [0, 0]], [2, [5, 0]], [3, [0, 5]]]);
const units = (r) => Object.fromEntries(r.entries.map((e) => [e.s + '>' + e.d, e.amt]));

describe('D18 freight symmetric demand', () => {
  test('freightDistribution default is manual and freight stays manual', () => {
    expect(DEFAULT_SETTINGS.freightDistribution).toBe('manual');
    expect(freightMode({ settings: {} })).toBe('manual');
    expect(cdMode({ settings: {} }, 'COAL')).toBe('manual');
  });

  test('symmetric is reachable only with demand parity on; otherwise it runs as asymmetric', () => {
    const off = { settings: {} };
    setSetting(off, 'freightDistribution', 'symmetric');
    expect(freightMode(off)).toBe('asymmetric');
    expect(cdMode(off, 'COAL')).toBe('asymmetric');
    const on = { settings: {} };
    setSetting(on, 'freightDistribution', 'symmetric');
    setSetting(on, 'cargodistDemandParity', true);
    expect(freightMode(on)).toBe('symmetric');
    expect(cdMode(on, 'COAL')).toBe('symmetric');
  });

  test('asymmetric freight is unchanged by the parity setting', () => {
    const st = { settings: {} };
    setSetting(st, 'freightDistribution', 'asymmetric');
    expect(freightMode(st)).toBe('asymmetric');
    setSetting(st, 'cargodistDemandParity', true);
    expect(freightMode(st)).toBe('asymmetric');
  });

  test('pure parity demand: symmetric gives both directions between accepting nodes, asymmetric only forward', () => {
    const args = { nodes: [1, 2], pos, supply: new Map([[1, 100], [2, 100]]), accept: new Map([[1, 1], [2, 1]]), mapW: 10, mapH: 10 };
    const sym = units(demandUnitsParity({ ...args, mode: 'symmetric' }));
    expect(sym['1>2']).toBeGreaterThan(0);
    expect(sym['2>1']).toBeGreaterThan(0);
    const asym = units(demandUnitsParity({ ...args, mode: 'asymmetric' }));
    expect(asym['1>2']).toBe(100);
    expect(asym['2>1']).toBe(100);
  });

  test('symmetric: a node without acceptance receives no freight', () => {
    const r = demandUnitsParity({
      nodes: [1, 2, 3], pos, supply: new Map([[1, 200], [2, 200], [3, 0]]), accept: new Map([[1, 1], [2, 1], [3, 0]]),
      mode: 'symmetric', mapW: 10, mapH: 10,
    });
    for (const e of r.entries) expect(e.d).not.toBe(3);
  });
});
