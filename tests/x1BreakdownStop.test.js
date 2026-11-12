/**
 * breakdownStop (default off = current TT/OpenLoco crawl): OpenTTD vehicle.cpp:1397-1398 and
 * roadveh_cmd.cpp:1587-1592 — a broken-down road vehicle, train or ship forces cur_speed = 0 and the
 * controller returns, so it is a stationary obstacle until the breakdown timer expires; the breakdown
 * never ends early at a stop. Aircraft and UFO-frozen vehicles are unchanged.
 */
import { describe, expect, test } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { vehicleBreakdownTick } from '../js/simulation/loco/vehicle.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { MPH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';

const posOf = (v) => v.pathIndex * 1000 + v.progress;

/** A train on the coal line, set up with breakdowns on (same shape as breakdownCrawl.test.js). */
function coalTrain() {
  const g = flatGame();
  const { depotId } = coalLine(g);
  const eng = g.listModels('engine')[0], wag = g.listModels('wagon').find((w) => w.cargos.includes('COAL'));
  const v = g.buyVehicle(depotId, { modelId: eng.id, wagonModelId: wag.id, wagons: 1, cargoId: 'COAL' }).vehicle;
  const [a, b] = [g.state.stations[g.state.stations.length - 2], g.state.stations[g.state.stations.length - 1]];
  g.setOrders(v.id, [{ stationId: a.id, full: true }, { stationId: b.id }]);
  setSetting(g.state, 'breakdowns', 'normal');
  return { g, v };
}

function runUntilMoving(g, v) {
  expect(g.startVehicle(v.id).ok).toBe(true);
  for (let i = 0; i < 4000 && !(v.state === 'running' && v.speed > 0); i++) g.step();
  expect(v.speed).toBeGreaterThan(0);
}

function breakDown(v) {
  v.breakdownPending = true;
  vehicleBreakdownTick(v);
  expect(v.state).toBe('broken');
}

/** Straight road y=24 from x=20 to x=50, bus stops at 22 and 46, depot at (24,25). */
function roadWorld() {
  const g = flatGame(33);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  for (const x of [22, 46]) expect(g.buildRoadStop(x, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  return { g, depot: g.state.depots[g.state.depots.length - 1], model: g.listModels('road')[0] };
}

const stationAt = (g, x) => g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));

describe('breakdownStop settings invariant', () => {
  test('the default is off', () => {
    expect(DEFAULT_SETTINGS.breakdownStop).toBe(false);
  });

  test('there is exactly one SETTING_META entry, in group vehicles, type check', () => {
    const hits = SETTING_META.filter((e) => e.key === 'breakdownStop');
    expect(hits.length).toBe(1);
    expect(hits[0].group).toBe('vehicles');
    expect(hits[0].type).toBe('check');
  });
});

describe('breakdownStop off (default, OpenLoco crawl unchanged)', () => {
  test('a broken train keeps moving at <= maxSpeed/4 and > 0', () => {
    const { g, v } = coalTrain();
    runUntilMoving(g, v);
    breakDown(v);
    const cap = v.maxSpeed / 4;
    let moves = 0, maxSeen = 0;
    for (let i = 0; i < 2000 && v.state === 'broken'; i++) {
      const before = posOf(v);
      g.stepDays(1 / TICKS_PER_DAY);
      if (v.state !== 'broken') break;
      maxSeen = Math.max(maxSeen, v.speed);
      if (posOf(v) !== before) moves++;
    }
    expect(moves).toBeGreaterThan(0);
    expect(maxSeen).toBeGreaterThan(0);
    expect(maxSeen).toBeLessThanOrEqual(cap + 1e-9);
  });

  test('a broken ship is capped at 5 mph', () => {
    const g = flatGame();
    const path = [];
    for (let x = 10; x < 40; x++) path.push({ x, y: 20 });
    const ship = {
      id: 9100, kind: 'ship', state: 'broken', breakdownTicks: 1000, maxSpeed: 1, speed: 0,
      path, pathIndex: 0, progress: 0.5, history: [{ x: 10, y: 20 }], tx: 10, ty: 20,
      blockedTicks: 0, orders: [], orderIndex: 0, load: {}, cargo: [],
    };
    const ctx = { state: g.state, emit: () => {} };
    let maxSeen = 0, ticks = 0;
    for (let i = 0; i < 200 && ship.state === 'broken'; i++) { vehicleTick(ctx, ship); ticks++; if (ship.state === 'broken') maxSeen = Math.max(maxSeen, ship.speed); }
    expect(ticks).toBeGreaterThan(50);
    expect(maxSeen).toBeGreaterThan(0);
    expect(maxSeen).toBeLessThanOrEqual(5 * MPH_TO_TILES_PER_TICK + 1e-12);
    expect(maxSeen).toBeLessThan(1);
  });
});

