import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { planLandBridge, landBridgeCells } from '../js/simulation/landBridges.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const N = 1, E = 2, S = 4, W = 8;

/** Flat game (height 3) with tiles x0..x1 on row y lowered to height h (default 1). */
function valley(x0, x1, y, h = 1, headH = 3) {
  const g = flatGame();
  for (let x = 0; x < g.state.map.width; x++) {
    for (let row = 0; row < g.state.map.height; row++) {
      g.tile(x, row).height = headH;
    }
  }
  for (let x = x0; x <= x1; x++) {
    g.tile(x, y).height = h;
  }
  return g;
}

describe('player rail valley bridges (B1)', () => {
  test('planLandBridge ok and errors', () => {
    const g = valley(31, 33, 20, 1, 3);
    const map = g.state.map;

    // not straight
    const notStraight = [ { x: 30, y: 20 }, { x: 31, y: 20 }, { x: 31, y: 21 } ];
    expect(planLandBridge(map, notStraight).ok).toBe(false);
    expect(planLandBridge(map, notStraight).error).toMatch(/straight/i);

    // unequal heads
    g.tile(30, 20).height = 3;
    g.tile(34, 20).height = 4;
    const pts = [ { x: 30, y: 20 }, { x: 31, y: 20 }, { x: 32, y: 20 }, { x: 33, y: 20 }, { x: 34, y: 20 } ];
    expect(planLandBridge(map, pts).ok).toBe(false);
    expect(planLandBridge(map, pts).error).toMatch(/same height/i);

    // reset heads to equal
    g.tile(34, 20).height = 3;

    // deck tile not lower
    g.tile(32, 20).height = 3;
    expect(planLandBridge(map, pts).ok).toBe(false);
    expect(planLandBridge(map, pts).error).toMatch(/higher than the valley/i);
    g.tile(32, 20).height = 1;

    // deck tile occupied by track
    g.tile(32, 20).rail = 5;
    expect(planLandBridge(map, pts).ok).toBe(false);
    expect(planLandBridge(map, pts).error).toMatch(/blocked by track or road/i);
    g.tile(32, 20).rail = 0;

    // deck tile occupied by building
    g.tile(32, 20).building = { type: 'house' };
    expect(planLandBridge(map, pts).ok).toBe(false);
    expect(planLandBridge(map, pts).error).toMatch(/blocked by a building/i);
    g.tile(32, 20).building = null;

    // head on water
    g.tile(30, 20).terrain = 'water';
    expect(planLandBridge(map, pts).ok).toBe(false);
    expect(planLandBridge(map, pts).error).toMatch(/heads must be on land/i);
    g.tile(30, 20).terrain = 'grass';

    // too short (< 3 tiles)
    expect(planLandBridge(map, pts.slice(0, 2)).ok).toBe(false);

    // too long (> MAX_BRIDGE_LENGTH = 16)
    const longPts = [];
    for (let x = 10; x <= 28; x++) longPts.push({ x, y: 20 });
    expect(planLandBridge(map, longPts).ok).toBe(false);
    expect(planLandBridge(map, longPts).error).toMatch(/too long/i);

    // valid plan
    const plan = planLandBridge(map, pts);
    expect(plan.ok).toBe(true);
    expect(plan.height).toBe(3);
    expect(plan.deck.size).toBe(3);
  });

  test('buildLandBridge sets lazy fields, charges cost, and dryRun works', () => {
    const g = valley(31, 33, 20, 1, 3);
    const beforeMoney = g.state.company.money;

    const dry = g.buildLandBridge(30, 20, 34, 20, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBe(beforeMoney);

    const r = g.buildLandBridge(30, 20, 34, 20);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(dry.cost);
    expect(beforeMoney - g.state.company.money).toBe(r.cost);

    // Heads
    expect(g.tile(30, 20).rail & (E | W)).toBe(E | W);
    expect(g.tile(30, 20).playerBridge).toBe(1);
    expect(g.tile(30, 20).bridgeDeck).toBeUndefined();

    expect(g.tile(34, 20).rail & (E | W)).toBe(E | W);
    expect(g.tile(34, 20).playerBridge).toBe(1);
    expect(g.tile(34, 20).bridgeDeck).toBeUndefined();

    // Deck tiles
    for (let x = 31; x <= 33; x++) {
      const t = g.tile(x, 20);
      expect(t.rail & (E | W)).toBe(E | W);
      expect(t.playerBridge).toBe(1);
      expect(t.bridgeDeck).toBe(3);
      expect(t.height).toBe(1); // ground height unchanged
    }

    // landBridgeCells
    const cells = landBridgeCells(g.state.map, 32, 20);
    expect(cells.length).toBe(5);
  });

  test('demolish removes whole land bridge and cleans lazy fields', () => {
    const g = valley(31, 33, 20, 1, 3);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);

    // Demolish from the middle deck tile
    const dem = g.demolish(32, 20, 32, 20);
    expect(dem.ok).toBe(true);

    for (let x = 30; x <= 34; x++) {
      const t = g.tile(x, 20);
      expect(t.rail).toBe(0);
      expect(t.playerBridge).toBeUndefined();
      expect(t.bridgeDeck).toBeUndefined();
    }
  });

  test('demolish from head removes whole land bridge', () => {
    const g = valley(31, 33, 20, 1, 3);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);

    const dem = g.demolish(30, 20, 30, 20);
    expect(dem.ok).toBe(true);

    for (let x = 30; x <= 34; x++) {
      const t = g.tile(x, 20);
      expect(t.rail).toBe(0);
      expect(t.playerBridge).toBeUndefined();
      expect(t.bridgeDeck).toBeUndefined();
    }
  });

  test('terraform refuses to raise/lower bridgeDeck or head tiles', () => {
    const g = valley(31, 33, 20, 1, 3);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);

    // Deck tile
    const r1 = g.terraform('raise', { x0: 32, y0: 20, x1: 32, y1: 20 });
    expect(r1.ok).toBe(false);

    // Head tile
    const r2 = g.terraform('lower', { x0: 30, y0: 20, x1: 30, y1: 20 });
    expect(r2.ok).toBe(false);
  });

  test('save round-trip preserves bridgeDeck and playerBridge', () => {
    const g = valley(31, 33, 20, 1, 3);
    expect(g.buildLandBridge(30, 20, 34, 20).ok).toBe(true);

    const json = serializeState(g.state);
    const loaded = parseState(json);

    const mid = loaded.map.tiles[20 * loaded.map.width + 32];
    expect(mid.bridgeDeck).toBe(3);
    expect(mid.playerBridge).toBe(1);
    expect(mid.rail & (E | W)).toBe(E | W);

    const head = loaded.map.tiles[20 * loaded.map.width + 30];
    expect(head.playerBridge).toBe(1);
    expect(head.bridgeDeck).toBeUndefined();
  });

  test('train crosses a valley bridge between two stations and pathfinds', () => {
    const g = valley(31, 35, 24, 1, 3);
    const br = g.buildLandBridge(30, 24, 36, 24);
    expect(br.ok).toBe(true);

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

    let inside = false;
    for (let d = 0; d < 80; d++) {
      g.stepDays(1);
      for (const seg of g.getVehicleSegments(r.vehicle)) {
        if (seg && seg.x >= 31 && seg.x <= 35 && Math.abs(seg.y - 24) < 0.6) inside = true;
      }
    }
    expect(inside).toBe(true);
  });
});
