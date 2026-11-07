/** Road waypoints (cmdWaypoint.js buildRoadWaypoint): build/refuse/demolish on straight road, trucks go via, save round trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { isRoadWaypointStation, isRoadWaypointTile, isWaypointStation } from '../js/simulation/cmdWaypoint.js';
import { COSTS } from '../js/config/costs.js';
import { constructionTotal } from '../js/simulation/prices.js';

/** Straight road y=17 x 24..36, truck stops at (24,17) and (34,17), coal mine next to the far end, depot at (23,17). */
function road(seed = 7) {
  const g = flatGame(seed);
  const s = g.state;
  expect(g.buildRoad(24, 17, 36, 17).ok).toBe(true);
  const a = g.buildRoadStop(24, 17, 'truck');
  const c = g.buildRoadStop(34, 17, 'truck');
  expect(a.ok && c.ok).toBe(true);
  placeIndustry(s, 'coal_mine', 35, 19);
  const dep = g.buildDepot(23, 17, 'road', 2);
  expect(dep.ok).toBe(true);
  return { g, s, a, c, depotId: dep.depotId };
}

const tileAt = (s, x, y) => s.map.tiles[y * s.map.width + x];

describe('road waypoint build / refuse / demolish', () => {
  test('builds on a straight road tile at the road-stop price, keeps the road', () => {
    const { g, s } = road();
    const before = s.company.money;
    const r = g.buildRoadWaypoint(30, 17);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(constructionTotal(s, COSTS.roadWaypoint));
    expect(tileAt(s, 30, 17).road).not.toBe(0);
    expect(tileAt(s, 30, 17).building).toMatchObject({ type: 'station', kind: 'waypoint', road: true });
    expect(isRoadWaypointTile(tileAt(s, 30, 17))).toBe(true);
    expect(s.company.money).toBeLessThan(before);
    const st = s.stations.find((q) => q.id === r.stationId);
    expect(isRoadWaypointStation(st)).toBe(true);
    expect(isWaypointStation(st)).toBe(false); // a rail waypoint is never a road one
  });

  test('dry run builds nothing', () => {
    const { g, s } = road();
    const n = s.stations.length;
    expect(g.buildRoadWaypoint(30, 17, { dryRun: true }).ok).toBe(true);
    expect(s.stations.length).toBe(n);
    expect(tileAt(s, 30, 17).building).toBeFalsy();
  });

  test('refuses junctions, bare land, rail tiles, stops and occupied tiles', () => {
    const { g, s } = road();
    expect(g.buildRoadWaypoint(30, 18).ok).toBe(false); // no road
    expect(g.buildRoadWaypoint(24, 17).ok).toBe(false); // a truck stop
    // a junction: a spur turns south from (30,17)
    expect(g.buildRoad(30, 17, 30, 18).ok).toBe(true);
    expect(g.buildRoadWaypoint(30, 17).ok).toBe(false);
    // a curve: north + east bits on a free road tile
    tileAt(s, 32, 17).road = 0x1 | 0x2;
    expect(g.buildRoadWaypoint(32, 17).ok).toBe(false);
    // rail tile refused
    tileAt(s, 33, 17).rail = 0x2 | 0x8;
    expect(g.buildRoadWaypoint(33, 17).ok).toBe(false);
  });

  test('demolish removes the road waypoint and its station, keeps the road', () => {
    const { g, s } = road();
    const r = g.buildRoadWaypoint(30, 17);
    expect(g.demolish(30, 17, 30, 17).ok).toBe(true);
    expect(tileAt(s, 30, 17).building).toBeFalsy();
    expect(tileAt(s, 30, 17).road).not.toBe(0);
    expect(s.stations.some((q) => q.id === r.stationId)).toBe(false);
  });
});

describe('trucks go via a road waypoint', () => {
  test('pass the waypoint without stopping, the order advances to the next stop', () => {
    const { g, s, a, c, depotId } = road();
    const wp = g.buildRoadWaypoint(30, 17);
    expect(wp.ok).toBe(true);
    const r = g.buyVehicle(depotId, { modelId: 'trk_bulk', cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(g.setOrders(v.id, [{ stationId: a.stationId, full: false }, { stationId: wp.stationId, full: false }, { stationId: c.stationId, full: false }]).ok).toBe(true);
    expect(v.orders[1].stop).toBe('via');
    expect(g.startVehicle(v.id).ok).toBe(true);
    const seen = [];
    let stoppedAtWp = false;
    for (let i = 0; i < 6000 && !seen.includes(2); i++) {
      g.step();
      if (v.state === 'loading' && v.atStationId === wp.stationId) stoppedAtWp = true;
      if (seen[seen.length - 1] !== v.orderIndex) seen.push(v.orderIndex);
    }
    expect(stoppedAtWp).toBe(false);
    expect(seen).toContain(1);
    expect(seen).toContain(2);
    expect(s.vehicles.includes(v)).toBe(true);
  });

  test('a road waypoint is a path goal: the pathfinder routes through it', () => {
    const { g, a, c, depotId } = road();
    const wp = g.buildRoadWaypoint(30, 17);
    const v = g.buyVehicle(depotId, { modelId: 'trk_bulk', cargoId: 'COAL' }).vehicle;
    g.setOrders(v.id, [{ stationId: wp.stationId, full: false }, { stationId: c.stationId, full: false }]);
    g.startVehicle(v.id);
    for (let i = 0; i < 400; i++) g.step();
    expect(v.path.some((p) => p.x === 30 && p.y === 17)).toBe(true);
    expect(a).toBeTruthy();
  });

  test('buses order a road waypoint as go-via too (OpenTTD: any road vehicle passes a waypoint)', () => {
    const { g, s, depotId } = road();
    const wp = g.buildRoadWaypoint(30, 17);
    const bus = g.buildRoadStop(28, 17, 'bus');
    expect(bus.ok).toBe(true);
    const busVeh = g.buyVehicle(s.depots.find((d) => d.kind === 'road').id, { modelId: 'bus_city' });
    expect(busVeh.ok).toBe(true);
    const r = g.setOrders(busVeh.vehicle.id, [{ stationId: bus.stationId, full: false }, { stationId: wp.stationId, full: false }]);
    expect(r.ok).toBe(true);
    expect(busVeh.vehicle.orders[1].stop).toBe('via');
    expect(depotId).toBeTruthy();
  });
});

describe('road waypoint save round trip', () => {
  test('tile road flag, station kind and via orders survive serialize/parse', () => {
    const { g, s, a, c, depotId } = road();
    const wp = g.buildRoadWaypoint(30, 17);
    const r = g.buyVehicle(depotId, { modelId: 'trk_bulk', cargoId: 'COAL' });
    g.setOrders(r.vehicle.id, [{ stationId: a.stationId, full: false }, { stationId: wp.stationId, full: false }, { stationId: c.stationId, full: false }]);
    const back = parseState(serializeState(s));
    const t = back.map.tiles[17 * back.map.width + 30];
    expect(t.building).toMatchObject({ type: 'station', kind: 'waypoint', road: true });
    const st = back.stations.find((q) => q.id === wp.stationId);
    expect(isRoadWaypointStation(st)).toBe(true);
    const v = back.vehicles.find((q) => q.id === r.vehicle.id);
    expect(v.orders[1].stop).toBe('via');
  });

  test('old saves without road waypoints load and carry no road waypoint fields', () => {
    const { s } = road();
    const json = serializeState(s);
    expect(json.includes('"road":true')).toBe(false);
    expect(parseState(json).stations.length).toBe(s.stations.length);
  });
});
