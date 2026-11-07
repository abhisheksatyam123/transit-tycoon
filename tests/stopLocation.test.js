import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { planRoute, orderGoals } from '../js/simulation/routing.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { trainLengthTiles } from '../js/simulation/platformLength.js';

/** Platform of 8 rail tiles at y=24 (x 10..17) fed from the west by a straight line; a train of 4 vehicles (2 tiles). */
function route(stopAt) {
  const g = flatGame();
  const s = g.state;
  expect(g.buildRailStation(10, 24, 'x', 8).ok).toBe(true);
  expect(g.buildRail(9, 24, 4, 24).ok).toBe(true);
  const st = s.stations[s.stations.length - 1];
  expect(g.buildDepot(4, 25, 'rail', 1).ok).toBe(true);
  const dep = s.depots[s.depots.length - 1];
  const b = g.buyVehicle(dep.id, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 3, cargoId: 'COAL' });
  expect(b.ok).toBe(true);
  const v = b.vehicle;
  const order = { stationId: st.id, load: 'normal', unload: 'normal' };
  if (stopAt) order.stopAt = stopAt;
  v.orders = [order]; v.orderIndex = 0;
  v.tx = 5; v.ty = 24; v.history = [{ x: 5, y: 24 }, { x: 4, y: 24 }];
  expect(trainLengthTiles(v)).toBe(2);
  expect(planRoute(s, v, orderGoals(s, v))).toBe(true);
  return v.path[v.path.length - 1];
}

describe('train stop location on a platform longer than the train (OpenTTD GetTrainStopLocation)', () => {
  test('absent stopAt = far end (current behaviour, OSL_PLATFORM_FAR_END)', () => {
    expect(route(undefined)).toEqual({ x: 17, y: 24 });
  });
  test('far end explicitly', () => {
    expect(route('far')).toEqual({ x: 17, y: 24 });
  });
  test('near end: head stops so the train occupies the entry end (x 10..11)', () => {
    expect(route('near')).toEqual({ x: 11, y: 24 });
  });
  test('middle: head centred on the 8-tile platform (x 14, train x 13..14)', () => {
    expect(route('middle')).toEqual({ x: 14, y: 24 });
  });
});
