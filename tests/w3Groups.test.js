/**
 * Vehicle group statistics (js/ui/vehicleGroupRows.js): OpenTTD CalcPercentVehicleFilled (vehicle.cpp:1505) and the
 * group info sums from group_gui.cpp:650-679 (profit this year, profit last year, current usage).
 */
import { test, expect, describe } from 'bun:test';
import { loadPercent, groupStatistics, groupKindCounts, groupKindLabel, bucketVehicles } from '../js/ui/vehicleGroupRows.js';

const V = (loadAmount, capacity, extra = {}) => ({
  id: 1, name: 'V', load: { amount: loadAmount }, capacity, profitThisYear: 0, profitLastYear: 0, ...extra,
});
const ZERO_COUNTS = { train: 0, road: 0, aircraft: 0, ship: 0, total: 0 };

describe('vehicle group statistics', () => {
  test('load percent follows OpenTTD CalcPercentVehicleFilled rounding', () => {
    expect(loadPercent(V(0, 100))).toBe(0);       // empty is really empty
    expect(loadPercent(V(100, 100))).toBe(100);   // full is really full
    expect(loadPercent(V(1, 3))).toBe(34);        // < 50%: round up
    expect(loadPercent(V(1, 4))).toBe(25);        // exactly 25%
    expect(loadPercent(V(1, 2))).toBe(50);        // 50%: round down branch
    expect(loadPercent(V(3, 4))).toBe(75);        // >= 50%: round down
  });

  test('a vehicle without capacity is 100% (OpenTTD: train without capacity)', () => {
    expect(loadPercent(V(0, 0))).toBe(100);
    expect(loadPercent({})).toBe(100);
  });

  test('missing load amount is treated as empty', () => {
    expect(loadPercent({ capacity: 50 })).toBe(0);
  });

  test('empty group has all statistics at zero', () => {
    expect(groupStatistics([])).toEqual({ count: 0, profitThisYear: 0, profitLastYear: 0, occupancy: 0, counts: ZERO_COUNTS });
    expect(groupStatistics(undefined)).toEqual({ count: 0, profitThisYear: 0, profitLastYear: 0, occupancy: 0, counts: ZERO_COUNTS });
  });

  test('profits are summed and occupancy is the average load percent', () => {
    const vs = [
      V(50, 100, { profitThisYear: 120, profitLastYear: -30 }),
      V(100, 100, { profitThisYear: -20, profitLastYear: 80 }),
      V(1, 4, { profitThisYear: 5, profitLastYear: 10 }),
    ];
    expect(groupStatistics(vs)).toEqual({
      count: 3,
      profitThisYear: 105,
      profitLastYear: 60,
      occupancy: Math.floor((50 + 100 + 25) / 3), // 58
      counts: { train: 0, road: 0, aircraft: 0, ship: 0, total: 3 },
    });
  });

  test('missing profit fields count as zero', () => {
    expect(groupStatistics([{ load: { amount: 0 }, capacity: 10 }])).toEqual({
      count: 1, profitThisYear: 0, profitLastYear: 0, occupancy: 0,
      counts: { train: 0, road: 0, aircraft: 0, ship: 0, total: 1 },
    });
  });

  test('vehicle counts by kind (mixed group)', () => {
    const vs = [
      V(0, 10, { kind: 'train' }), V(0, 10, { kind: 'train' }),
      V(0, 10, { kind: 'road' }), V(0, 10, { kind: 'aircraft' }),
      V(0, 10, { kind: 'ship' }), V(0, 10), // unknown kind: total only
    ];
    expect(groupKindCounts(vs)).toEqual({ train: 2, road: 1, aircraft: 1, ship: 1, total: 6 });
    expect(groupStatistics(vs).counts).toEqual({ train: 2, road: 1, aircraft: 1, ship: 1, total: 6 });
    expect(groupKindCounts(undefined)).toEqual(ZERO_COUNTS);
    expect(groupKindLabel({ train: 3, road: 2, aircraft: 0, ship: 0, total: 5 })).toBe('5 (3 train, 2 road)');
    expect(groupKindLabel(ZERO_COUNTS)).toBe('0');
  });

  test('group-by buckets carry last-year profit and usage', () => {
    const b = bucketVehicles([
      V(50, 100, { id: 1, groupId: 2, profitThisYear: 10, profitLastYear: 40 }),
      V(100, 100, { id: 2, groupId: 2, profitThisYear: 20, profitLastYear: 60 }),
      V(0, 100, { id: 3, groupId: null, profitThisYear: 30, profitLastYear: 70 }),
    ], { by: 'group', groups: [{ id: 2, name: 'G' }] });
    const g = b.find((x) => x.key === 'g:2');
    const u = b.find((x) => x.key === 'none');
    expect(g.last).toBe(100);
    expect(g.usage).toBe(75); // floor((50 + 100) / 2)
    expect(u.last).toBe(70);
    expect(u.usage).toBe(0);
    expect(g).not.toHaveProperty('loadSum');
    expect(g.counts).toEqual({ train: 0, road: 0, aircraft: 0, ship: 0, total: 2 });
  });
});
