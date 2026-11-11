/**
 * ad-road round: articulated road vehicles vs overtaking (OpenTTD roadveh_cmd.cpp:828-829), articulated
 * vehicles refused at a bay road stop while articulatedRV is off (roadstop.cpp:225 / roadveh_cmd.cpp:907),
 * and the opt-in roadvehQueue setting (OpenTTD pf.roadveh_queue, roadveh_cmd.cpp:919).
 */
import { test, expect, describe } from 'bun:test';
import { tryOvertake, overtakeEnabled } from '../js/simulation/roadOvertake.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { flatGame } from './helpers.js';

const W = 12;
/** Fake state: straight east-west road y=5 from x=0..11, bit E=2 W=8. */
function fakeState(extra = {}) {
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  for (let x = 0; x < W; x++) tiles[5 * W + x].road = 2 | 8;
  for (const [k, val] of Object.entries(extra)) { const [x, y] = k.split(',').map(Number); Object.assign(tiles[y * W + x], val); }
  return { map: { width: W, height: W, tiles }, settings: { roadOvertaking: true }, vehicles: [] };
}
function veh(id, x, path, speed, maxSpeed, extra = {}) {
  return { id, kind: 'road', roadType: 'bus', state: 'running', speed, maxSpeed, progress: 0,
    tx: x, ty: 5, path: path.map((px) => ({ x: px, y: 5 })), pathIndex: 0,
    history: [{ x, y: 5 }, { x: x - 1, y: 5 }, { x: x - 2, y: 5 }], ...extra };
}
function ctxOf(state, vs) { state.vehicles = vs; return { state, occupancy: null }; }

describe('articulated road vehicles never overtake (OpenTTD roadveh_cmd.cpp:828-829)', () => {
  test('default: roadOvertaking off, so an articulated vehicle overtakes nobody', () => {
    expect(DEFAULT_SETTINGS.roadOvertaking).toBe(false);
    expect(overtakeEnabled({ settings: {} })).toBe(false);
    const st = fakeState();
    st.settings = {}; // default settings
    const artic = veh(1, 2, [2, 3, 4, 5, 6], 0.5, 1.2, { modelId: 'bus_artic' }); // faster, behind
    const truck = veh(2, 3, [3, 4, 5, 6], 0.3, 0.6);
    expect(tryOvertake(ctxOf(st, [artic, truck]), artic, truck)).toBe(false);
    expect(artic.overtakeId).toBeUndefined();
  });

  test('with roadOvertaking on an articulated vehicle still does not overtake (plain one does)', () => {
    // articulated faster bus behind a slow truck: refused (roadveh_cmd.cpp:828-829)
    const stA = fakeState(); // settings.roadOvertaking = true
    const artic = veh(1, 2, [2, 3, 4, 5, 6], 0.5, 1.2, { modelId: 'bus_artic' });
    const truckA = veh(2, 3, [3, 4, 5, 6], 0.3, 0.6);
    expect(tryOvertake(ctxOf(stA, [artic, truckA]), artic, truckA)).toBe(false);
    expect(artic.overtakeId).toBeUndefined();
    // control: the same situation with a plain bus does overtake, so the gate above is the articulation
    const stB = fakeState();
    const plain = veh(1, 2, [2, 3, 4, 5, 6], 0.5, 1.2);
    const truckB = veh(2, 3, [3, 4, 5, 6], 0.3, 0.6);
    expect(tryOvertake(ctxOf(stB, [plain, truckB]), plain, truckB)).toBe(true);
    expect(plain.overtakeId).toBe(2);
  });
});

/** Road y=24 from x=20..50, bus stops at 30 and 46, road depot at (24,25). */
function bayWorld() {
  const g = flatGame(33);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  expect(g.buildRoadStop(30, 24, 'bus').ok).toBe(true);
  expect(g.buildRoadStop(46, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  const depot = g.state.depots[g.state.depots.length - 1];
  const stationAt = (x) => g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));
  return { g, depot, stationAt };
}

function buy(g, depot, stationAt, modelId, stops) {
  const r = g.buyVehicle(depot.id, { modelId });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, stops.map((x) => ({ stationId: stationAt(x).id, full: false }))).ok).toBe(true);
  expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
  return r.vehicle;
}

/** Park a vehicle on a tile with a straight path east and a history that indexes the tile. */
function plant(v, x, y, dir = 1, speed = 0.5) {
  v.state = 'running'; v.tx = x; v.ty = y; v.speed = speed; v.progress = 0.8;
  v.path = [{ x, y }, { x: x + dir, y }]; v.pathIndex = 0;
  v.history = [{ x, y }, { x: x - dir, y }];
}

