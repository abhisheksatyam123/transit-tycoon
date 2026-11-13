import { test, expect, describe } from 'bun:test';
import { depotRows } from '../js/ui/windows/depotList.js';
import { openDepot } from '../js/ui/windows/depot.js';

describe('depot list rows (D1)', () => {
  const state = {
    depots: [
      { id: 7, kind: 'road', x: 10, y: 10, dir: 1 },
      { id: 3, kind: 'rail', x: 50, y: 50, dir: 2 },
      { id: 9, kind: 'air', x: 0, y: 0, dir: 4 },
      { id: 5, kind: 'road', x: 20, y: 20, dir: 1, ownerId: 42 },
    ],
    towns: [{ name: 'Alpha', x: 12, y: 10 }, { name: 'Beta', x: 48, y: 52 }],
    vehicles: [
      { id: 1, depotId: 7, state: 'depot' },
      { id: 2, depotId: 7, state: 'running' },
      { id: 3, depotId: 3, state: 'depot' },
      { id: 4, depotId: null, state: 'running' },
      { id: 5, depotId: 5, state: 'depot' },
    ],
  };
  test('sorted by id, kind labels, nearest town, inside/total counts', () => {
    const rows = depotRows(state);
    expect(rows.map((r) => r.id)).toEqual([3, 7, 9]);
    expect(rows[0]).toMatchObject({ kind: 'rail', kindLabel: 'Rail', town: 'Beta', inside: 1, total: 1 });
    expect(rows[1]).toMatchObject({ kind: 'road', kindLabel: 'Road', town: 'Alpha', inside: 1, total: 2 });
    expect(rows[2]).toMatchObject({ kind: 'air', kindLabel: 'Airport hangar', town: 'Alpha', inside: 0, total: 0 });
  });
  test('rival depots (ownerId) are not listed', () => {
    const rows = depotRows(state);
    expect(rows.map((r) => r.id)).toEqual([3, 7, 9]);
    expect(rows.some((r) => r.id === 5)).toBe(false);
  });
  test('openDepot refuses a rival-owned depot and unknown depots', () => {
    const app = { findDepot: (id) => (id === 1 ? { id, ownerId: 42 } : null) };
    expect(openDepot(app, 1)).toBe(null); // rival owned
    expect(openDepot(app, 2)).toBe(null); // missing
  });
  test('no towns gives empty town name; no depots gives empty list', () => {
    expect(depotRows({ depots: [{ id: 1, kind: 'rail', x: 1, y: 1 }], towns: [], vehicles: [] })[0].town).toBe('');
    expect(depotRows({ depots: [], towns: [], vehicles: [] })).toEqual([]);
  });
});
