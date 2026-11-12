/** F3: vehicle list 'number' sort orders by the displayed unit number (not the internal id). */
import { describe, expect, test } from 'bun:test';
import { sortVehicles, VEHICLE_SORTS } from '../js/ui/windows/vehicleList.js';

// Ids and unit numbers in DIFFERENT orders (unit numbers are reused after a sale, so they can disagree with ids).
const V = [
  { id: 3, name: 'Bus C', kind: 'road', modelId: 'bus_modern', unitNumber: 1, age: 300, maxAge: 900, value: 100, profitThisYear: 30, capacity: 10 },
  { id: 1, name: 'Bus A', kind: 'road', modelId: 'bus_modern', unitNumber: 3, age: 100, maxAge: 1000, value: 300, profitThisYear: 10, capacity: 30 },
  { id: 2, name: 'Bus B', kind: 'road', modelId: 'bus_modern', unitNumber: 2, age: 200, maxAge: 800, value: 200, profitThisYear: 20, capacity: 20 },
];
const ids = (l) => l.map((v) => v.id);

describe('vehicle list number sort: displayed unit number', () => {
  test('number key is still offered and unchanged in position', () => {
    expect(VEHICLE_SORTS[VEHICLE_SORTS.length - 2][0]).toBe('number');
  });

  test('ascending orders by unitNumber, not id', () => {
    expect(ids(sortVehicles(V, { sort: 'number', dir: 1 }))).toEqual([3, 2, 1]); // units 1,2,3
  });

  test('descending orders by unitNumber, not id', () => {
    expect(ids(sortVehicles(V, { sort: 'number', dir: -1 }))).toEqual([1, 2, 3]); // units 3,2,1
  });

  test('ties on unitNumber break by id (ascending and descending)', () => {
    const T = [
      { id: 9, name: 'X', kind: 'road', unitNumber: 5 },
      { id: 4, name: 'Y', kind: 'road', unitNumber: 5 },
      { id: 7, name: 'Z', kind: 'road', unitNumber: 2 },
    ];
    expect(ids(sortVehicles(T, { sort: 'number', dir: 1 }))).toEqual([7, 4, 9]);
    expect(ids(sortVehicles(T, { sort: 'number', dir: -1 }))).toEqual([9, 4, 7]);
  });

  test('missing unitNumber falls back to 0 (sorts first ascending)', () => {
    const M = [{ id: 2, name: 'A', kind: 'road', unitNumber: 4 }, { id: 5, name: 'B', kind: 'road' }];
    expect(ids(sortVehicles(M, { sort: 'number', dir: 1 }))).toEqual([5, 2]);
  });

  test('numeric unit order: 10 after 9 (not string order)', () => {
    const N = [{ id: 1, name: 'A', kind: 'road', unitNumber: 10 }, { id: 2, name: 'B', kind: 'road', unitNumber: 9 }];
    expect(ids(sortVehicles(N, { sort: 'number', dir: 1 }))).toEqual([2, 1]);
  });

  test('other sort keys are unchanged', () => {
    const s = (sort, dir = 1) => ids(sortVehicles(V, { sort, dir }));
    expect(s('name')).toEqual([1, 2, 3]); // Bus A, Bus B, Bus C
    expect(s('value')).toEqual([3, 2, 1]);
    expect(s('value', -1)).toEqual([1, 2, 3]);
    expect(s('age')).toEqual([1, 2, 3]);
    expect(s('profitThisYear')).toEqual([1, 2, 3]);
    expect(s('capacity')).toEqual([3, 2, 1]);
    expect(s('capacity', -1)).toEqual([1, 2, 3]);
  });

  test('default sort (no opts) is still name ascending', () => {
    expect(ids(sortVehicles(V, {}))).toEqual([1, 2, 3]);
  });
});
