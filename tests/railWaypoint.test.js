/** Rail waypoints (cmdWaypoint.js): build/refuse/demolish on straight rail, trains go via, save round trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { isWaypointStation, isWaypointTile } from '../js/simulation/cmdWaypoint.js';
import { COSTS } from '../js/config/costs.js';

/** Rail line y=24 from x 13..39 with stations A(10) and C(40), depot at (20,25), coal mine and power station. */
function line() {
  const g = flatGame(11);
  const s = g.state;
  placeIndustry(s, 'coal_mine', 10, 20);
  placeIndustry(s, 'power_station', 40, 20);
  for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
    g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
  const depotId = s.depots[s.depots.length - 1].id;
  const [a, c] = s.stations.slice(-2);
  return { g, s, depotId, a, c };
}

const tileAt = (s, x, y) => s.map.tiles[y * s.map.width + x];

describe('rail waypoint build / refuse / demolish', () => {
  test('builds on a straight rail tile at the OpenTTD-style price', () => {
    const { g, s } = line();
    const money = s.company.money;
    const r = g.buildRailWaypoint(25, 24);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(COSTS.railWaypoint);
    const t = tileAt(s, 25, 24);
    expect(t.building).toMatchObject({ type: 'station', kind: 'waypoint', axis: 'x' });
    expect(t.rail).not.toBe(0); // the rail stays
    const st = s.stations.find((q) => q.id === r.stationId);
    expect(isWaypointStation(st)).toBe(true);
    expect(isWaypointTile(t)).toBe(true);
    expect(s.company.money).toBeLessThan(money);
  });

  test('dry run builds nothing', () => {
    const { g, s } = line();
    const n = s.stations.length;
    expect(g.buildRailWaypoint(25, 24, { dryRun: true }).ok).toBe(true);
    expect(s.stations.length).toBe(n);
    expect(tileAt(s, 25, 24).building).toBeFalsy();
  });

  test('refuses curves, junctions, bare land, road tiles and occupied tiles', () => {
    const { g, s } = line();
    expect(g.buildRailWaypoint(25, 25).ok).toBe(false); // no rail
    // a junction: a spur turns north from (30,24)
    expect(g.buildRail(30, 23, 30, 24).ok).toBe(true);
    expect(g.buildRailWaypoint(30, 24).ok).toBe(false);
    // a curve: the spur's corner with the main line
    tileAt(s, 33, 24).rail = 0x1 | 0x2; // north + east: a curve on a free tile
    expect(g.buildRailWaypoint(33, 24).ok).toBe(false);
    // a station tile
    expect(g.buildRailWaypoint(12, 24).ok).toBe(false);
    // road tile
    tileAt(s, 36, 24).road = 0x1 | 0x4;
    expect(g.buildRailWaypoint(36, 24).ok).toBe(false);
  });

  test('demolish removes the waypoint and its station, keeps the rail', () => {
    const { g, s } = line();
    const r = g.buildRailWaypoint(25, 24);
    expect(r.ok).toBe(true);
    const d = g.demolish(25, 24, 25, 24);
    expect(d.ok).toBe(true);
    expect(tileAt(s, 25, 24).building).toBeFalsy();
    expect(tileAt(s, 25, 24).rail).not.toBe(0);
    expect(s.stations.some((q) => q.id === r.stationId)).toBe(false);
  });
});

/** Run the train until it has passed its waypoint order; returns the order indices it went through. */
function runPast(g, v, wpStationId) {
  const seen = [];
  let loadedAtWp = false;
  for (let i = 0; i < 8000; i++) {
    g.step();
    if (v.state === 'loading' && v.atStationId === wpStationId) loadedAtWp = true;
    if (seen[seen.length - 1] !== v.orderIndex) seen.push(v.orderIndex);
    if (seen.includes(2)) break;
  }
  return { seen, loadedAtWp };
}

describe('trains go via a rail waypoint', () => {
  test('pass the waypoint without stopping and the order advances to the next station', () => {
    const { g, s, depotId, a, c } = line();
    const wp = g.buildRailWaypoint(25, 24);
    expect(wp.ok).toBe(true);
    const r = g.buyVehicle(depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    const orders = [{ stationId: a.id, full: false }, { stationId: wp.stationId, full: false }, { stationId: c.id, full: false }];
    expect(g.setOrders(v.id, orders).ok).toBe(true);
    expect(v.orders[1].stop).toBe('via');
    expect(g.startVehicle(v.id).ok).toBe(true);
    const { seen, loadedAtWp } = runPast(g, v, wp.stationId);
    expect(loadedAtWp).toBe(false);
    expect(seen).toContain(1);
    expect(seen).toContain(2); // order advanced past the waypoint to the destination
    expect(s.vehicles.includes(v)).toBe(true);
  });

  test('a waypoint is a path goal: the pathfinder routes through it', () => {
    const { g, depotId, a, c } = line();
    const wp = g.buildRailWaypoint(25, 24);
    const r = g.buyVehicle(depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    const v = r.vehicle;
    g.setOrders(v.id, [{ stationId: wp.stationId, full: false }, { stationId: c.id, full: false }]);
    g.startVehicle(v.id);
    for (let i = 0; i < 400; i++) { g.step(); }
    expect(v.path.some((p) => p.x === 25 && p.y === 24)).toBe(true);
    expect(a).toBeTruthy();
  });
});

describe('rail waypoint save round trip', () => {
  test('tile kind, station kind and via orders survive serialize/parse', () => {
    const { g, s, depotId, a, c } = line();
    const wp = g.buildRailWaypoint(25, 24);
    const r = g.buyVehicle(depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    g.setOrders(r.vehicle.id, [{ stationId: a.id, full: false }, { stationId: wp.stationId, full: false }, { stationId: c.id, full: false }]);
    const back = parseState(serializeState(s));
    const t = back.map.tiles[24 * back.map.width + 25];
    expect(t.building).toMatchObject({ type: 'station', kind: 'waypoint' });
    const st = back.stations.find((q) => q.id === wp.stationId);
    expect(isWaypointStation(st)).toBe(true);
    const v = back.vehicles.find((q) => q.id === r.vehicle.id);
    expect(v.orders[1].stop).toBe('via');
  });

  test('a save without waypoints has no waypoint fields (lazy, old saves load)', () => {
    const { s } = line();
    const json = serializeState(s);
    expect(json.includes('"waypoint"')).toBe(false);
    expect(parseState(json).stations.length).toBe(s.stations.length);
  });
});
