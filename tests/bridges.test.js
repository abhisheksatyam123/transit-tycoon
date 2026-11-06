import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { planBridges, bridgeCells } from '../js/simulation/cmdTrack.js';

const N = 1, E = 2, S = 4, W = 8;

/** Flat game with a water channel at x 30..31 (2 deck tiles) on row 30. */
function channel(width = 2) {
  const g = flatGame();
  for (let x = 30; x < 30 + width; x++) { const t = g.tile(x, 30); t.terrain = 'water'; t.height = 0; }
  return g;
}

describe('player bridges (T7)', () => {
  test('rail drag across water builds a bridge: deck is water with rail bits, heads are land', () => {
    const g = channel(2);
    const r = g.buildRail(28, 30, 33, 30);
    expect(r.ok).toBe(true);
    expect(g.tile(30, 30).terrain).toBe('water');
    expect(g.tile(31, 30).terrain).toBe('water');
    expect(g.tile(30, 30).rail & (E | W)).toBe(E | W);
    expect(g.tile(31, 30).rail & (E | W)).toBe(E | W);
    expect(g.tile(29, 30).terrain).toBe('grass');
    expect(g.tile(29, 30).rail & E).toBeTruthy();
    expect(g.tile(32, 30).rail & W).toBeTruthy();
  });

  test('road drag across water builds a road bridge', () => {
    const g = channel(3);
    expect(g.buildRoad(27, 30, 33, 30).ok).toBe(true);
    for (let x = 30; x <= 32; x++) expect(g.tile(x, 30).road & (E | W)).toBe(E | W);
    expect(g.tile(32, 30).terrain).toBe('water');
  });

  test('span limit: a deck longer than the max is refused', () => {
    const g = channel(12);
    // 12 deck tiles + 2 heads = 14 > 12: refused (the land beyond the water is far enough)
    const r = g.buildRail(28, 30, 43, 30);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too long/i);
    // 10 deck tiles + 2 heads = 12 is allowed
    const g2 = channel(10);
    expect(g2.buildRail(28, 30, 40, 30).ok).toBe(true);
  });

  test('mismatched head heights are refused', () => {
    const g = channel(2);
    g.tile(32, 30).height = 2;
    const r = g.buildRail(28, 30, 33, 30);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/same height/i);
    expect(g.tile(30, 30).rail).toBe(0);
  });

  test('a line that ends on water (no far head) is refused', () => {
    const g = channel(2);
    const r = g.buildRail(28, 30, 31, 30);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/water/i);
  });

  test('bridge costs more than the same length of plain track, and the dry run matches the build', () => {
    const plain = flatGame().buildRail(28, 30, 33, 30, { dryRun: true });
    const g = channel(2);
    const dry = g.buildRail(28, 30, 33, 30, { dryRun: true });
    expect(dry.ok).toBe(true);
    expect(dry.cost).toBeGreaterThan(plain.cost);
    const before = g.state.company.money;
    const r = g.buildRail(28, 30, 33, 30);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(dry.cost);
    expect(before - g.state.company.money).toBe(r.cost);
  });

  test('planBridges: deck set and bridge helpers identify the whole bridge', () => {
    const g = channel(2);
    const pts = [28, 29, 30, 31, 32, 33].map((x) => ({ x, y: 30 }));
    const plan = planBridges(g.state.map, pts);
    expect(plan.ok).toBe(true);
    expect([...plan.deck].sort((a, b) => a - b)).toEqual([30 + 30 * 96, 31 + 30 * 96]);
    g.buildRail(28, 30, 33, 30);
    const cells = bridgeCells(g.state.map, 30, 30, 'rail');
    expect(cells.length).toBe(4); // 2 deck + 2 heads
    const fromHead = bridgeCells(g.state.map, 29, 30, 'rail');
    expect(fromHead.length).toBe(4);
    expect(bridgeCells(g.state.map, 26, 30, 'rail')).toEqual([]);
  });

  test('demolish on a bridge head removes the whole bridge', () => {
    const g = channel(2);
    g.buildRail(28, 30, 33, 30);
    const r = g.demolish(29, 30, 29, 30);
    expect(r.ok).toBe(true);
    for (let x = 28; x <= 33; x++) {
      const t = g.tile(x, 30);
      expect(t.rail).toBe(0);
    }
    expect(g.tile(30, 30).terrain).toBe('water');
    expect(g.tile(31, 30).terrain).toBe('water');
    // refund: the demolish cost is charged (not a refund) and is positive
    expect(r.cost).toBeGreaterThan(0);
  });

  test('demolish on a bridge deck tile removes the whole bridge too', () => {
    const g = channel(2);
    g.buildRail(28, 30, 33, 30);
    expect(g.demolish(31, 30, 31, 30).ok).toBe(true);
    expect(g.tile(28, 30).rail).toBe(0);
    expect(g.tile(33, 30).rail).toBe(0);
  });

  test('a bridge built over water survives serialize/deserialize unchanged', () => {
    const g = channel(2);
    g.buildRail(28, 30, 33, 30);
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(g2.serialize()).toBe(json);
    expect(g2.tile(30, 30).rail & E).toBeTruthy();
    expect(g2.tile(30, 30).terrain).toBe('water');
  });

  test('a train crosses a player-built rail bridge', () => {
    const g = flatGame();
    for (let x = 36; x <= 40; x++) { const t = g.tile(x, 24); t.terrain = 'water'; t.height = 0; }
    const sa = g.buildRailStation(20, 24, 'x', 3);
    const sb = g.buildRailStation(44, 24, 'x', 3);
    expect(sa.ok && sb.ok).toBe(true);
    expect(g.buildRail(23, 24, 43, 24).ok).toBe(true);
    expect(g.buildDepot(26, 25, 'rail', 1).ok).toBe(true);
    const depot = g.state.depots[g.state.depots.length - 1];
    const stA = g.state.stations[g.state.stations.length - 2];
    const stB = g.state.stations[g.state.stations.length - 1];
    const r = g.buyVehicle(depot.id, { modelId: g.listModels('engine')[0].id, wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, [{ stationId: stB.id, full: false }, { stationId: stA.id, full: false }]).ok).toBe(true);
    expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
    let crossed = false;
    for (let d = 0; d < 60 && !crossed; d++) {
      g.stepDays(1);
      for (const seg of g.getVehicleSegments(r.vehicle)) {
        if (seg && seg.x >= 36 && seg.x <= 40) { crossed = true; break; }
      }
    }
    expect(crossed).toBe(true);
  });

  test('a road vehicle drives across a player-built road bridge', () => {
    const g = flatGame();
    for (let x = 36; x <= 40; x++) { const t = g.tile(x, 24); t.terrain = 'water'; t.height = 0; }
    expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
    const sa = g.buildRoadStop(22, 24, 'bus'), sb = g.buildRoadStop(48, 24, 'bus');
    expect(sa.ok && sb.ok).toBe(true);
    expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
    const depot = g.state.depots[g.state.depots.length - 1];
    const models = g.listModels('road');
    const r = g.buyVehicle(depot.id, { modelId: models[0].id });
    expect(r.ok).toBe(true);
    const sA = g.state.stations[g.state.stations.length - 2], sB = g.state.stations[g.state.stations.length - 1];
    expect(g.setOrders(r.vehicle.id, [{ stationId: sA.id, full: false }, { stationId: sB.id, full: false }]).ok).toBe(true);
    expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
    let crossed = false;
    for (let d = 0; d < 60 && !crossed; d++) {
      g.stepDays(1);
      for (const seg of g.getVehicleSegments(r.vehicle)) {
        if (seg && seg.x >= 36 && seg.x <= 40) { crossed = true; break; }
      }
    }
    expect(crossed).toBe(true);
  });
});
