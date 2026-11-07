import { test, expect, describe } from 'bun:test';
import { tryOvertake, overtakeTick, overtakeEnabled, overtakeSpeed, OVERTAKE_TIMEOUT_TICKS } from '../js/simulation/roadOvertake.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
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
  const v = { id, kind: 'road', roadType: 'bus', state: 'running', speed, maxSpeed, progress: 0,
    tx: x, ty: 5, path: path.map((px) => ({ x: px, y: 5 })), pathIndex: 0, history: [{ x, y: 5 }, { x: x - 1, y: 5 }, { x: x - 2, y: 5 }] , ...extra };
  return v;
}
function ctxOf(state, vs) { state.vehicles = vs; return { state, occupancy: null }; }

describe('roadOvertake rules', () => {
  test('default off', () => {
    expect(DEFAULT_SETTINGS.roadOvertaking).toBe(false);
    expect(overtakeEnabled({ settings: {} })).toBe(false);
  });

  test('fast bus starts overtaking a slow truck on a straight road', () => {
    const st = fakeState();
    const bus = veh(1, 2, [2, 3, 4, 5, 6], 0.5, 1.2);
    const truck = veh(2, 3, [3, 4, 5, 6], 0.3, 0.6);
    const ctx = ctxOf(st, [bus, truck]);
    expect(tryOvertake(ctx, bus, truck)).toBe(true);
    expect(bus.overtakeId).toBe(2);
    expect(bus.overtakeCtr).toBe(0);
  });

  test('no overtake of a faster or equal vehicle', () => {
    const st = fakeState();
    const bus = veh(1, 2, [2, 3, 4, 5], 0.5, 1.0);
    const truck = veh(2, 3, [3, 4, 5], 0.6, 1.2);
    expect(tryOvertake(ctxOf(st, [bus, truck]), bus, truck)).toBe(false);
  });

  test('stopped vehicle in front: overtake with half timeout', () => {
    const st = fakeState();
    const bus = veh(1, 2, [2, 3, 4, 5], 0.5, 1.2);
    const truck = veh(2, 3, [3, 4, 5], 0, 0.6);
    expect(tryOvertake(ctxOf(st, [bus, truck]), bus, truck)).toBe(true);
    expect(bus.overtakeCtr).toBe(OVERTAKE_TIMEOUT_TICKS / 2);
  });

  test('no overtake at a junction on the overtake window', () => {
    const st = fakeState({ '4,5': { road: 2 | 8 | 1 } });
    const bus = veh(1, 2, [2, 3, 4, 5], 0.5, 1.2);
    const truck = veh(2, 3, [3, 4, 5], 0.3, 0.6);
    expect(tryOvertake(ctxOf(st, [bus, truck]), bus, truck)).toBe(false);
  });

  test('no overtake into a station tile', () => {
    const st = fakeState({ '4,5': { building: { type: 'station' } } });
    const bus = veh(1, 2, [2, 3, 4, 5], 0.5, 1.2);
    const truck = veh(2, 3, [3, 4, 5], 0.3, 0.6);
    expect(tryOvertake(ctxOf(st, [bus, truck]), bus, truck)).toBe(false);
  });

  test('no overtake with an oncoming vehicle in the window (opposite lane busy)', () => {
    const st = fakeState();
    const bus = veh(1, 2, [2, 3, 4, 5], 0.5, 1.2);
    const truck = veh(2, 3, [3, 4, 5], 0.3, 0.6);
    const oncoming = veh(3, 5, [5, 4, 3], 0.4, 0.8, { history: [{ x: 5, y: 5 }, { x: 6, y: 5 }] }); // moving west
    expect(tryOvertake(ctxOf(st, [bus, truck, oncoming]), bus, truck)).toBe(false);
  });

  test('no overtake when a third vehicle is on the window', () => {
    const st = fakeState();
    const bus = veh(1, 2, [2, 3, 4, 5], 0.5, 1.2);
    const truck = veh(2, 3, [3, 4, 5], 0.3, 0.6);
    const third = veh(4, 4, [4, 5], 0.3, 0.6);
    expect(tryOvertake(ctxOf(st, [bus, truck, third]), bus, truck)).toBe(false);
  });

  test('trams never overtake nor are overtaken', () => {
    const st = fakeState();
    const tram = veh(1, 2, [2, 3, 4, 5], 0.5, 1.2, { roadType: 'tram' });
    const truck = veh(2, 3, [3, 4, 5], 0.3, 0.6);
    expect(tryOvertake(ctxOf(st, [tram, truck]), tram, truck)).toBe(false);
    const bus = veh(3, 2, [2, 3, 4, 5], 0.5, 1.2);
    const tr2 = veh(4, 3, [3, 4, 5], 0.3, 0.6, { roadType: 'tram' });
    expect(tryOvertake(ctxOf(st, [bus, tr2]), bus, tr2)).toBe(false);
  });

  test('overtakeTick: station tile or timeout on straight road ends the overtake', () => {
    const st = fakeState({ '4,5': { building: { type: 'station' } } });
    const v = veh(1, 2, [2, 3], 0.5, 1.2, { overtakeId: 9, overtakeCtr: 0 });
    v.tx = 4; v.ty = 5;
    overtakeTick(ctxOf(st, [v]), v);
    expect(v.overtakeId).toBeUndefined();
    const st2 = fakeState();
    const w = veh(2, 2, [2, 3], 0.5, 1.2, { overtakeId: 9, overtakeCtr: 0 });
    for (let i = 0; i < OVERTAKE_TIMEOUT_TICKS; i++) overtakeTick(ctxOf(st2, [w]), w);
    expect(w.overtakeId).toBeUndefined();
  });

  test('overtakeTick: setting off clears the overtake', () => {
    const st = fakeState();
    setSetting(st, 'roadOvertaking', false);
    const v = veh(1, 2, [2, 3], 0.5, 1.2, { overtakeId: 9, overtakeCtr: 0 });
    overtakeTick(ctxOf(st, [v]), v);
    expect(v.overtakeId).toBeUndefined();
  });
});

