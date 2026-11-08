/** Vehicle list sort keys + cargo filter (vehicleList.js), and build-window power/TE sorters (buyFilter.js). */
import { test, expect, describe } from 'bun:test';
import { sortVehicles, inCargo, vehicleCargos, vehicleCargoOptions, VEHICLE_SORTS } from '../js/ui/windows/vehicleList.js';
import { sortModels, BUY_SORTERS } from '../js/ui/buyFilter.js';

const V = [
  { id: 1, name: 'Bus B', kind: 'road', modelId: 'bus_modern', unitNumber: 2, age: 100, maxAge: 1000, value: 500, cargoId: 'PASS' },
  { id: 2, name: 'Train A', kind: 'train', modelId: 'eng_comet', unitNumber: 1, age: 300, maxAge: 900, value: 900, wagons: 3, wagonModelId: 'wag_coach', cargoId: 'COAL', consist: [{ modelId: 'wag_coach', cargoId: 'PASS' }, { modelId: 'wag_coal', cargoId: 'COAL' }] },
  { id: 3, name: 'Truck C', kind: 'road', modelId: 'truck_x', unitNumber: 3, age: 100, maxAge: 1000, value: 500, cargoId: 'GOODS' },
];
const ids = (l) => l.map((v) => v.id);

describe('vehicle list sort keys', () => {
  const sortIds = (sort, dir = 1, vs = V) => ids(sortVehicles(vs, { sort, dir }));

  test('every new key is offered', () => {
    const keys = VEHICLE_SORTS.map((s) => s[0]);
    for (const k of ['maxSpeed', 'value', 'model', 'length', 'cargo', 'timeToLive']) expect(keys).toContain(k);
  });
  test('value ascending and descending', () => {
    expect(sortIds('value')).toEqual([1, 3, 2]); // tie 1/3 by unitNumber (2 then 3 -> 1 has unit 2, 3 has unit 3)
    expect(sortIds('value', -1)).toEqual([2, 3, 1]);
  });
  test('length counts wagons', () => {
    expect(sortIds('length')[0]).toBe(1); // 0 wagons
    expect(sortIds('length')[2]).toBe(2); // 3 wagons last
  });
  test('timeToLive = maxAge - age', () => {
    // ttl: v1 900, v2 600, v3 900 -> ascending 2, then 1 (unit 2), 3 (unit 3)
    expect(sortIds('timeToLive')).toEqual([2, 1, 3]);
  });
  test('maxSpeed uses the model speed (unknown model sorts as 0)', () => {
    const sp = sortIds('maxSpeed');
    expect(sp[0]).toBe(3); // unknown model -> 0
  });
  test('model sorts by model name, stable ties by id', () => {
    const vs = [{ id: 9, modelId: 'x', kind: 'road' }, { id: 4, modelId: 'x', kind: 'road' }];
    expect(ids(sortVehicles(vs, { sort: 'model' }))).toEqual([4, 9]);
  });
  test('cargo sorts by the sorted cargo set', () => {
    expect(sortIds('cargo')).toEqual([2, 3, 1]); // 'COAL,PASS' < 'GOODS' < 'PASS'
  });
  test('ties always break on unit number then id (stable, deterministic)', () => {
    const vs = [{ id: 7, unitNumber: 1, age: 5, kind: 'road' }, { id: 3, unitNumber: 1, age: 5, kind: 'road' }, { id: 5, unitNumber: 0, age: 5, kind: 'road' }];
    expect(ids(sortVehicles(vs, { sort: 'age' }))).toEqual([5, 3, 7]);
  });
  test('pure: input array is not mutated', () => {
    const copy = V.slice();
    sortVehicles(V, { sort: 'value', dir: -1 });
    expect(V).toEqual(copy);
  });
});

describe('cargo filter', () => {
  test('All cargo keeps everything', () => {
    expect(ids(sortVehicles(V, { cargo: 'all' }))).toEqual([1, 2, 3]);
    expect(ids(sortVehicles(V, {}))).toEqual([1, 2, 3]);
  });
  test('matches the vehicle own cargo', () => {
    expect(ids(sortVehicles(V, { cargo: 'GOODS' }))).toEqual([3]);
  });
  test('a wagon cargo matches the whole train (any part carries it)', () => {
    expect(ids(sortVehicles(V, { cargo: 'PASS' }))).toEqual([1, 2]);
    expect(inCargo(V[1], 'PASS')).toBe(true);
  });
  test('vehicleCargos includes wagon cargos; cargo options are distinct and sorted', () => {
    expect([...vehicleCargos(V[1])].sort()).toEqual(['COAL', 'PASS']);
    expect(vehicleCargoOptions(V)).toEqual(['COAL', 'GOODS', 'PASS']);
  });
  test('cargo filter composes with kind filter', () => {
    expect(ids(sortVehicles(V, { cargo: 'PASS', filter: 'road' }))).toEqual([1]);
  });
});

describe('build window power / tractive effort sorters', () => {
  const E = [
    { id: 'a', name: 'Bravo', kind: 'engine', power: 600 },
    { id: 'b', name: 'Alpha', kind: 'engine', power: 1100 },
    { id: 'c', name: 'Charlie', kind: 'engine', power: 600 },
  ];
  const mids = (l) => l.map((m) => m.id);

  test('power sorts ascending/descending, stable on ties', () => {
    expect(mids(sortModels(E, 'power', 1))).toEqual(['a', 'c', 'b']);
    expect(mids(sortModels(E, 'power', -1))).toEqual(['b', 'a', 'c']);
  });
  test('non-engine lists fall back to name order', () => {
    const W = [{ id: 'x', name: 'Zeta', kind: 'wagon', power: 0 }, { id: 'y', name: 'Alpha', kind: 'wagon' }];
    expect(mids(sortModels(W, 'power', 1))).toEqual(['y', 'x']);
  });
  test('the new sorters are listed', () => {
    const keys = BUY_SORTERS.map((s) => s[0]);
    expect(keys).toContain('power');
    expect(keys).toContain('tractive');
    expect(keys).toContain('id');
  });
});
