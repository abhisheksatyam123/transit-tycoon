/** Vehicle list group-by buckets (js/ui/vehicleGroupRows.js): shared orders / group bucketing and bucket sorting. */
import { test, expect, describe } from 'bun:test';
import { bucketVehicles, sortBuckets, GROUP_BY, BUCKET_SORTS } from '../js/ui/vehicleGroupRows.js';

const V = [
  { id: 1, name: 'Bus A', orderGroup: 7, groupId: 2, profitThisYear: 100, wagons: 2 },
  { id: 2, name: 'Bus B', orderGroup: 7, groupId: null, profitThisYear: 300, wagons: 5 },
  { id: 3, name: 'Truck', orderGroup: null, groupId: 2, profitThisYear: -50, wagons: 1 },
  { id: 4, name: 'Bus C', orderGroup: 7, groupId: 2, profitThisYear: 200, wagons: 3 },
  { id: 5, name: 'Solo', orderGroup: null, groupId: null, profitThisYear: 0 },
];
const G = [{ id: 2, name: 'Ferries' }];

describe('vehicle group rows', () => {
  test('group-by modes are offered', () => {
    expect(GROUP_BY.map((g) => g[0])).toEqual(['none', 'shared', 'group']);
    expect(BUCKET_SORTS.map((s) => s[0])).toEqual(['count', 'total', 'avg', 'length']);
  });
  test('none yields no buckets', () => {
    expect(bucketVehicles(V, { by: 'none', groups: G })).toEqual([]);
  });
  test('shared orders: one bucket per order group, solo vehicles alone', () => {
    const b = bucketVehicles(V, { by: 'shared' });
    expect(b.map((x) => x.key)).toEqual(['o:7', 'v:3', 'v:5']);
    const bus = b[0];
    expect(bus.count).toBe(3);
    expect(bus.total).toBe(600);
    expect(bus.avg).toBe(200);
    expect(bus.label).toBe('Bus A (+2)');
    expect(b[1].label).toBe('Truck');
    expect(b[2].label).toBe('Solo');
  });
  test('group: named buckets and Ungrouped', () => {
    const b = bucketVehicles(V, { by: 'group', groups: G });
    expect(b.map((x) => x.key)).toEqual(['g:2', 'none']);
    expect(b[0].label).toBe('Ferries');
    expect(b[0].count).toBe(3);
    expect(b[0].total).toBe(250);
    expect(b[1].label).toBe('Ungrouped');
    expect(b[1].total).toBe(300);
  });
  test('members keep input order (first member labels the bucket)', () => {
    const b = bucketVehicles([V[3], V[0]], { by: 'shared' });
    expect(b[0].vehicles.map((v) => v.id)).toEqual([4, 1]);
    expect(b[0].label).toBe('Bus C (+1)');
  });
  test('empty and missing profit are safe', () => {
    expect(bucketVehicles([], { by: 'shared' })).toEqual([]);
    const b = bucketVehicles([{ id: 9, name: 'X', orderGroup: 1 }], { by: 'shared' });
    expect(b[0].total).toBe(0);
    expect(b[0].avg).toBe(0);
    expect(b[0].label).toBe('X');
  });
  test('sortBuckets by count, total, avg in both directions', () => {
    const b = bucketVehicles(V, { by: 'shared' }); // o:7 (3, 600, 200), v:3 (1, -50, -50), v:5 (1, 0, 0)
    const keys = (s, dir) => sortBuckets(b, { sort: s, dir }).map((x) => x.key);
    expect(keys('count', -1)).toEqual(['o:7', 'v:3', 'v:5']);
    expect(keys('count', 1)).toEqual(['v:3', 'v:5', 'o:7']); // ties keep first-seen order
    expect(keys('total', -1)).toEqual(['o:7', 'v:5', 'v:3']);
    expect(keys('total', 1)).toEqual(['v:3', 'v:5', 'o:7']);
    expect(keys('avg', 1)).toEqual(['v:3', 'v:5', 'o:7']);
    expect(keys('avg', -1)).toEqual(['o:7', 'v:5', 'v:3']);
  });
  test('bucket length sums wagon counts (VehicleGroupLengthSorter)', () => {
    const b = bucketVehicles(V, { by: 'shared' }); // o:7: 2+5+3=10, v:3: 1, v:5: 0
    expect(b.map((x) => x.length)).toEqual([10, 1, 0]);
    expect(sortBuckets(b, { sort: 'length', dir: -1 }).map((x) => x.key)).toEqual(['o:7', 'v:3', 'v:5']);
    expect(sortBuckets(b, { sort: 'length', dir: 1 }).map((x) => x.key)).toEqual(['v:5', 'v:3', 'o:7']);
    expect(sortBuckets(bucketVehicles([{ id: 9, name: 'X', orderGroup: 1 }], { by: 'shared' }), { sort: 'length', dir: 1 })[0].length).toBe(0);
  });
  test('sortBuckets does not mutate its input', () => {
    const b = bucketVehicles(V, { by: 'shared' });
    const before = b.map((x) => x.key).join();
    sortBuckets(b, { sort: 'total', dir: -1 });
    expect(b.map((x) => x.key).join()).toBe(before);
  });
});
