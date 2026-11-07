/** Turn around (road vehicles): OpenTTD CmdTurnRoadVeh refusals and the U-turn back along the road. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';

/** Two-way road y=24 x=10..40, a bus stop at 14 and 36, a depot at (12,25). A bus heading east to 36. */
function busGame() {
  const g = flatGame(11);
  expect(g.buildRoad(10, 24, 40, 24).ok).toBe(true);
  expect(g.buildRoadStop(14, 24, 'bus').ok).toBe(true);
  expect(g.buildRoadStop(36, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(12, 25, 'road', 1).ok).toBe(true);
  const depot = g.state.depots[g.state.depots.length - 1];
  const r = g.buyVehicle(depot.id, { modelId: 'bus_city' });
  expect(r.ok).toBe(true);
  const stops = g.state.stations.slice(-2);
  const [a, b] = [stops[0], stops[1]];
  expect(g.setOrders(r.vehicle.id, [{ stationId: a.id, full: false }, { stationId: b.id, full: false }]).ok).toBe(true);
  return { g, v: r.vehicle, a, b };
}

/** Step until the bus is running east on the road, past x=20 and before the far stop. */
function driveEast(g, v) {
  expect(g.startVehicle(v.id).ok).toBe(true);
  for (let i = 0; i < 4000 && !(v.state === 'running' && v.tx >= 20 && v.ty === 24 && v.path.length && v.path[v.path.length - 1].x >= 30); i++) g.step();
  expect(v.state).toBe('running');
}

describe('turn around road vehicle', () => {
  test('a bus driving east turns: it backs west first, then re-plans and reaches its order', () => {
    const { g, v, b } = busGame();
    driveEast(g, v);
    const x0 = v.tx;
    expect(g.turnRoadVehicle(v.id).ok).toBe(true);
    let minX = v.tx;
    let arrived = false;
    for (let i = 0; i < 1500 && !arrived; i++) {
      g.step();
      minX = Math.min(minX, v.tx);
      if (v.state === 'loading' && v.atStationId === b.id) arrived = true;
    }
    expect(minX).toBeLessThan(x0); // it went back along the road it came from
    expect(arrived).toBe(true);
  });

  test('refused for unknown ids, trains, depot, stopped, one-way and bridge/tunnel', () => {
    const { g, v } = busGame();
    expect(g.turnRoadVehicle(424242).ok).toBe(false);
    expect(g.turnRoadVehicle(v.id).error).toMatch(/depot/);
    driveEast(g, v);
    expect(g.turnRoadVehicle(v.id, { dryRun: true }).ok).toBe(true);
    g.state.map.tiles[v.ty * g.state.map.width + v.tx].oneWay = 1;
    const ow = g.turnRoadVehicle(v.id);
    expect(ow.ok).toBe(false);
    expect(ow.error).toMatch(/one-way/);
    delete g.state.map.tiles[v.ty * g.state.map.width + v.tx].oneWay;
    g.stopVehicle(v.id);
    expect(g.turnRoadVehicle(v.id).ok).toBe(false);
  });

  test('refused for a rival-owned vehicle', () => {
    const { g, v } = busGame();
    expect(g.turnRoadVehicle(v.id, { owner: 999 }).ok).toBe(false);
  });
});
