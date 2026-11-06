/** Vehicle queueing (blocking.js / movement.js): same-direction road gaps, oncoming pass, bay queue, train queue, head-on deadlock. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { vehicleDir } from '../js/simulation/blocking.js';

/** Straight road y=24 from x=20 to x=50 with bus stops at the given x positions and a depot at (24,25). */
function roadWorld(stopXs) {
  const g = flatGame(33);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  for (const x of stopXs) expect(g.buildRoadStop(x, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  const depot = g.state.depots[g.state.depots.length - 1];
  return { g, depot, model: g.listModels('road')[0] };
}

function stationAt(g, x) {
  return g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));
}

function addRoadVehicle(g, depot, model, orders) {
  const r = g.buyVehicle(depot.id, { modelId: model.id });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, orders.map((x) => ({ stationId: stationAt(g, x).id, full: false }))).ok).toBe(true);
  expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
  return r.vehicle;
}

/**
 * Vehicles whose heads share one tile. Vehicles still leaving their depot (first path tile, which is the
 * depot tile itself) may queue there one behind the other, so that tile is not checked.
 */
function overlaps(g, kind) {
  const seen = new Map();
  const out = [];
  for (const v of g.state.vehicles) {
    if (v.kind !== kind || v.state === 'depot') continue;
    if (v.pathIndex === 0 && v.state === 'running' && g.state.depots.some((d) => d.x === v.tx && d.y === v.ty)) continue;
    // road vehicles going opposite ways may share a tile (other lane); same-way ones may not
    const dir = vehicleDir(v);
    const k = `${v.tx},${v.ty},${dir}`;
    if (seen.has(k)) out.push([seen.get(k).id, v.id]);
    else seen.set(k, v);
  }
  return out;
}

describe('road queueing', () => {
  test('two trucks in the same direction never share a tile and both arrive', () => {
    const { g, depot, model } = roadWorld([22, 46]);
    const a = addRoadVehicle(g, depot, model, [46, 22]);
    const b = addRoadVehicle(g, depot, model, [46, 22]);
    let arrivedA = false, arrivedB = false, bad = [];
    for (let i = 0; i < 40 * 96; i++) {
      g.step();
      bad.push(...overlaps(g, 'road'));
      if (a.atStationId) arrivedA = true;
      if (b.atStationId) arrivedB = true;
      if (arrivedA && arrivedB) break;
    }
    expect(bad).toEqual([]);
    expect(arrivedA && arrivedB).toBe(true);
  });

  test('oncoming trucks pass each other on their own lanes', () => {
    const { g, depot, model } = roadWorld([22, 46]);
    const east = addRoadVehicle(g, depot, model, [46]);
    const west = addRoadVehicle(g, depot, model, [22]);
    let eastDone = false, westDone = false;
    for (let i = 0; i < 40 * 96 && !(eastDone && westDone); i++) {
      g.step();
      if (east.atStationId === stationAt(g, 46).id) eastDone = true;
      if (west.atStationId === stationAt(g, 22).id) westDone = true;
    }
    expect(eastDone && westDone).toBe(true);
  });

  test('a single-bay stop: the second truck waits while the first one loads', () => {
    const { g, depot, model } = roadWorld([30, 46]);
    const a = addRoadVehicle(g, depot, model, [30, 46]);
    const b = addRoadVehicle(g, depot, model, [30, 46]);
    const bay = { x: 30, y: 24 };
    let sharedLoading = false, bothServed = false, seenA = false, seenB = false;
    for (let i = 0; i < 40 * 96 && !bothServed; i++) {
      g.step();
      if (a.state === 'loading' && b.state === 'loading') sharedLoading = true;
      if (a.state === 'loading' && a.tx === bay.x && a.ty === bay.y) seenA = true;
      if (b.state === 'loading' && b.tx === bay.x && b.ty === bay.y) seenB = true;
      if (seenA && seenB) bothServed = true;
    }
    expect(sharedLoading).toBe(false);
    expect(bothServed).toBe(true);
  });
});

function trainSetup(orders) {
  const g = flatGame(19);
  const L = coalLine(g);
  const vs = orders.map((order) => {
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, order.map((s) => ({ stationId: s === 'a' ? L.a.id : L.b.id, full: false }))).ok).toBe(true);
    return r.vehicle;
  });
  return { g, L, vs };
}

describe('train queueing', () => {
  test('a train behind a train on the same track never runs into it and both arrive', () => {
    const { g, vs } = trainSetup([['b', 'a'], ['b', 'a']]);
    for (const v of vs) expect(g.startVehicle(v.id).ok).toBe(true);
    const [front, back] = vs;
    let arrived = 0, bad = [];
    for (let i = 0; i < 60 * 96 && arrived < 2; i++) {
      g.step();
      bad.push(...overlaps(g, 'train'));
      for (const v of vs) if (v.state === 'running' && v.speed === 0 && v.progress === 0 && v.blockedTicks === undefined) {}
      if (front.atStationId && !front.arrivedOnce) { front.arrivedOnce = true; arrived++; }
      if (back.atStationId && !back.arrivedOnce) { back.arrivedOnce = true; arrived++; }
    }
    expect(bad).toEqual([]);
    expect(arrived).toBe(2);
  });

  test('two trains head-on on single track pass each other (no signals yet) and both arrive within 6 days', () => {
    const { g, vs } = trainSetup([['b', 'a'], ['a', 'b']]);
    const [east, west] = vs;
    expect(g.startVehicle(east.id).ok).toBe(true);
    expect(g.startVehicle(west.id).ok).toBe(true);
    let eastDone = false, westDone = false, bad = [];
    for (let i = 0; i < 6 * 96 && !(eastDone && westDone); i++) {
      g.step();
      bad.push(...overlaps(g, 'train'));
      if (east.atStationId) eastDone = true;
      if (west.atStationId) westDone = true;
    }
    expect(bad).toEqual([]);
    expect(eastDone && westDone).toBe(true);
  });

  test('save/load mid-queue gives identical continuation', () => {
    const { g, vs } = trainSetup([['b', 'a'], ['b', 'a'], ['a', 'b']]);
    for (const v of vs) g.startVehicle(v.id);
    for (let i = 0; i < 700; i++) g.step();
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    for (let i = 0; i < 1500; i++) { g.step(); g2.step(); }
    expect(g2.serialize()).toBe(g.serialize());
  });
});
