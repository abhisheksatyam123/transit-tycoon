/** Build-vehicle window helpers (buyFilter.js): sorter, cargo filter, remembered sort, default preserved. */
import { test, expect, describe, beforeEach } from 'bun:test';
import { sortModels, filterModelsByCargo, cargoFilterOptions, loadBuySort, saveBuySort, BUY_SORT_KEY } from '../js/ui/buyFilter.js';

const M = [
  { id: 'a', name: 'Bravo', cost: 300, speed: 80, capacity: 20, running: 5, introYear: 1960, cargos: ['COAL'] },
  { id: 'b', name: 'Alpha', cost: 100, speed: 120, capacity: 40, running: 9, introYear: 1950, cargos: ['PASS', 'MAIL'] },
  { id: 'c', name: 'Charlie', cost: 100, speed: 60, capacity: 10, running: 2, introYear: 1980, cargos: ['COAL', 'GRAIN'] },
];
const ids = (l) => l.map((m) => m.id);

describe('sortModels', () => {
  test('default keeps the input order (the smart default selection depends on it)', () => {
    expect(ids(sortModels(M, 'default', 1))).toEqual(['a', 'b', 'c']);
    expect(ids(sortModels(M, 'nope', 1))).toEqual(['a', 'b', 'c']);
  });
  test('sorts by cost asc and desc; equal costs keep their original order (stable)', () => {
    expect(ids(sortModels(M, 'cost', 1))).toEqual(['b', 'c', 'a']);
    expect(ids(sortModels(M, 'cost', -1))).toEqual(['a', 'b', 'c']);
  });
  test('sorts by name, speed, capacity, running cost and intro date', () => {
    expect(ids(sortModels(M, 'name', 1))).toEqual(['b', 'a', 'c']);
    expect(ids(sortModels(M, 'speed', -1))).toEqual(['b', 'a', 'c']);
    expect(ids(sortModels(M, 'capacity', 1))).toEqual(['c', 'a', 'b']);
    expect(ids(sortModels(M, 'running', 1))).toEqual(['c', 'a', 'b']);
    expect(ids(sortModels(M, 'intro', 1))).toEqual(['b', 'a', 'c']);
  });
  test('does not mutate the input', () => {
    const copy = M.slice();
    sortModels(M, 'cost', -1);
    expect(M).toEqual(copy);
  });
});

describe('cargo filter', () => {
  test('All keeps every model', () => {
    expect(ids(filterModelsByCargo(M, ''))).toEqual(['a', 'b', 'c']);
  });
  test('a cargo keeps only the models that can carry it', () => {
    expect(ids(filterModelsByCargo(M, 'COAL'))).toEqual(['a', 'c']);
    expect(ids(filterModelsByCargo(M, 'PASS'))).toEqual(['b']);
    expect(ids(filterModelsByCargo(M, 'OIL'))).toEqual([]);
  });
  test('options are the sorted union of carried cargos', () => {
    expect(cargoFilterOptions(M)).toEqual(['COAL', 'GRAIN', 'MAIL', 'PASS']);
  });
});

describe('remembered sort (UI only)', () => {
  beforeEach(() => { try { localStorage.removeItem(BUY_SORT_KEY); } catch { /* no storage */ } });
  test('defaults to list order ascending when nothing is stored', () => {
    expect(loadBuySort()).toEqual({ key: 'default', dir: 1 });
  });
  test('round trips a choice and rejects garbage', () => {
    if (typeof localStorage === 'undefined') return;
    saveBuySort({ key: 'cost', dir: -1 });
    expect(loadBuySort()).toEqual({ key: 'cost', dir: -1 });
    localStorage.setItem(BUY_SORT_KEY, '{"key":"bogus","dir":7}');
    expect(loadBuySort()).toEqual({ key: 'default', dir: 1 });
  });
});
