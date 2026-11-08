import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { STOP_LOCATIONS, STOP_AT, normaliseOrders, orderFlagText } from '../js/simulation/orders.js';
import { planRoute, orderGoals } from '../js/simulation/routing.js';
import { trainLengthTiles } from '../js/simulation/platformLength.js';
import { serializeState, parseState } from '../js/simulation/save.js';

/** Platform of 8 rail tiles at y=24 (x 10..17) fed from the west by a straight line; a train of 4 vehicles (2 tiles). */
function setupTrainStation(stopLocation) {
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
  if (stopLocation !== undefined) order.stopLocation = stopLocation;
  v.orders = [order];
  v.orderIndex = 0;
  v.tx = 5;
  v.ty = 24;
  v.history = [{ x: 5, y: 24 }, { x: 4, y: 24 }];
  return { g, s, v, st };
}

function routeEnd(stopLocation) {
  const { s, v } = setupTrainStation(stopLocation);
  expect(trainLengthTiles(v)).toBe(2);
  expect(planRoute(s, v, orderGoals(s, v))).toBe(true);
  return v.path[v.path.length - 1];
}

describe('Order Stop Location (OpenTTD OrderStopLocation)', () => {
  test('constants define STOP_LOCATIONS and backwards-compatible STOP_AT', () => {
    expect(STOP_LOCATIONS).toEqual(['near', 'middle', 'far']);
    expect(STOP_AT).toEqual(['near', 'middle', 'far']);
  });

  describe('normaliseOrders with stopLocation / stopAt', () => {
    test('default near/far behaviour: near/far/middle validation and storage only for non-default', () => {
      const { s, v, st } = setupTrainStation();
      // middle is kept
      const rMid = normaliseOrders(s, v, [{ stationId: st.id, stopLocation: 'middle' }], () => 'rail');
      expect(rMid.ok).toBe(true);
      expect(rMid.orders[0].stopLocation).toBe('middle');
      expect(rMid.orders[0].stopAt).toBe('middle');

      // far is kept (when default is near)
      const rFar = normaliseOrders(s, v, [{ stationId: st.id, stopLocation: 'far' }], () => 'rail');
      expect(rFar.ok).toBe(true);
      expect(rFar.orders[0].stopLocation).toBe('far');

      // near is normalized / default (omitted from entry.stopLocation)
      const rNear = normaliseOrders(s, v, [{ stationId: st.id, stopLocation: 'near' }], () => 'rail');
      expect(rNear.ok).toBe(true);
      expect(rNear.orders[0].stopLocation).toBeUndefined();

      // stopAt compatibility
      const rStopAt = normaliseOrders(s, v, [{ stationId: st.id, stopAt: 'middle' }], () => 'rail');
      expect(rStopAt.ok).toBe(true);
      expect(rStopAt.orders[0].stopLocation).toBe('middle');
      expect(rStopAt.orders[0].stopAt).toBe('middle');
    });

    test('rejects invalid stopLocation and non-train vehicles', () => {
      const { s, v, st } = setupTrainStation();
      const rBad = normaliseOrders(s, v, [{ stationId: st.id, stopLocation: 'invalid' }], () => 'rail');
      expect(rBad.ok).toBe(false);

      const rBus = normaliseOrders(s, { kind: 'bus' }, [{ stationId: st.id, stopLocation: 'middle' }], () => 'bus');
      expect(rBus.ok).toBe(false);
    });
  });

  describe('modifyOrder stopLocation updates', () => {
    test('modifyOrder allows updating stopLocation and stopAt', () => {
      const { g, v } = setupTrainStation();
      expect(g.modifyOrder(v.id, 0, { stopLocation: 'middle' }).ok).toBe(true);
      expect(v.orders[0].stopLocation).toBe('middle');

      expect(g.modifyOrder(v.id, 0, { stopLocation: 'far' }).ok).toBe(true);
      expect(v.orders[0].stopLocation).toBe('far');

      expect(g.modifyOrder(v.id, 0, { stopLocation: 'near' }).ok).toBe(true);
      expect(v.orders[0].stopLocation).toBeUndefined();

      expect(g.modifyOrder(v.id, 0, { stopAt: 'middle' }).ok).toBe(true);
      expect(v.orders[0].stopLocation).toBe('middle');
    });
  });

  describe('movement/stopping position calculations', () => {
    test('near end: head stops so the train occupies the entry end (x 10..11)', () => {
      expect(routeEnd('near')).toEqual({ x: 11, y: 24 });
    });

    test('middle: head centred on the 8-tile platform (x 14, train x 13..14)', () => {
      expect(routeEnd('middle')).toEqual({ x: 14, y: 24 });
    });

    test('far: stops at the far end tile of the platform (x 17)', () => {
      expect(routeEnd('far')).toEqual({ x: 17, y: 24 });
    });
  });

  describe('save/load preservation', () => {
    test('preserves stopLocation across serialization', () => {
      const { g, s, v } = setupTrainStation();
      expect(g.modifyOrder(v.id, 0, { stopLocation: 'middle' }).ok).toBe(true);
      const json = serializeState(s);
      const loaded = parseState(json);
      const loadedV = loaded.vehicles.find((x) => x.id === v.id);
      expect(loadedV.orders[0].stopLocation).toBe('middle');
    });
  });
});