describe('roadOvertake in a game', () => {
  function roadWorld() {
    const g = flatGame(33);
    expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
    expect(g.buildRoadStop(40, 24, 'truck').ok).toBe(true);
    expect(g.buildRoadStop(46, 24, 'truck').ok).toBe(true);
    expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
    return g;
  }
  function run(on) {
    const g = roadWorld();
    setSetting(g.state, 'roadOvertaking', on);
    const depot = g.state.depots[g.state.depots.length - 1];
    const st = (x) => g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));
    const truck = g.buyVehicle(depot.id, { modelId: 'trk_bulk' }).vehicle; // 48 km/h, the slow one (lower id)
    const bus = g.buyVehicle(depot.id, { modelId: 'trk_goods' }).vehicle; // 56 km/h, the fast one
    expect(g.setOrders(bus.id, [{ stationId: st(46).id, full: false }]).ok).toBe(true);
    expect(g.setOrders(truck.id, [{ stationId: st(46).id, full: false }]).ok).toBe(true);
    expect(g.startVehicle(truck.id).ok).toBe(true);
    expect(g.startVehicle(bus.id).ok).toBe(true); // same tick: the fast one catches the slow one on the open road
    let overtook = false;
    for (let i = 0; i < 30 * 96; i++) {
      g.step();
      if (bus.overtakeId === truck.id) overtook = true;
    }
    return { overtook, bus, truck };
  }

  test('setting on: the fast bus overtakes the slow truck on the straight road', () => {
    const r = run(true);
    expect(r.overtook).toBe(true);
  });

  test('setting off: the bus never overtakes (unchanged behaviour)', () => {
    const r = run(false);
    expect(r.overtook).toBe(false);
  });
});

describe('roadOvertake speed boost (OTTD roadveh_cmd.cpp UpdateSpeed 512 vs 256)', () => {
  test('boost applied only while overtaking, capped at target', () => {
    const idle = veh(1, 2, [2, 3], 0.2, 1.2);
    expect(overtakeSpeed(idle, 0.2, 0.3, 1.2)).toBe(0.3); // no overtakeId: unchanged
    const ov = veh(2, 2, [2, 3], 0.2, 1.2, { overtakeId: 9, overtakeCtr: 0 });
    expect(overtakeSpeed(ov, 0.2, 0.3, 1.2)).toBeCloseTo(0.4, 10); // delta doubled
    expect(overtakeSpeed(ov, 1.1, 1.15, 1.2)).toBeCloseTo(1.2, 10); // capped at target
    expect(overtakeSpeed(ov, 0.5, 0.4, 1.2)).toBe(0.4); // braking untouched
  });

  test('same step: overtaking vehicle gains more speed than an identical non-overtaking one', () => {
    const v = veh(1, 2, [2, 3, 4, 5, 6], 0.3, 1.2);
    const plain = overtakeSpeed(v, 0.3, 0.35, 1.2);
    v.overtakeId = 2;
    expect(overtakeSpeed(v, 0.3, 0.35, 1.2)).toBeGreaterThan(plain);
  });
});
