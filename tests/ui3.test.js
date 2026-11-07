import { test, expect, describe } from 'bun:test';
import { sortTowns, sortIndustries, filterSigns, makeSortMemo, transportedPct, sumMap } from '../js/ui/windows/listSort.js';

const towns = [
  { id: 1, name: 'Bravo', population: 500, companyRating: 300 },
  { id: 2, name: 'alpha', population: 1200, companyRating: 700 },
  { id: 3, name: 'Charlie 10', population: 500 },
  { id: 4, name: 'Charlie 2', population: 90, companyRating: 500 },
];
const names = (xs) => xs.map((x) => x.name);

describe('sortTowns', () => {
  test('population descending by default-style opts', () => {
    expect(sortTowns(towns, { sort: 'population', dir: -1 }).map((t) => t.id)).toEqual([2, 1, 3, 4]);
  });
  test('population ascending', () => {
    expect(sortTowns(towns, { sort: 'population', dir: 1 }).map((t) => t.id)).toEqual([4, 1, 3, 2]);
  });
  test('name is case-insensitive and numeric-aware', () => {
    expect(names(sortTowns(towns, { sort: 'name', dir: 1 }))).toEqual(['alpha', 'Bravo', 'Charlie 2', 'Charlie 10']);
    expect(names(sortTowns(towns, { sort: 'name', dir: -1 }))).toEqual(['Charlie 10', 'Charlie 2', 'Bravo', 'alpha']);
  });
  test('rating uses companyRating with neutral default (500)', () => {
    expect(sortTowns(towns, { sort: 'rating', dir: -1 }).map((t) => t.id)).toEqual([2, 3, 4, 1]);
  });
  test('ties break on id and input is not mutated', () => {
    const input = towns.slice();
    const out = sortTowns(input, { sort: 'population', dir: 1 });
    expect(input).toEqual(towns);
    expect(out.indexOf(towns[0])).toBeLessThan(out.indexOf(towns[2])); // ids 1 and 3 both 500
  });
});

describe('sortIndustries', () => {
  const inds = [
    { id: 1, name: 'Mine B', typeId: 'coal_mine', producedLastMonth: { COAL: 100 }, transportedLastMonth: { COAL: 50 } },
    { id: 2, name: 'Mine A', typeId: 'forest', producedLastMonth: { WOOD: 300 }, transportedLastMonth: { WOOD: 300 } },
    { id: 3, name: 'Farm', typeId: 'farm', producedLastMonth: {}, transportedLastMonth: {} },
  ];
  test('name asc', () => {
    expect(sortIndustries(inds, { sort: "name", dir: 1 }).map((i) => i.id)).toEqual([3, 2, 1]);
  });
  test('production desc', () => {
    expect(sortIndustries(inds, { sort: 'production', dir: -1 }).map((i) => i.id)).toEqual([2, 1, 3]);
  });
  test('transported % asc (nothing produced counts as 0)', () => {
    expect(sortIndustries(inds, { sort: 'transported', dir: 1 }).map((i) => i.id)).toEqual([3, 1, 2]);
  });
  test('type sorts by the type display name, then name', () => {
    const out = sortIndustries(inds, { sort: 'type', dir: 1 });
    expect(out.length).toBe(3);
    // Coal Mine < Farm < Forest
    expect(out.map((i) => i.id)).toEqual([1, 3, 2]);
  });
  test('helpers', () => {
    expect(sumMap({ A: 2, B: 3 })).toBe(5);
    expect(sumMap(undefined)).toBe(0);
    expect(transportedPct({ producedLastMonth: { X: 3 }, transportedLastMonth: { X: 1 } })).toBe(33);
    expect(transportedPct({})).toBe(0);
  });
});

describe('filterSigns', () => {
  const signs = [{ id: 5, text: 'Zoo' }, { id: 6, text: 'airport road' }, { id: 7, text: 'Airport' }];
  test('no filter: all, sorted by text asc', () => {
    expect(filterSigns(signs, { dir: 1 }).map((s) => s.id)).toEqual([7, 6, 5]);
  });
  test('filter is case-insensitive substring, trimmed', () => {
    expect(filterSigns(signs, { filter: '  AIRPORT ' }).map((s) => s.id)).toEqual([7, 6]);
  });
  test('descending', () => {
    expect(filterSigns(signs, { dir: -1 }).map((s) => s.id)).toEqual([5, 6, 7]);
  });
  test('no match gives empty array', () => {
    expect(filterSigns(signs, { filter: 'nope' })).toEqual([]);
  });
});

describe('makeSortMemo', () => {
  test('re-sorts only when items, keys or signature change', () => {
    let calls = 0;
    const memo = makeSortMemo((xs) => { calls++; return sortTowns(xs, { sort: 'name', dir: 1 }); }, (t) => [t.name, t.population]);
    const a = towns.slice();
    const r1 = memo(a, 'name:1');
    const r2 = memo(a.slice(), 'name:1');
    expect(calls).toBe(1);
    expect(r2).toBe(r1);
    memo(a, 'name:-1');
    expect(calls).toBe(2);
    // a key change (population edited) invalidates the cache
    const changed = towns.map((t) => ({ ...t }));
    changed[0].population += 1;
    memo(changed, 'name:-1');
    expect(calls).toBe(3);
  });
});
