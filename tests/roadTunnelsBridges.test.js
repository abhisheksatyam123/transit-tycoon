import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { tunnelCells } from '../js/simulation/cmdTrack.js';
import { landBridgeCells } from '../js/simulation/landBridges.js';

const N = 1, E = 2, S = 4, W = 8;
const RAISE = 4;

/** Flat game with tiles x0..x1 on row y raised to height h. */
function hill(x0, x1, y, h = RAISE) {
  const g = flatGame();
  for (let x = x0; x <= x1; x++) g.tile(x, y).height = h;
  return g;
}

/** Drive a bus between two bus stops built on road y=24 and report whether it enters x in [lo,hi]. */
function busCrosses(g, lo, hi) {
  expect(g.buildRoadStop(22, 24, 'bus').ok).toBe(true);
  expect(g.buildRoadStop(48, 24, 'bus').ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  const depot = g.state.depots[g.state.depots.length - 1];
  const models = g.listModels('road');
  const r = g.buyVehicle(depot.id, { modelId: models[0].id });
  expect(r.ok).toBe(true);
  const sA = g.state.stations[g.state.stations.length - 2], sB = g.state.stations[g.state.stations.length - 1];
  expect(g.setOrders(r.vehicle.id, [{ stationId: sA.id, full: false }, { stationId: sB.id, full: false }]).ok).toBe(true);
  expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
  for (let d = 0; d < 80 * 24; d++) {
    g.step();
    for (const seg of g.getVehicleSegments(r.vehicle)) {
      if (seg && seg.x >= lo && seg.x <= hi) return true;
    }
  }
  return false;
}

describe('player road tunnels and bridges (R2)', () => {
  test('a road tunnel lays road bits (not rail) with tunnel/portal flags and costs more than plain road', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    const r = g.buildRoadTunnel(30, 24, 34, 24);
    expect(r.ok).toBe(true);
    expect(g.tile(30, 24).road & (E | W)).toBe(E | W);
    expect(g.tile(30, 24).rail).toBe(0);
    expect(g.tile(30, 24).tunnelPortal).toBe(1);
    for (let x = 31; x <= 33; x++) {
      const t = g.tile(x, 24);
      expect(t.tunnel).toBe(1);
      expect(t.playerTunnel).toBe(1);
      expect(t.road & (E | W)).toBe(E | W);
    }
    expect(tunnelCells(g.state.map, 32, 24).length).toBe(5);
    const plain = flatGame().buildRoad(30, 24, 34, 24, { dryRun: true });
    expect(r.cost).toBeGreaterThan(plain.cost);
  });

  test('road tunnel dry run matches build cost and charges money', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    const dry = g.buildRoadTunnel(30, 24, 34, 24, { dryRun: true });
    expect(dry.ok).toBe(true);
    const before = g.state.company.money;
    const r = g.buildRoadTunnel(30, 24, 34, 24);
    expect(r.cost).toBe(dry.cost);
    expect(before - g.state.company.money).toBe(r.cost);
  });

  test('road tunnel refuses a non-higher interior and a non-straight run', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    g.tile(32, 24).height = 1;
    expect(g.buildRoadTunnel(30, 24, 34, 24).ok).toBe(false);
    expect(g.tile(31, 24).road).toBe(0);
  });

  test('road tunnel is refused beside rail in the interior', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    g.tile(32, 24).rail = E | W;
    expect(g.buildRoadTunnel(30, 24, 34, 24).ok).toBe(false);
  });

  test('a road land bridge lays road bits with deck height and bridgeRoad surcharge', () => {
    const g = flatGame();
    for (let x = 36; x <= 40; x++) { const t = g.tile(x, 24); t.terrain = 'grass'; t.height = 2; }
    for (let x = 36; x <= 40; x++) g.tile(x, 24).height = 2;
    for (let x = 37; x <= 39; x++) g.tile(x, 24).height = 1;
    const r = g.buildRoadBridge(36, 24, 40, 24);
    expect(r.ok).toBe(true);
    expect(g.tile(37, 24).bridgeDeck).toBe(2);
    expect(g.tile(37, 24).road & (E | W)).toBe(E | W);
    expect(g.tile(37, 24).rail).toBe(0);
    expect(landBridgeCells(g.state.map, 37, 24).length).toBe(5);
  });

  test('a bus crosses a road tunnel between two stops', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    expect(g.buildRoad(20, 24, 30, 24).ok).toBe(true);
    expect(g.buildRoadTunnel(30, 24, 34, 24).ok).toBe(true);
    expect(g.buildRoad(34, 24, 50, 24).ok).toBe(true);
    expect(busCrosses(g, 31, 33)).toBe(true);
  });

  test('a bus crosses a road land bridge between two stops', () => {
    const g = flatGame();
    for (let x = 36; x <= 40; x++) { const t = g.tile(x, 24); t.terrain = 'water'; t.height = 0; }
    expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
    expect(busCrosses(g, 36, 40)).toBe(true);
  });
});
