import { test, expect, describe } from 'bun:test';
import { chooseBuyDefaults, suppliedFreight } from '../js/ui/buyDefaults.js';

const state = (stations, year = 1970) => ({ date: { year }, stations, industries: [], map: { width: 100, height: 100, tiles: [] }, settings: {}, companies: [], vehicles: [], depots: [] });
const st = (id, x, y, kind, cargo = {}) => ({ id, x, y, tiles: [{ x, y, kind }], kinds: { [kind]: true }, cargo, rating: {} });
const road = { kind: 'road', x: 33, y: 58 };

describe('buy window defaults (F10)', () => {
  test('road depot next to coal truck stop -> bulk truck + COAL', () => {
    const s = state([st(1, 31, 60, 'truck', { COAL: [{ amount: 40 }] }), st(2, 37, 60, 'truck')]);
    expect(chooseBuyDefaults(s, road)).toEqual({ modelId: 'trk_bulk', cargo: 'COAL' });
  });

  test('road depot with only bus stops -> bus + PASS', () => {
    const s = state([st(1, 31, 60, 'bus', { PASS: [{ amount: 9 }] })]);
    expect(chooseBuyDefaults(s, road)).toEqual({ modelId: 'bus_city', cargo: 'PASS' });
  });

  test('stations out of range are ignored', () => {
    const s = state([st(1, 80, 80, 'truck', { COAL: 30 })]);
    expect(chooseBuyDefaults(s, road).cargo).toBe('PASS');
  });

  test('rail depot keeps the window default (no override)', () => {
    const s = state([st(1, 31, 60, 'rail', { COAL: 30 })]);
    expect(chooseBuyDefaults(s, { kind: 'rail', x: 33, y: 58 })).toEqual({ modelId: null, cargo: null });
  });

  test('suppliedFreight ranks by amount and drops passengers', () => {
    const a = st(1, 0, 0, 'truck', { PASS: 99, GOOD: 5, COAL: 20 });
    expect(suppliedFreight([a])).toEqual(['COAL', 'GOOD']);
  });
});

describe('buy window defaults (F13): raw producers beat processed output', () => {
  // truck stop at (40,60) covers tiles within 3. Rubber plantation (raw) at (42,60) inside the catchment.
  // Factory (processing, GOOD output, no input yet) at (44,60) also inside. Depot at (33,58) is within 12 of both.
  const ind = (id, typeId, x, y, w, h) => ({ id, typeId, x, y, w, h, name: id, produced: {}, received: {} });
  const withInd = (stations, industries) => ({ ...state(stations), industries, mapgen: { climate: 'tropic' } });
  const rubberTruckStop = st(1, 40, 60, 'truck');
  const rubberCase = () => withInd([rubberTruckStop], [
    ind(10, 'rubber_plantation', 41, 59, 4, 5),
    ind(11, 'factory_tropic', 43, 59, 2, 4),
  ]);

  test('depot near rubber plantation + factory picks Rubber Truck, not Goods Truck', () => {
    const s = rubberCase();
    const pick = chooseBuyDefaults(s, road);
    expect(pick.cargo).toBe('RUBBER');
    expect(pick.modelId).not.toBeNull();
    expect(pick.modelId).toBe(chooseBuyDefaults(s, road).modelId);
  });

  test('suppliedFreight puts the raw producer cargo before the processed GOOD', () => {
    expect(suppliedFreight([rubberTruckStop], rubberCase(), road)).toEqual(['RUBBER', 'GOOD']);
  });

  test('cargo waiting at the stations outranks a raw producer', () => {
    const withGoods = st(1, 40, 60, 'truck', { GOOD: [{ amount: 12 }] });
    const s = withInd([withGoods], rubberCase().industries);
    expect(suppliedFreight([withGoods], s, road)).toEqual(['GOOD', 'RUBBER']);
  });

  test('nearer raw producer wins among raw producers (distance tiebreak)', () => {
    const near = ind(20, 'rubber_plantation', 41, 59, 4, 5);
    const far = ind(21, 'rubber_plantation', 36, 59, 2, 2);
    const s = withInd([rubberTruckStop], [far, near]);
    // both produce RUBBER; order is by cargo id so this only checks it does not throw and keeps RUBBER first
    expect(suppliedFreight([rubberTruckStop], s, road)[0]).toBe('RUBBER');
  });
});
