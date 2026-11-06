import { test, expect, describe } from 'bun:test';
import { collectLinks, linkColour, linkWidth, LINK_COLOURS } from '../js/renderer/layers/linkOverlay.js';
import { setSetting } from '../js/simulation/settings.js';

const stub = (mode) => {
  const s = { settings: {}, stations: [], vehicles: [], cargoDist: {} };
  if (mode) setSetting(s, 'cargodist', mode);
  return s;
};

describe('collectLinks', () => {
  test('cargodist off: links come from consecutive order pairs with capacity and load', () => {
    const s = stub();
    s.vehicles = [
      { cargoId: 'PASS', capacity: 30, orders: [{ stationId: 1 }, { stationId: 2 }], orderIndex: 1, load: { amount: 15 } },
      { cargoId: 'PASS', capacity: 20, orders: [{ stationId: 1 }, { stationId: 2 }], orderIndex: 0, load: { amount: 0 } },
    ];
    const links = collectLinks(s);
    const ab = links.filter((l) => l.a === 1 && l.b === 2);
    expect(ab.length).toBe(1);
    expect(ab[0].cap).toBe(50);
    expect(ab[0].used).toBe(15);
    expect(ab[0].usage).toBeCloseTo(0.3);
    expect(ab[0].source).toBe('orders');
    // the round trip 2 -> 1 wraps around (two stops)
    expect(links.some((l) => l.a === 2 && l.b === 1)).toBe(true);
  });

  test('cargodist off: single-stop and cargo-less vehicles add no links', () => {
    const s = stub();
    s.vehicles = [{ cargoId: 'PASS', capacity: 9, orders: [{ stationId: 1 }], orderIndex: 0 },
      { cargoId: null, capacity: 9, orders: [{ stationId: 1 }, { stationId: 2 }], orderIndex: 0 }];
    expect(collectLinks(s)).toEqual([]);
  });

  test('cargodist on: links are the cargodist edges (cap = last month, used = this month)', () => {
    const s = stub('symmetric');
    s.cargoDist.PASS = { edges: { '1>2': { a: 1, b: 2, cap: 80, used: 40 }, '2>3': { a: 2, b: 3, cap: 0, used: 0 } } };
    s.cargoDist.MAIL = { edges: { '1>2': { a: 1, b: 2, cap: 10, used: 10 } } };
    const links = collectLinks(s);
    expect(links.length).toBe(3);
    const pax12 = links.find((l) => l.cargoId === 'PASS' && l.a === 1);
    expect(pax12.usage).toBeCloseTo(0.5);
    expect(pax12.source).toBe('graph');
    expect(links.find((l) => l.a === 2).usage).toBe(0);
  });

  test('cargo filter hides a cargo; usage is clamped to 1', () => {
    const s = stub('asymmetric');
    s.cargoDist.PASS = { edges: { '1>2': { a: 1, b: 2, cap: 10, used: 99 } } };
    s.cargoDist.MAIL = { edges: { '1>2': { a: 1, b: 2, cap: 10, used: 1 } } };
    const links = collectLinks(s, { cargos: { PASS: false } });
    expect(links.map((l) => l.cargoId)).toEqual(['MAIL']);
    expect(collectLinks(s)[0].usage).toBe(1);
  });
});

describe('colour and width', () => {
  test('gradient endpoints and midpoint follow LINK_COLOURS', () => {
    expect(linkColour(0)).toBe('rgb(34,197,94)');
    expect(linkColour(0.5)).toBe('rgb(250,204,21)');
    expect(linkColour(1)).toBe('rgb(239,68,68)');
    expect(linkColour(7)).toBe(linkColour(1));
    expect(linkColour(NaN)).toBe(linkColour(0));
    expect(LINK_COLOURS.length).toBe(3);
  });
  test('width is 1..4 by capacity', () => {
    expect(linkWidth(0)).toBe(1);
    expect(linkWidth(120)).toBe(3);
    expect(linkWidth(10_000)).toBe(4);
  });
});
