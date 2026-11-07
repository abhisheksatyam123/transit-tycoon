import { test, expect } from 'bun:test';
import { depotGoals } from '../js/simulation/routing.js';

// OpenTTD FindClosest*Depot only considers the vehicle owner's depots; a fixed depot id is owner-checked when ordered.
test('nearest depot search skips rival depots', () => {
  const state = { depots: [
    { id: 1, kind: 'road', x: 1, y: 1 },
    { id: 2, kind: 'road', x: 2, y: 2, ownerId: 7 },
    { id: 3, kind: 'rail', x: 3, y: 3 },
  ] };
  expect(depotGoals(state, { kind: 'bus' })).toEqual([{ x: 1, y: 1 }]);
  expect(depotGoals(state, { kind: 'bus', ownerId: 7 })).toEqual([{ x: 2, y: 2 }]);
  expect(depotGoals(state, { kind: 'bus' }, 2)).toEqual([{ x: 2, y: 2 }]);
});