describe('breakdownStop on (OpenTTD stop)', () => {
  test('a broken train stands at the same tile with speed 0', () => {
    const { g, v } = coalTrain();
    runUntilMoving(g, v);
    setSetting(g.state, 'breakdownStop', true);
    breakDown(v);
    g.step();
    const p0 = posOf(v);
    expect(v.speed).toBe(0);
    g.stepDays(2);
    expect(v.state).toBe('broken');
    expect(v.speed).toBe(0);
    expect(posOf(v)).toBe(p0);
    expect(v.tx).toBe(v.path[v.pathIndex].x);
    expect(v.ty).toBe(v.path[v.pathIndex].y);
  });

  test('a broken ship stays put (no 5 mph crawl)', () => {
    const g = flatGame();
    setSetting(g.state, 'breakdownStop', true);
    const path = [];
    for (let x = 10; x < 40; x++) path.push({ x, y: 20 });
    const ship = {
      id: 9101, kind: 'ship', state: 'broken', breakdownTicks: 500, maxSpeed: 1, speed: 0.2,
      path, pathIndex: 0, progress: 0.5, history: [{ x: 10, y: 20 }], tx: 10, ty: 20,
      blockedTicks: 0, orders: [], orderIndex: 0, load: {}, cargo: [],
    };
    const ctx = { state: g.state, emit: () => {} };
    for (let i = 0; i < 300; i++) vehicleTick(ctx, ship);
    expect(ship.state).toBe('broken');
    expect(ship.speed).toBe(0);
    expect(ship.progress).toBe(0.5);
    expect(ship.pathIndex).toBe(0);
  });

  test('it resumes when the breakdown timer expires', () => {
    const g = flatGame();
    setSetting(g.state, 'breakdownStop', true);
    const path = [];
    for (let x = 10; x < 60; x++) path.push({ x, y: 20 });
    const tr = {
      id: 9300, kind: 'train', state: 'broken', breakdownTicks: 10, maxSpeed: 1, speed: 0, wagons: 1,
      path, pathIndex: 0, progress: 0.5, history: [{ x: 10, y: 20 }], tx: 10, ty: 20,
      blockedTicks: 0, orders: [], orderIndex: 0, load: {}, cargo: [],
    };
    const ctx = { state: g.state, emit: () => {} };
    for (let i = 0; i < 9; i++) vehicleTick(ctx, tr);
    expect(tr.state).toBe('broken');
    expect(tr.breakdownTicks).toBe(1);
    expect(tr.speed).toBe(0);
    expect(tr.progress).toBe(0.5);
    vehicleTick(ctx, tr);
    expect(tr.state).toBe('running');
    expect(tr.breakdownTicks).toBe(0);
  });

  test('it does not end early at a stop where the crawl would', () => {
    const g = flatGame(19);
    // a station at the end of a short rail path: reaching it ends the crawl (path end -> arrival)
    expect(g.buildRail(20, 24, 30, 24).ok).toBe(true);
    expect(g.buildRailStation(30, 24, 'x', 1).ok).toBe(true);
    const st = g.state.stations[g.state.stations.length - 1];
    const path = [];
    for (let x = 20; x <= 30; x++) path.push({ x, y: 24 });
    const mk = (id, settings) => {
      setSetting(g.state, 'breakdownStop', settings);
      return {
        id, kind: 'train', state: 'broken', breakdownTicks: 1000, maxSpeed: 1, speed: 0.5, wagons: 1,
        path, pathIndex: 9, progress: 0.9, history: [{ x: 29, y: 24 }], tx: 29, ty: 24,
        blockedTicks: 0, orders: [{ stationId: st.id }], orderIndex: 0, load: {}, cargo: [],
      };
    };
    const ctx = { state: g.state, emit: () => {} };
    const off = mk(9400, false);
    for (let i = 0; i < 50 && off.state === 'broken'; i++) vehicleTick(ctx, off);
    expect(off.state).not.toBe('broken'); // crawl reaches the stop and the breakdown ends with it
    const on = mk(9401, true);
    for (let i = 0; i < 200; i++) vehicleTick(ctx, on);
    expect(on.state).toBe('broken');
    expect(on.pathIndex).toBe(9);
    expect(on.progress).toBe(0.9);
  });

  test('a follower is blocked behind the stopped vehicle', () => {
    const { g, depot, model } = roadWorld();
    setSetting(g.state, 'breakdownStop', true);
    const buy = () => {
      const r = g.buyVehicle(depot.id, { modelId: model.id });
      expect(r.ok).toBe(true);
      expect(g.setOrders(r.vehicle.id, [46, 22].map((x) => ({ stationId: stationAt(g, x).id }))).ok).toBe(true);
      expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
      return r.vehicle;
    };
    const lead = buy();
    const follow = buy();
    for (let i = 0; i < 2000 && !(lead.state === 'running' && lead.speed > 0 && lead.tx >= 28); i++) g.step();
    expect(lead.tx).toBeGreaterThanOrEqual(28);
    breakDown(lead);
    g.step(); // first broken tick: speed forced to 0
    const p0 = posOf(lead);
    let blocked = false;
    for (let i = 0; i < 4 * TICKS_PER_DAY && lead.state === 'broken'; i++) {
      g.step();
      if (follow.blockedTicks > 0) blocked = true;
      expect(posOf(lead)).toBe(p0);
      expect(lead.speed).toBe(0);
    }
    expect(blocked).toBe(true);
    expect(follow.tx === lead.tx && follow.ty === lead.ty).toBe(false);
  });

  test('aircraft keep their current behaviour with the setting on (they stop, as today)', () => {
    const g = flatGame();
    setSetting(g.state, 'breakdownStop', true);
    const ac = {
      id: 9200, kind: 'aircraft', state: 'broken', breakdownTicks: 1000, maxSpeed: 1, speed: 0.3,
      path: [{ x: 10, y: 20 }, { x: 20, y: 20 }], pathIndex: 0, progress: 0.2, history: [{ x: 10, y: 20 }],
      tx: 10, ty: 20, blockedTicks: 0, orders: [], orderIndex: 0, load: {}, alt: 1,
    };
    vehicleTick({ state: g.state, emit: () => {} }, ac);
    expect(ac.speed).toBe(0);
    expect(ac.progress).toBe(0.2);
  });
});
