/**
 * vehicles[].curveLimit round-trip (save audit): the curve cache stores NO_LIMIT = Infinity on a
 * straight path (loco/trainRealistic.js), but JSON.stringify writes Infinity as null. On load the
 * field must come back as Infinity, not null, and a finite limit must survive unchanged.
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';

/** Straight coal line with a running train; after 200 ticks the curve cache holds NO_LIMIT (Infinity). */
function straightTrain(seed = 7) {
  const g = flatGame(seed);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: false }, { stationId: L.b.id, full: false }]);
  g.startVehicle(r.vehicle.id);
  for (let i = 0; i < 200; i++) g.step();
  return g;
}

/** L-shaped line with a 90 degree corner; the cache holds the finite 61 km/h curve limit. */
function curvedTrain(seed = 7) {
  const g = flatGame(seed);
  const s = g.state;
  const build = [
    g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(30, 26, 'y', 3),
    g.buildRail(13, 24, 30, 24), g.buildRail(30, 24, 30, 26), g.buildDepot(20, 25, 'rail', 1),
  ];
  for (const r of build) expect(r.ok).toBe(true);
  const depotId = s.depots[s.depots.length - 1].id;
  const [a, b] = [s.stations[s.stations.length - 2], s.stations[s.stations.length - 1]];
  const r = g.buyVehicle(depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  g.setOrders(r.vehicle.id, [{ stationId: a.id, full: false }, { stationId: b.id, full: false }]);
  g.startVehicle(r.vehicle.id);
  g.step();
  return g;
}

describe('save curveLimit round-trip', () => {
  test('(a) restored curveLimit equals the pre-save value (Infinity and finite)', () => {
    const g = straightTrain();
    const before = g.state.vehicles[0].curveLimit;
    expect(before).toBe(Infinity); // NO_LIMIT on a straight path
    expect(Game.deserialize(g.serialize()).state.vehicles[0].curveLimit).toBe(Infinity);

    const gc = curvedTrain();
    const finite = gc.state.vehicles[0].curveLimit;
    expect(Number.isFinite(finite)).toBe(true);
    const restored = Game.deserialize(gc.serialize()).state.vehicles[0].curveLimit;
    expect(restored).toBe(finite);
  }, 20000);

  test('(a2) packed scenario save path also restores Infinity', () => {
    const g = straightTrain();
    g.state.scenario = 'test-packed'; // same packing switch as real-map saves
    const json = g.serialize();
    expect(json.includes('tiles-rle-v1')).toBe(true);
    expect(Game.deserialize(json).state.vehicles[0].curveLimit).toBe(Infinity);
  }, 20000);

  test('(b) an old save with curveLimit null loads as Infinity', () => {
    const g = straightTrain();
    const json = g.serialize();
    // JSON.stringify has always written Infinity as null, so this is what an old save contains.
    expect(json.includes('"curveLimit":null')).toBe(true);
    expect(Game.deserialize(json).state.vehicles[0].curveLimit).toBe(Infinity);
  }, 20000);

  test('(c) continuing 300 ticks after load matches the uninterrupted game', () => {
    const g = straightTrain();
    const snapshot = g.serialize();
    const g2 = Game.deserialize(snapshot);
    // Restored vehicle state (curveLimit included) must equal the pre-save state.
    expect(g2.state.vehicles[0]).toEqual(g.state.vehicles[0]);
    for (let i = 0; i < 300; i++) { g.step(); g2.step(); }
    expect(g2.serialize()).toBe(g.serialize());
  }, 20000);
});
