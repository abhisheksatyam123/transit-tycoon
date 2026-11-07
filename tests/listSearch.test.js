/** Name search (OpenTTD QueryString filter) and depot vehicle sort helpers (pure, no DOM). */
import { test, expect, describe } from 'bun:test';
import { matchesName, filterByName } from '../js/ui/windows/listSort.js';
import { sortStations } from '../js/ui/windows/stationList.js';
import { sortVehicles } from '../js/ui/windows/vehicleList.js';

const TOWNS = [
  { id: 1, name: 'Moscow' },
  { id: 2, name: 'Москва' },
  { id: 3, name: 'Saint Petersburg' },
  { id: 4, name: 'Kazan' },
];

describe('matchesName', () => {
  test('case-insensitive substring; empty query matches all', () => {
    expect(matchesName('Moscow', 'MOSC')).toBe(true);
    expect(matchesName('Moscow', 'cow')).toBe(true);
    expect(matchesName('Moscow', 'kaz')).toBe(false);
    expect(matchesName('Moscow', '')).toBe(true);
    expect(matchesName('Moscow', '   ')).toBe(true);
    expect(matchesName(undefined, '')).toBe(true);
    expect(matchesName(undefined, 'x')).toBe(false);
  });
  test('trims the query', () => {
    expect(matchesName('Saint Petersburg', '  saint  ')).toBe(true);
  });
  test('unicode: Cyrillic names match Cyrillic queries case-insensitively', () => {
    expect(matchesName('Москва', 'МОСК')).toBe(true);
    expect(matchesName('Москва', 'москва')).toBe(true);
    expect(matchesName('Moscow', 'москва')).toBe(false);
    expect(matchesName('Москва', 'Moscow')).toBe(false);
  });
});

describe('filterByName', () => {
  test('keeps order, empty query returns the same items', () => {
    const same = filterByName(TOWNS, '', (t) => t.name);
    expect(same).toBe(TOWNS);
    expect(filterByName(TOWNS, 'S', (t) => t.name).map((t) => t.id)).toEqual([1, 3]);
  });
  test('Moscow: Latin and Cyrillic names are found separately', () => {
    const nameOf = (t) => t.name;
    expect(filterByName(TOWNS, 'moscow', nameOf).map((t) => t.id)).toEqual([1]);
    expect(filterByName(TOWNS, 'мос', nameOf).map((t) => t.id)).toEqual([2]);
  });
  test('does not mutate the input', () => {
    const copy = TOWNS.slice();
    filterByName(TOWNS, 'kazan', (t) => t.name);
    expect(TOWNS).toEqual(copy);
  });
  test('no match returns empty array', () => {
    expect(filterByName(TOWNS, 'zzz', (t) => t.name)).toEqual([]);
  });
});

describe('station name search', () => {
  const S = [
    { id: 1, name: 'Central', kinds: { rail: true }, cargo: {}, rating: {} },
    { id: 2, name: 'central bus', kinds: { bus: true }, cargo: {}, rating: {} },
    { id: 3, name: 'Москва Центр', kinds: { rail: true }, cargo: {}, rating: {} },
  ];
  test('query combines with facility filter', () => {
    expect(sortStations(S, { query: 'CENTR' }).map((s) => s.id).sort()).toEqual([1, 2]);
    expect(sortStations(S, { query: 'centr', filter: 'rail' }).map((s) => s.id)).toEqual([1]);
    expect(sortStations(S, { query: 'центр', filter: 'rail' }).map((s) => s.id)).toEqual([3]);
    expect(sortStations(S, { query: 'центр', filter: 'bus' }).map((s) => s.id)).toEqual([]);
    expect(sortStations(S, { query: '', filter: 'all' }).length).toBe(3);
  });
});

describe('depot vehicle sort (shared with vehicle list)', () => {
  const V = [
    { id: 1, name: 'Bus 2', kind: 'road', age: 5, profitThisYear: 10, unitNumber: 2 },
    { id: 2, name: 'Train 1', kind: 'train', age: 1, profitThisYear: -5, unitNumber: 1 },
    { id: 3, name: 'Bus 10', kind: 'road', age: 9, profitThisYear: 30, unitNumber: 3 },
  ];
  test('sorts by profit descending and by name ascending', () => {
    expect(sortVehicles(V, { sort: 'profitThisYear', dir: -1 }).map((v) => v.id)).toEqual([3, 1, 2]);
    expect(sortVehicles(V, { sort: 'name', dir: 1 }).map((v) => v.id)).toEqual([1, 3, 2]);
  });
  test('sorts by age and does not mutate input', () => {
    const before = V.map((v) => v.id);
    expect(sortVehicles(V, { sort: 'age', dir: 1 }).map((v) => v.id)).toEqual([2, 1, 3]);
    expect(V.map((v) => v.id)).toEqual(before);
  });
});
