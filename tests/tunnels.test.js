import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { tunnelCells } from '../js/simulation/cmdTrack.js';
import { setSetting } from '../js/simulation/settings.js';

const N = 1, E = 2, S = 4, W = 8;
const RAISE = 4; // interior height over the portals

/** Flat game (height 1) with tiles x0..x1 on row y raised to height h. */
function hill(x0, x1, y, h = RAISE) {
  const g = flatGame();
  for (let x = x0; x <= x1; x++) { const t = g.tile(x, y); t.height = h; }
  return g;
}

describe('player rail tunnels (T7b)', () => {
  test('a straight tunnel: portals are surface track, interior is tunnel=1 with rail bits, cost includes tunnelRail', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    const r = g.buildTunnel(30, 24, 34, 24);
    expect(r.ok).toBe(true);
    expect(g.tile(30, 24).rail & (E | W)).toBe(E | W);
    expect(g.tile(30, 24).tunnelPortal).toBe(1);
    expect(g.tile(30, 24).tunnel).toBeFalsy();
    for (let x = 31; x <= 33; x++) {
      const t = g.tile(x, 24);
      expect(t.tunnel).toBe(1);
      expect(t.playerTunnel).toBe(1);
      expect(t.rail & (E | W)).toBe(E | W);
    }
    expect(g.tile(34, 24).tunnelPortal).toBe(1);
    expect(tunnelCells(g.state.map, 32, 24).length).toBe(5);
    const plain = flatGame().buildRail(30, 24, 34, 24, { dryRun: true });
    expect(r.cost).toBeGreaterThan(plain.cost);
  });

  test('dry run matches the build cost and money is charged', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    const dry = g.buildTunnel(30, 24, 34, 24, { dryRun: true });
    expect(dry.ok).toBe(true);
    const before = g.state.company.money;
    const r = g.buildTunnel(30, 24, 34, 24);
    expect(r.cost).toBe(dry.cost);
    expect(before - g.state.company.money).toBe(r.cost);
  });

  test('unequal portal heights are refused', () => {
    const g = hill(30, 34, 24);
    g.tile(34, 24).height = 2;
    const r = g.buildTunnel(30, 24, 34, 24);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/same height/i);
    expect(g.tile(32, 24).rail).toBe(0);
  });

  test('an interior tile not higher than the portals is refused', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    g.tile(32, 24).height = 1;
    const r = g.buildTunnel(30, 24, 34, 24);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/higher/i);
    expect(g.tile(30, 24).rail).toBe(0);
  });

  test('too long (more than 16 tiles) and no interior tile are refused', () => {
    const g = hill(30, 50, 24);
    setSetting(g.state, 'maxTunnelLength', 16); // pin the old limit (default is now 64, D5)
    for (const x of [30, 46]) g.tile(x, 24).height = 1;
    const long = g.buildTunnel(30, 24, 46, 24);
    expect(long.ok).toBe(false);
    expect(long.error).toMatch(/too long/i);
    const g2 = hill(30, 31, 24);
    expect(g2.buildTunnel(30, 24, 31, 24).ok).toBe(false);
  });

  test('obstacles inside the run (track, water) are refused', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    g.tile(32, 24).rail = E | W;
    expect(g.buildTunnel(30, 24, 34, 24).ok).toBe(false);
    g.tile(32, 24).rail = 0;
    g.tile(32, 24).terrain = 'water';
    expect(g.buildTunnel(30, 24, 34, 24).ok).toBe(false);
  });

  test('a rail drag with the underground option builds the same tunnel', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    const r = g.buildRail(30, 24, 34, 24, { tunnel: true });
    expect(r.ok).toBe(true);
    expect(g.tile(32, 24).tunnel).toBe(1);
  });

  test('a train drives through a player tunnel and arrives', () => {
    const g = flatGame();
    for (let x = 38; x <= 42; x++) g.tile(x, 24).height = 4;
    g.tile(37, 24).height = 1; g.tile(43, 24).height = 1;
    expect(g.buildTunnel(37, 24, 43, 24).ok).toBe(true);
    const sa = g.buildRailStation(20, 24, 'x', 3);
    const sb = g.buildRailStation(50, 24, 'x', 3);
    expect(sa.ok && sb.ok).toBe(true);
    expect(g.buildRail(23, 24, 36, 24).ok).toBe(true); // surface track up to the west portal
    expect(g.buildRail(44, 24, 49, 24).ok).toBe(true); // and from the east portal on
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
        if (seg && seg.x >= 38 && seg.x <= 42 && Math.abs(seg.y - 24) < 0.6) inside = true;
      }
    }
    expect(inside).toBe(true);
  });

  test('demolish on one tunnel tile removes the whole tunnel and charges demolish cost', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    expect(g.buildTunnel(30, 24, 34, 24).ok).toBe(true);
    const r = g.demolish(32, 24, 32, 24);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    for (let x = 30; x <= 34; x++) {
      const t = g.tile(x, 24);
      expect(t.rail).toBe(0);
      expect(t.tunnel).toBeFalsy();
      expect(t.tunnelPortal).toBeFalsy();
      expect(t.playerTunnel).toBeFalsy();
    }
  });

  test('demolish refused while a vehicle is inside the tunnel', () => {
    const g = flatGame();
    for (let x = 38; x <= 42; x++) g.tile(x, 24).height = 4;
    g.tile(37, 24).height = 1; g.tile(43, 24).height = 1;
    expect(g.buildTunnel(37, 24, 43, 24).ok).toBe(true);
    const fake = { id: 999, kind: 'train', wagons: 2, state: 'running', history: [{ x: 40, y: 24 }], v: 0 };
    g.state.vehicles.push(fake);
    const r = g.demolish(40, 24, 40, 24);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/vehicle/i);
    g.state.vehicles.pop();
  });

  test('terraform refuses to change tunnel interior or portal tiles', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    expect(g.buildTunnel(30, 24, 34, 24).ok).toBe(true);
    const low = g.terraform('lower', { x0: 32, y0: 24, x1: 32, y1: 24 }, { dryRun: true });
    expect(low.ok).toBe(false);
    const portal = g.terraform('raise', { x0: 30, y0: 24, x1: 30, y1: 24 }, { dryRun: true });
    expect(portal.ok).toBe(false);
  });

  test('tunnel survives serialize/deserialize unchanged', () => {
    const g = hill(30, 34, 24);
    for (const x of [30, 34]) g.tile(x, 24).height = 1;
    expect(g.buildTunnel(30, 24, 34, 24).ok).toBe(true);
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(g2.serialize()).toBe(json);
    expect(g2.tile(32, 24).tunnel).toBe(1);
    expect(g2.tile(32, 24).playerTunnel).toBe(1);
    expect(g2.tile(30, 24).tunnelPortal).toBe(1);
  });
});
