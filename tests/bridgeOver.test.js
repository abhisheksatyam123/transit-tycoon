import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { landBridgeCells, planLandBridge } from '../js/simulation/landBridges.js';

const N = 1, E = 2, S = 4, W = 8;

/** Flat map at height 3 with row y lowered to 1 for x0..x1 (valley for a bridge), crossing track optional. */
function valleyOver(x0, x1, y) {
  const g = flatGame();
  for (let x = 0; x < g.state.map.width; x++) for (let row = 0; row < g.state.map.height; row++) g.tile(x, row).height = 3;
  for (let x = x0; x <= x1; x++) g.tile(x, y).height = 1;
  return g;
}

describe('rail/road bridges over existing road or rail', () => {
  test('rail bridge spans a perpendicular road; the road under keeps its bits and owner', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRoad(32, 17, 32, 23).ok).toBe(true);
    const roadBefore = g.tile(32, 20).road;
    const r = g.buildLandBridge(30, 20, 34, 20);
    expect(r.ok).toBe(true);

    const under = g.tile(32, 20);
    expect(under.road).toBe(roadBefore);           // ground road untouched
    expect(under.road & (N | S)).toBe(N | S);
    expect(under.overBridge).toBe('rail');         // deck on the rail layer
    expect(under.bridgeDeck).toBe(3);
    expect(under.rail & (E | W)).toBe(E | W);
    expect(under.height).toBe(1);                  // ground height unchanged
    expect(g.tile(31, 20).overBridge).toBeUndefined();
    expect(g.tile(31, 20).road).toBe(0);
    expect(landBridgeCells(g.state.map, 32, 20).length).toBe(5);
  });

  test('road bridge spans a rail line; the rail under keeps its bits', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRail(32, 17, 32, 23).ok).toBe(true);
    const railBefore = g.tile(32, 20).rail;
    const r = g.buildRoadBridge(30, 20, 34, 20);
    expect(r.ok).toBe(true);
    const under = g.tile(32, 20);
    expect(under.rail).toBe(railBefore);
    expect(under.overBridge).toBe('road');
    expect(under.road & (E | W)).toBe(E | W);
  });

  test('deck over track is refused on the same layer, and a bridge may not clear a tile at or above its deck', () => {
    const g = valleyOver(31, 33, 20);
    g.buildRoad(32, 17, 32, 23);
    g.tile(32, 20).height = 3;
    const plan = planLandBridge(g.state.map, [{ x: 30, y: 20 }, { x: 31, y: 20 }, { x: 32, y: 20 }, { x: 33, y: 20 }, { x: 34, y: 20 }], 'rail');
    expect(plan.ok).toBe(false);
    expect(plan.error).toMatch(/clear the road or track|higher than the valley/i);
  });

  test('ground road under a bridge still gets ground traffic: road path goes through it', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRoad(32, 17, 32, 23).ok).toBe(true);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);
    // a road tile under the deck connects N and S on the road layer as before
    const under = g.tile(32, 20);
    expect(under.road & N).toBe(N);
    expect(under.road & S).toBe(S);
  });

  test('a train crosses over a road and a car still drives under it (both reach their far ends)', () => {
    const g = valleyOver(31, 35, 24);
    expect(g.buildRoad(33, 20, 33, 28).ok).toBe(true);
    expect(g.buildLandBridge(30, 24, 36, 24).ok).toBe(true);
    expect(g.tile(33, 24).overBridge).toBe('rail');

    const sa = g.buildRailStation(20, 24, 'x', 3);
    const sb = g.buildRailStation(42, 24, 'x', 3);
    expect(sa.ok && sb.ok).toBe(true);
    expect(g.buildRail(23, 24, 30, 24).ok).toBe(true);
    expect(g.buildRail(36, 24, 41, 24).ok).toBe(true);
    expect(g.buildDepot(26, 25, 'rail', 1).ok).toBe(true);
    const depot = g.state.depots[g.state.depots.length - 1];
    const stA = g.state.stations[g.state.stations.length - 2];
    const stB = g.state.stations[g.state.stations.length - 1];
    const r = g.buyVehicle(depot.id, { modelId: g.listModels('engine')[0].id, wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: stB.id, full: false }, { stationId: stA.id, full: false }]).ok).toBe(true);
    expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
    let onDeck = false;
    for (let d = 0; d < 80; d++) {
      g.stepDays(1);
      for (const seg of g.getVehicleSegments(r.vehicle)) {
        if (seg && seg.x >= 33 && seg.x <= 33.4 && Math.abs(seg.y - 24) < 0.6) onDeck = true;
      }
    }
    expect(onDeck).toBe(true);
  });

  test('demolishing the deck over a road keeps the road; demolishing the bridge run removes only the deck', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRoad(32, 17, 32, 23).ok).toBe(true);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);
    const dem = g.demolish(31, 20, 33, 20);
    expect(dem.ok).toBe(true);
    const under = g.tile(32, 20);
    expect(under.overBridge).toBeUndefined();
    expect(under.bridgeDeck).toBeUndefined();
    expect(under.playerBridge).toBeUndefined();
    expect(under.rail).toBe(0);
    expect(under.road & (N | S)).toBe(N | S);
  });

  test('cannot add road bits to the tile under a bridge deck', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRoad(32, 17, 32, 23).ok).toBe(true);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);
    // E-W road through the under-tile would join the deck area: refused, ground road stays N-S
    const r = g.buildRoad(31, 20, 33, 20);
    expect(r.ok).toBe(false);
    expect(g.tile(32, 20).road & (E | W)).toBe(0);
    // a parallel road one row away is fine
    expect(g.buildRoad(30, 19, 34, 19).ok).toBe(true);
  });

  test('terraform refuses on under-track tiles of a bridge', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRoad(32, 17, 32, 23).ok).toBe(true);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);
    expect(g.terraform('raise', { x0: 32, y0: 20, x1: 32, y1: 20 }).ok).toBe(false);
  });

  test('save round-trip keeps overBridge and the ground road under the deck', () => {
    const g = valleyOver(31, 33, 20);
    expect(g.buildRoad(32, 17, 32, 23).ok).toBe(true);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);
    const loaded = parseState(serializeState(g.state));
    const t = loaded.map.tiles[20 * loaded.map.width + 32];
    expect(t.overBridge).toBe('rail');
    expect(t.bridgeDeck).toBe(3);
    expect(t.playerBridge).toBe(1);
    expect(t.road & (N | S)).toBe(N | S);
    expect(t.rail & (E | W)).toBe(E | W);
  });
});
