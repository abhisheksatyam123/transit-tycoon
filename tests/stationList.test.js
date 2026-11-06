/** Station + vehicle list sort/filter helpers (pure, no DOM). */
import { test, expect, describe } from 'bun:test';
import { sortStations, stationStats, hasFacility } from '../js/ui/windows/stationList.js';
import { sortVehicles } from '../js/ui/windows/vehicleList.js';

const S = [
  { id: 1, name: 'Beta', kinds: { rail: true }, cargo: { coal: [{ amount: 5 }, { amount: 3 }] }, rating: { coal: 40 } },
  { id: 2, name: 'alpha', kinds: { bus: true, truck: true }, cargo: {}, rating: { goods: 80 } },
  { id: 3, name: 'Gamma', kinds: { rail: true, airport: true }, cargo: { mail: 12 }, rating: {} },
];

describe('station list', () => {
  test('stats: waiting sums packets and numbers, max rating ignores missing', () => {
    expect(stationStats(S[0])).toEqual({ waiting: 8, maxRating: 40, cargoCount: 1 });
    expect(stationStats(S[2])).toEqual({ waiting: 12, maxRating: null, cargoCount: 1 });
  });
  test('facility filter', () => {
    expect(sortStations(S, { filter: 'rail' }).map((s) => s.id).sort()).toEqual([1, 3]);
    expect(sortStations(S, { filter: 'truck' }).map((s) => s.id)).toEqual([2]);
    expect(hasFacility(S[2], 'airport')).toBe(true);
    expect(hasFacility(S[0], 'bus')).toBe(false);
  });
  test('name sort is case-insensitive, descending flips', () => {
    expect(sortStations(S, { sort: 'name', dir: 1 }).map((s) => s.name)).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(sortStations(S, { sort: 'name', dir: -1 }).map((s) => s.name)).toEqual(['Gamma', 'Beta', 'alpha']);
  });
  test('waiting and rating sorts; null rating sorts lowest', () => {
    expect(sortStations(S, { sort: 'waiting', dir: -1 }).map((s) => s.id)).toEqual([3, 1, 2]);
    expect(sortStations(S, { sort: 'rating', dir: -1 }).map((s) => s.id)).toEqual([2, 1, 3]);
  });
  test('does not mutate input', () => {
    const copy = S.map((s) => s.id);
    sortStations(S, { sort: 'waiting' });
    expect(S.map((s) => s.id)).toEqual(copy);
  });
});

describe('vehicle list', () => {
  const V = [
    { id: 1, name: 'Train 10', unitNumber: 10, kind: 'train', profitThisYear: 500, profitLastYear: -20, age: 100, reliability: 0.9 },
    { id: 2, name: 'Bus 2', unitNumber: 2, kind: 'road', profitThisYear: -50, profitLastYear: 300, age: 900, reliability: 60 },
    { id: 3, name: 'Train 3', unitNumber: 3, kind: 'train', profitThisYear: 200, profitLastYear: 100, age: 10, reliability: 0.5 },
  ];
  test('name uses numeric collation', () => {
    expect(sortVehicles(V, { sort: 'name' }).map((v) => v.id)).toEqual([2, 3, 1]);
  });
  test('profit / age / reliability keys (reliability normalised to fraction)', () => {
    expect(sortVehicles(V, { sort: 'profitThisYear', dir: -1 }).map((v) => v.id)).toEqual([1, 3, 2]);
    expect(sortVehicles(V, { sort: 'profitLastYear' }).map((v) => v.id)).toEqual([1, 3, 2]);
    expect(sortVehicles(V, { sort: 'age', dir: -1 }).map((v) => v.id)).toEqual([2, 1, 3]);
    expect(sortVehicles(V, { sort: 'reliability' }).map((v) => v.id)).toEqual([3, 2, 1]);
  });
  test('kind filter', () => {
    expect(sortVehicles(V, { filter: 'train' }).map((v) => v.id)).toEqual([3, 1]);
    expect(sortVehicles(V, { filter: 'aircraft' })).toEqual([]);
  });
});
