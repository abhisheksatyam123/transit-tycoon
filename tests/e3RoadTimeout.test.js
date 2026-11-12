/**
 * E3 `roadvehDriveThrough` opt-in: a road vehicle (tram included) blocked by a moving (not loading) vehicle
 * for 1480 OpenTTD ticks / 20 days drives through it instead of taking the TT 3-day turn-around
 * (OpenTTD roadveh_cmd.cpp:698). Default off keeps the turn-around exactly; a loading blocker still uses the
 * bay-freeing path and is never driven through.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { beginOccupancy, syncOccupancy, BLOCK_TIMEOUT_TICKS, DRIVE_THROUGH_TICKS } from '../js/simulation/blocking.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

/** Straight road y=24 x=20..50 with a depot at (24,25); bus-stop roadWorld for the bay test. */
function roadWorld(stopXs) {
  const g = flatGame(33);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  for (const x of stopXs) expect(g.buildRoadStop(x, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  return { g, depot: g.state.depots[g.state.depots.length - 1], model: g.listModels('road')[0] };
}

const stationAt = (g, x) => g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));

function addRoadVehicle(g, depot, model, orders) {
  const r = g.buyVehicle(depot.id, { modelId: model.id });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, orders.map((x) => ({ stationId: stationAt(g, x).id, full: false }))).ok).toBe(true);
  expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
  return r.vehicle;
}

/**
 * A follower on a 21-tile straight road about to step onto the next tile, blocked there by a stationary
 * vehicle in the same direction. The blocker is never ticked, so it stays put; its state decides the path
 * (running = the moving-vehicle rule, loading = the bay rule).
 */
function blockedPair({ on = false, blockerState = 'running', roadType = 'bus', tramQueue = false } = {}) {
  const { g, depot, model } = roadWorld([]);
  setSetting(g.state, 'roadvehDriveThrough', on);
  if (tramQueue) {
    setSetting(g.state, 'tramQueue', true);
    expect(g.buildTram(20, 24, 50, 24).ok).toBe(true); // trams run on the tram layer
  }
  const bought = g.buyVehicle(depot.id, { modelId: model.id });
  const v = bought.vehicle;
  const path = [];
  for (let x = 20; x <= 40; x++) path.push({ x, y: 24 });
  Object.assign(v, {
    state: 'running', roadType, tx: 20, ty: 24, path, pathIndex: 0, progress: 0.9999, speed: 0,
    history: [{ x: 20, y: 24 }, { x: 19, y: 24 }], orders: [], orderIndex: 0, load: {}, cargo: [],
  });
  delete v.blockedTicks;
  delete v.blockedBy;
  const blocker = {
    id: 9000, kind: 'road', roadType: 'bus', state: blockerState, tx: 21, ty: 24,
    history: [{ x: 21, y: 24 }, { x: 20, y: 24 }], path: [{ x: 21, y: 24 }, { x: 22, y: 24 }, { x: 23, y: 24 }],
    pathIndex: 0, progress: 0, speed: 0, maxSpeed: 0, modelId: v.modelId, orders: [], orderIndex: 0, load: {}, cargo: [],
  };
  g.state.vehicles.push(blocker);
  return { g, v, blocker };
}

/** Advance only the follower (via movement.js vehicleTick) with a fresh occupancy index each tick. */
function tickVehicle(g, v, n = 1) {
  const ctx = { state: g.state, emit: () => {} };
  for (let i = 0; i < n; i++) {
    ctx.occupancy = beginOccupancy(g.state);
    vehicleTick(ctx, v);
    syncOccupancy(ctx, v);
    ctx.occupancy = null;
  }
}

describe('roadvehDriveThrough setting invariant', () => {
  test('defaults to off and preserves the 3-day turn-around constant', () => {
    expect(DEFAULT_SETTINGS.roadvehDriveThrough).toBe(false);
    expect(BLOCK_TIMEOUT_TICKS).toBe(3 * TICKS_PER_DAY);
  });

  test('the OpenTTD 1480-tick threshold converts to 20 days (1920 TT ticks)', () => {
    // 1480 OpenTTD ticks / 74 ticks-per-day = 20 days; TT has 96 ticks per day.
    expect(1480 / 74).toBe(20);
    expect(DRIVE_THROUGH_TICKS).toBe(20 * TICKS_PER_DAY);
    expect(DRIVE_THROUGH_TICKS).toBe(1920);
  });

  test('there is exactly one SETTING_META entry, in group vehicles, type check', () => {
    const hits = SETTING_META.filter((e) => e.key === 'roadvehDriveThrough');
    expect(hits.length).toBe(1);
    expect(hits[0].group).toBe('vehicles');
    expect(hits[0].type).toBe('check');
    expect(hits[0].help.length).toBeGreaterThan(20);
  });
});

