import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { findPath, RAIL_COSTS } from '../js/simulation/pathfinder.js';
import { setSetting } from '../js/simulation/settings.js';
import { findVehiclePath } from '../js/simulation/routing.js';

describe('pathCosts cost model', () => {
  test('constants match OpenTTD YAPF proportions (with 90-deg grid turns)', () => {
    // OpenTTD defaults (YAPF_TILE_LENGTH = 100):
    // rail_curve45_penalty = 1 * YAPF_TILE_LENGTH (1.0x)
    // rail_curve90_penalty = 6 * YAPF_TILE_LENGTH (6.0x)
    // rail_slope_penalty = 2 * YAPF_TILE_LENGTH (2.0x)
    // rail_station_penalty = 10 * YAPF_TILE_LENGTH (10.0x)
    // rail_firstred_penalty = 10 * YAPF_TILE_LENGTH (10.0x)
    // rail_pbs_cross_penalty = 3 * YAPF_TILE_LENGTH (3.0x)
    expect(RAIL_COSTS.STRAIGHT).toBe(1.0);
    expect(RAIL_COSTS.CURVE).toBe(1.0);
    expect(RAIL_COSTS.SLOPE_UP).toBe(2.0);
    expect(RAIL_COSTS.STATION_PASS).toBe(10.0);
    expect(RAIL_COSTS.OCCUPIED_BLOCK).toBe(10.0);
    expect(RAIL_COSTS.RESERVED_TILE).toBe(3.0);
  });

  test('(a) prefers a flat route over a hilly one of equal length when ON, bit-identical when OFF', () => {
    const g = flatGame(11);
    const m = g.state.map;
    // Build symmetric fork at (10, 20) to (30, 20)
    // North path: (10,20) -> (10, 18) -> (30, 18) -> (30, 20)
    expect(g.buildRail(10, 20, 10, 18).ok).toBe(true);
    expect(g.buildRail(10, 18, 30, 18).ok).toBe(true);
    expect(g.buildRail(30, 18, 30, 20).ok).toBe(true);
    // South path: (10,20) -> (10, 22) -> (30, 22) -> (30, 20)
    expect(g.buildRail(10, 20, 10, 22).ok).toBe(true);
    expect(g.buildRail(10, 22, 30, 22).ok).toBe(true);
    expect(g.buildRail(30, 22, 30, 20).ok).toBe(true);

    // Make North path hilly: hill at (20, 18)
    m.tiles[18 * m.width + 20].height = 2;

    const start = { x: 10, y: 20 };
    const goal = [{ x: 30, y: 20 }];

    // With pathCosts OFF: North route is chosen by default order (direction bit 1 before bit 4)
    const pathDefault = findPath(m, start, goal, 'rail');
    const pathOff = findPath(m, start, goal, 'rail', { pathCosts: false });
    expect(pathOff).toEqual(pathDefault);
    expect(pathOff.some((p) => p.y === 18)).toBe(true);

    // With pathCosts ON: uphill penalty causes South (flat) route to be chosen
    const pathOn = findPath(m, start, goal, 'rail', { pathCosts: true });
    expect(pathOn).not.toBeNull();
    expect(pathOn.some((p) => p.y === 22)).toBe(true);
    expect(pathOn.some((p) => p.y === 18)).toBe(false);
  });

  test('(b) prefers a free parallel track over an occupied one or red signal', () => {
    const g = flatGame(12);
    const map = g.state.map;
    // Symmetric North / South routes
    expect(g.buildRail(10, 20, 10, 18).ok).toBe(true);
    expect(g.buildRail(10, 18, 30, 18).ok).toBe(true);
    expect(g.buildRail(30, 18, 30, 20).ok).toBe(true);

    expect(g.buildRail(10, 20, 10, 22).ok).toBe(true);
    expect(g.buildRail(10, 22, 30, 22).ok).toBe(true);
    expect(g.buildRail(30, 22, 30, 20).ok).toBe(true);

    // Signals on both routes
    expect(g.buildSignal(20, 18).ok).toBe(true);
    expect(g.buildSignal(20, 22).ok).toBe(true);

    // Place a train on North track (x=22, y=18)
    g.state.vehicles.push({
      id: 99,
      kind: 'train',
      tx: 22,
      ty: 18,
      state: 'running',
      history: [{ x: 22, y: 18 }, { x: 21, y: 18 }],
    });

    const start = { x: 10, y: 20 };
    const goal = [{ x: 30, y: 20 }];

    // With pathCosts OFF: takes default North route
    const pathOff = findPath(map, start, goal, 'rail', { pathCosts: false, state: g.state });
    expect(pathOff.some((p) => p.y === 18)).toBe(true);

    // With pathCosts ON: avoids the occupied North track and chooses free South track
    const pathOn = findPath(map, start, goal, 'rail', { pathCosts: true, state: g.state });
    expect(pathOn.some((p) => p.y === 22)).toBe(true);
    expect(pathOn.some((p) => p.y === 18)).toBe(false);

    // Also test path-signal reservation
    g.state.vehicles = []; // clear train
    g.state.resv = { [18 * map.width + 22]: 88 }; // reserved by train 88
    const pathResv = findPath(map, start, goal, 'rail', { pathCosts: true, state: g.state });
    expect(pathResv.some((p) => p.y === 22)).toBe(true);
    expect(pathResv.some((p) => p.y === 18)).toBe(false);
  });

  test('(c) avoids passing through a non-goal station when a bypass exists', () => {
    const g = flatGame(13);
    const map = g.state.map;
    // Straight track with an intermediate station: (10, 20) to (30, 20)
    expect(g.buildRail(10, 20, 30, 20).ok).toBe(true);
    // Put station at (20, 20)
    map.tiles[20 * map.width + 20].building = { type: 'station', stationId: 5 };

    // Build bypass loop around station: (18, 20) -> (18, 21) -> (22, 21) -> (22, 20)
    expect(g.buildRail(18, 20, 18, 21).ok).toBe(true);
    expect(g.buildRail(18, 21, 22, 21).ok).toBe(true);
    expect(g.buildRail(22, 21, 22, 20).ok).toBe(true);

    const start = { x: 10, y: 20 };
    const goal = [{ x: 30, y: 20 }];

    // With pathCosts OFF: takes straight path straight through the station (shorter Manhattan)
    const pathOff = findPath(map, start, goal, 'rail', { pathCosts: false });
    expect(pathOff.some((p) => p.x === 20 && p.y === 20)).toBe(true);
    expect(pathOff.some((p) => p.y === 21)).toBe(false);

    // With pathCosts ON: bypass is chosen over passing through non-goal station
    const pathOn = findPath(map, start, goal, 'rail', { pathCosts: true });
    expect(pathOn.some((p) => p.x === 20 && p.y === 20)).toBe(false);
    expect(pathOn.some((p) => p.y === 21)).toBe(true);

    // But when the station IS the goal, the station path must be taken directly!
    const pathGoalStation = findPath(map, start, [{ x: 20, y: 20 }], 'rail', { pathCosts: true });
    expect(pathGoalStation[pathGoalStation.length - 1]).toEqual({ x: 20, y: 20 });
    expect(pathGoalStation.some((p) => p.y === 21)).toBe(false);
  });

  test('vehicle routing uses pathCosts setting via findVehiclePath', () => {
    const g = flatGame(14);
    const map = g.state.map;
    // Straight track with station at (20, 20) and bypass at y=21
    expect(g.buildRail(10, 20, 30, 20).ok).toBe(true);
    map.tiles[20 * map.width + 20].building = { type: 'station', stationId: 5 };
    expect(g.buildRail(18, 20, 18, 21).ok).toBe(true);
    expect(g.buildRail(18, 21, 22, 21).ok).toBe(true);
    expect(g.buildRail(22, 21, 22, 20).ok).toBe(true);

    const train = {
      id: 1,
      kind: 'train',
      tx: 10,
      ty: 20,
      history: [{ x: 10, y: 20 }],
    };

    // Default setting (OFF)
    const p1 = findVehiclePath(g.state, train, [{ x: 30, y: 20 }]);
    expect(p1.some((p) => p.x === 20 && p.y === 20)).toBe(true);

    // Turn setting ON
    setSetting(g.state, 'pathCosts', true);
    const p2 = findVehiclePath(g.state, train, [{ x: 30, y: 20 }]);
    expect(p2.some((p) => p.x === 20 && p.y === 20)).toBe(false);
    expect(p2.some((p) => p.y === 21)).toBe(true);
  });
});
