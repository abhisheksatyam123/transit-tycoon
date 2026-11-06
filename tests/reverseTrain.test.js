/** Reverse train (cmdVehicle.reverseVehicle) and mass start/stop. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';

function setup() {
  const g = flatGame(29);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v: r.vehicle };
}

/** Step until the train is running with a path. */
function runUntilMoving(g, v, days = 3) {
  g.startVehicle(v.id);
  for (let i = 0; i < days * 96 && v.state !== 'running'; i++) g.step();
  for (let i = 0; i < 400 && (v.pathIndex < 2 || !v.path.length); i++) g.step();
}

describe('reverse train', () => {
  test('rejects non-trains, unknown ids, and vehicles in a depot', () => {
    const { g, v } = setup();
    expect(g.reverseVehicle(424242).ok).toBe(false);
    expect(g.reverseVehicle(v.id).ok).toBe(false); // in depot
  });

  test('stopped train: reverses in place and keeps its stop', () => {
    const { g, v } = setup();
    g.startVehicle(v.id);
    for (let i = 0; i < 300 && v.state !== 'running'; i++) g.step();
    expect(g.stopVehicle(v.id).ok).toBe(true);
    const flipped = !!v.flipped;
    const r = g.reverseVehicle(v.id);
    expect(r.ok).toBe(true);
    expect(!!v.flipped).toBe(!flipped);
    expect(v.state).toBe('stopped');
  });

  test('running train: stays on track, turns, and reaches its order afterwards', () => {
    const { g, L, v } = setup();
    runUntilMoving(g, v);
    expect(v.state).toBe('running');
    const r = g.reverseVehicle(v.id);
    expect(r.ok).toBe(true);
    expect(v.state === 'running' || v.state === 'lost').toBe(true);
    // every path tile of the new route is rail (the train never leaves the track)
    for (const p of v.path) expect(g.tile(p.x, p.y).rail).toBeTruthy();
    // it eventually reaches a station of its order list (either end of the line)
    const ids = new Set([L.a.id, L.b.id]);
    let arrived = false;
    for (let i = 0; i < 40 * 96 && !arrived; i++) {
      g.step();
      if (v.atStationId && ids.has(v.atStationId)) arrived = true;
      if (v.state === 'lost') break;
    }
    expect(arrived).toBe(true);
  });

  test('mass stop then start skips vehicles already in the wanted state', () => {
    const { g, L, v } = setup();
    const r2 = g.buyVehicle(g.state.depots[g.state.depots.length - 1].id, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(g.setOrders(r2.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
    const ids = [v.id, r2.vehicle.id];
    expect(g.massStartStop(ids, true).ok).toBe(true); // both leave the depot
    expect(v.state).not.toBe('depot');
    const stop = g.massStartStop(ids, false);
    expect(stop.ok).toBe(true);
    expect(stop.count).toBe(2);
    expect(v.state).toBe('stopped');
    expect(r2.vehicle.state).toBe('stopped');
    expect(g.massStartStop(ids, false).ok).toBe(false); // nothing left to stop
    expect(g.massStartStop([999999], true).ok).toBe(false);
    expect(g.massStartStop(ids, true).count).toBe(2);
  });
});