describe('roadvehDriveThrough off (default, TT turn-around unchanged)', () => {
  test('blocked by a moving vehicle for 3 days turns around and re-plans', () => {
    const { g, v } = blockedPair({ on: false });
    v.blockedTicks = BLOCK_TIMEOUT_TICKS - 1;
    tickVehicle(g, v, 1);
    // turnAround: road vehicles back up one tile (path becomes [current, history[1]])
    expect(v.tx).toBe(20);
    expect(v.ty).toBe(24);
    expect(v.path.length).toBe(2);
    expect(v.path[0]).toEqual({ x: 20, y: 24 });
    expect(v.path[1]).toEqual({ x: 19, y: 24 });
    expect(v.pathIndex).toBe(0);
    expect(v.blockedTicks).toBeUndefined();
  });

  test('it does not drive through even when blockedTicks is far past the turn-around', () => {
    // off = the turn-around fires at 3 days, so a vehicle never reaches the long threshold
    const { g, v } = blockedPair({ on: false });
    v.blockedTicks = BLOCK_TIMEOUT_TICKS - 1;
    tickVehicle(g, v, 1);
    expect(v.tx).toBe(20); // turned, did not enter the blocker tile
  });
});

describe('roadvehDriveThrough on (OpenTTD drive-through)', () => {
  test('the 3-day turn-around is suppressed; it keeps waiting for the long threshold', () => {
    const { g, v } = blockedPair({ on: true });
    v.blockedTicks = BLOCK_TIMEOUT_TICKS - 1;
    tickVehicle(g, v, 1);
    expect(v.blockedTicks).toBe(BLOCK_TIMEOUT_TICKS);
    expect(v.tx).toBe(20);
    expect(v.path.length).toBe(21); // no turn-around path
  });

  test('after 20 days blocked by a moving vehicle it drives through instead of turning', () => {
    const { g, v } = blockedPair({ on: true });
    v.blockedTicks = DRIVE_THROUGH_TICKS - 1;
    tickVehicle(g, v, 1);
    expect(v.blockedTicks).toBeUndefined(); // driven through; the count restarts from 0
    expect(v.tx).toBe(21); // stepped onto the blocker's tile
    expect(v.pathIndex).toBe(1);
    expect(v.path.length).toBe(21); // not the 2-tile turn-around path
  });

  test('blocked by a loading vehicle the bay rule wins: no drive-through in either mode', () => {
    for (const on of [false, true]) {
      const { g, v } = blockedPair({ on, blockerState: 'loading' });
      v.blockedTicks = DRIVE_THROUGH_TICKS - 1;
      tickVehicle(g, v, 3);
      expect(v.blockedTicks).toBeGreaterThan(0); // still waiting for the bay, not reset
      expect(v.tx).toBe(20);
      expect(v.ty).toBe(24);
      expect(v.path.length).toBe(21); // no turn-around either
    }
  });

  test('a single-bay stop still frees the bay and serves both buses (loading path unchanged)', () => {
    const { g, depot, model } = roadWorld([30, 46]);
    setSetting(g.state, 'roadvehDriveThrough', true);
    const a = addRoadVehicle(g, depot, model, [30, 46]);
    const b = addRoadVehicle(g, depot, model, [30, 46]);
    let sharedLoading = false, seenA = false, seenB = false;
    const bay = { x: 30, y: 24 };
    for (let i = 0; i < 40 * 96 && !(seenA && seenB); i++) {
      g.step();
      if (a.state === 'loading' && b.state === 'loading') sharedLoading = true;
      if (a.state === 'loading' && a.tx === bay.x && a.ty === bay.y) seenA = true;
      if (b.state === 'loading' && b.tx === bay.x && b.ty === bay.y) seenB = true;
    }
    expect(sharedLoading).toBe(false);
    expect(seenA && seenB).toBe(true);
  });

  test('trams use the same path when tramQueue puts them on the road layer', () => {
    const { g, v } = blockedPair({ on: true, roadType: 'tram', tramQueue: true });
    v.blockedTicks = DRIVE_THROUGH_TICKS - 1;
    tickVehicle(g, v, 1);
    expect(v.tx).toBe(21);
    expect(v.path.length).toBe(21);
    expect(v.blockedTicks).toBeUndefined();
  });
});
