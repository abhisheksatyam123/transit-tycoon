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