/** A vehicle loading in the bay at (30,24). */
function parkLoading(v, stationId, ticks = 150) {
  v.state = 'loading'; v.atStationId = stationId; v.tx = 30; v.ty = 24; v.speed = 0;
  v.loadingTicks = ticks; v.progress = 0; v.pathIndex = 0;
  v.path = [{ x: 30, y: 24 }];
  v.history = [{ x: 30, y: 24 }, { x: 29, y: 24 }];
}

describe('articulated vehicles at a bay road stop (OpenTTD roadstop.cpp:225 / roadveh_cmd.cpp:907)', () => {
  test('articulatedRV off: an articulated vehicle does not enter a bay stop', () => {
    const { g, depot, stationAt } = bayWorld();
    setSetting(g.state, 'articulatedRV', true); // the setting offers the model...
    g.state.date.year = 1990;
    const bus = buy(g, depot, stationAt, 'bus_artic', [30, 46]);
    setSetting(g.state, 'articulatedRV', false); // ...and is off again: the bay is refused
    plant(bus, 29, 24);
    let entered = false;
    for (let i = 0; i < 200; i++) { g.step(); if (bus.tx === 30 && bus.ty === 24) entered = true; }
    expect(entered).toBe(false);
    expect(bus.state).not.toBe('loading');
  });

  test('articulatedRV on: the same articulated vehicle serves the bay (default gate unchanged)', () => {
    const { g, depot, stationAt } = bayWorld();
    setSetting(g.state, 'articulatedRV', true);
    g.state.date.year = 1990;
    const bus = buy(g, depot, stationAt, 'bus_artic', [30, 46]);
    plant(bus, 29, 24);
    let served = false;
    for (let i = 0; i < 200 && !served; i++) { g.step(); if (bus.state === 'loading' && bus.tx === 30) served = true; }
    expect(served).toBe(true);
    expect(getSetting(g.state, 'articulatedRV')).toBe(true);
  });
});

describe('roadvehQueue (OpenTTD pf.roadveh_queue, roadveh_cmd.cpp:919)', () => {
  test('default true, one SETTING_META entry in the vehicles group', () => {
    expect(DEFAULT_SETTINGS.roadvehQueue).toBe(true);
    const entries = SETTING_META.filter((m) => m.key === 'roadvehQueue');
    expect(entries.length).toBe(1);
    expect(entries[0].group).toBe('vehicles');
    expect(entries[0].type).toBe('check');
  });

  test('default: a vehicle queues at a busy bay and enters when it frees', () => {
    const { g, depot, stationAt } = bayWorld();
    const a = buy(g, depot, stationAt, 'bus_city', [30, 46]);
    const b = buy(g, depot, stationAt, 'bus_city', [30, 46]);
    parkLoading(a, stationAt(30).id, 100);
    plant(b, 29, 24);
    let leftEntrance = false, enteredWhileBusy = false;
    for (let i = 0; i < 100; i++) {
      g.step();
      if (b.tx !== 29 || b.ty !== 24) leftEntrance = true;
      if (a.state === 'loading' && b.tx === 30) enteredWhileBusy = true;
    }
    expect(leftEntrance).toBe(false); // it waited at the bay entrance, in place
    expect(enteredWhileBusy).toBe(false); // and never shared the bay
    expect(b.state).toBe('running'); // the bay is still busy: it is still queued
    let served = false;
    for (let i = 0; i < 400 && !served; i++) { g.step(); if (b.state === 'loading' && b.tx === 30) served = true; }
    expect(served).toBe(true); // it entered once the bay was free
  });

  test('roadvehQueue off: the vehicle does not enter a bay with no free bay; it keeps driving', () => {
    const { g, depot, stationAt } = bayWorld();
    setSetting(g.state, 'roadvehQueue', false);
    const a = buy(g, depot, stationAt, 'bus_city', [30, 46]);
    const b = buy(g, depot, stationAt, 'bus_city', [30, 46]);
    parkLoading(a, stationAt(30).id, 100);
    plant(b, 29, 24);
    for (let i = 0; i < 8; i++) g.step();
    expect(b.tx).not.toBe(29); // it drove off instead of waiting for the bay
    expect(b.blockedTicks).toBeUndefined();
    expect(b.state).not.toBe('loading');
    let served = false;
    for (let i = 0; i < 400 && !served; i++) { g.step(); if (b.state === 'loading' && b.tx === 30) served = true; }
    expect(served).toBe(true); // it came back once the bay was free
  });
});
