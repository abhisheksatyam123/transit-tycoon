/** Waypoint list helpers (pure, no DOM). */
import { test, expect, describe } from 'bun:test';
import { waypointRows, sortWaypoints, isRoadWaypoint, waypointTypeLabel } from '../js/ui/windows/waypointList.js';

const mk = (id, name, road = false, ownerId = null) => ({
  id, name, ownerId, x: id, y: id * 2,
  tiles: [{ x: id, y: id * 2, kind: 'waypoint', ...(road ? { road: true } : {}), radius: 0 }],
});

describe('waypoint list helpers', () => {
  test('waypointRows filters to player waypoint records only', () => {
    const state = {
      stations: [
        mk(1, 'Alpha'),
        mk(2, 'Beta', true),
        { id: 3, name: 'Station', ownerId: null, x: 1, y: 1, tiles: [{ x: 1, y: 1, kind: 'rail', radius: 0 }] },
        mk(4, 'Rival', false, 99),
      ],
    };
    const rows = waypointRows(state);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(rows[0].name).toBe('Alpha');
    expect(rows[1].type).toBe('Road');
  });

  test('type detection', () => {
    expect(isRoadWaypoint(mk(1, 'A', true))).toBe(true);
    expect(isRoadWaypoint(mk(2, 'B', false))).toBe(false);
    expect(waypointTypeLabel(mk(1, 'A', true))).toBe('Road');
    expect(waypointTypeLabel(mk(2, 'B', false))).toBe('Rail');
  });

  test('sortWaypoints by name/type and filters by query', () => {
    const rows = [
      { id: 1, name: 'Zulu', type: 'Rail' },
      { id: 2, name: 'alpha', type: 'Road' },
      { id: 3, name: 'Beta', type: 'Rail' },
    ];
    expect(sortWaypoints(rows, { sort: 'name', dir: 1 }).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(sortWaypoints(rows, { sort: 'type', dir: 1 }).map((r) => r.id)).toEqual([1, 3, 2]);
    expect(sortWaypoints(rows, { sort: 'name', dir: 1, query: 'al' }).map((r) => r.id)).toEqual([2]);
  });

  test('sortWaypoints does not mutate input', () => {
    const rows = [{ id: 2, name: 'B', type: 'Rail' }, { id: 1, name: 'A', type: 'Rail' }];
    const copy = rows.map((r) => r.id);
    sortWaypoints(rows, { sort: 'name' });
    expect(rows.map((r) => r.id)).toEqual(copy);
  });
});
