/** gap #25: AI rival ship freight routes (aiCompanies opt-in): docks, depot, ships, earnings, ownership, save. */
import { test, expect, describe, beforeAll } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { buildShipRoute, shipRoutesOf, shipCandidates, addShips } from '../js/simulation/aiShip.js';
import { ensureRivals, updateMonthly } from '../js/simulation/aiCompanies.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { RIVAL_OWNED } from '../js/simulation/owner.js';
import { setOrders } from '../js/simulation/cmdVehicle.js';
import { findShipPath } from '../js/simulation/shipPath.js';

/** Seed 17: an oil field and a refinery joined by water (the first seed in 1..40 with a usable pair). */
function seed17() {
  const g = Game.create({ seed: 17, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  return g;
}

/** Seed 17 with one ship route built directly for the rival (topped up with money, so the test is fast). */
function shipWorld() {
  const g = seed17();
  const r = ensureRivals(g.state, 1)[0];
  r.money = 1e6;
  expect(buildShipRoute(g.ctx, r)).toBe(true);
  return { g, r, rt: shipRoutesOf(r)[0] };
}

describe('aiCompanies: rival ship routes', () => {
  let shared;
  beforeAll(() => { shared = shipWorld(); }, 120000);

  test('the route builds two docks owned by the rival, with a depot on water', () => {
    const { g, r, rt } = shared;
    const a = g.state.stations.find((s) => s.id === rt.a), b = g.state.stations.find((s) => s.id === rt.b);
    expect(a.ownerId).toBe(r.id);
    expect(b.ownerId).toBe(r.id);
    expect(a.tiles.every((t) => t.kind === 'dock')).toBe(true);
    expect(b.tiles.every((t) => t.kind === 'dock')).toBe(true);
    const dep = g.state.depots.find((d) => d.id === rt.depot);
    expect(dep.kind).toBe('ship');
    expect(dep.ownerId).toBe(r.id);
    expect(g.state.map.tiles[dep.y * g.state.map.width + dep.x].terrain).toBe('water');
  });

  test('the first ship has a full-load order at the source and unloads at the destination', () => {
    const { g, r, rt } = shared;
    const ships = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'ship');
    expect(ships.length).toBeGreaterThanOrEqual(1);
    expect(ships[0].cargoId).toBe(rt.cargo);
    expect(ships[0].orders[0]).toEqual({ stationId: rt.a, full: true });
    expect(ships[0].orders[1].stationId).toBe(rt.b);
  });

  test('the two docks are joined by water within 15..80 tiles, and the cargo is a producer to acceptor', () => {
    const { g, rt } = shared;
    const [src, dst] = rt.industries.map((id) => g.state.industries.find((i) => i.id === id));
    expect(rt.cargo).toBe('OIL');
    expect(src.typeId).toBe('oil_wells');
    expect(dst.typeId).toBe('refinery');
    // the water path from the source dock's water to the destination dock's water
    const map = g.state.map;
    const ship = g.state.vehicles.find((v) => v.ownerId === shared.r.id && v.kind === 'ship');
    const waterOf = (st) => st.tiles.flatMap((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy })))
      .filter((q) => map.tiles[q.y * map.width + q.x] && map.tiles[q.y * map.width + q.x].terrain === 'water');
    const sa = g.state.stations.find((s) => s.id === rt.a), sb = g.state.stations.find((s) => s.id === rt.b);
    const path = findShipPath(map, waterOf(sa)[0], waterOf(sb));
    expect(path).not.toBeNull();
    expect(path.length).toBeGreaterThanOrEqual(15);
    expect(path.length).toBeLessThanOrEqual(80);
    expect(ship).toBeTruthy();
  });

  test('the rival ship earns money within a year', () => {
    const { g, r } = shared;
    g.stepDays(365);
    const earned = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'ship')
      .reduce((n, v) => n + (v.profit || []).reduce((s, x) => s + x, 0), 0);
    expect(earned).toBeGreaterThan(0);
  }, 120000);

  test('a rival ship route survives a save/load round trip with ownership intact', () => {
    const { g, r, rt } = shared;
    const s2 = parseState(serializeState(g.state));
    const rr = s2.rivals.find((q) => q.id === r.id);
    expect(shipRoutesOf(rr).length).toBe(1);
    const a = s2.stations.find((s) => s.id === rt.a);
    expect(a.ownerId).toBe(r.id);
    const ships = s2.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'ship');
    expect(ships.length).toBeGreaterThanOrEqual(1);
  }, 120000);

  test('the player cannot order a rival ship to a rival dock', () => {
    const { g, rt } = shared;
    const rival = g.state.vehicles.find((v) => v.ownerId != null && v.kind === 'ship');
    expect(rival).toBeTruthy();
    const res = setOrders(g.ctx, rival.id, [{ stationId: rt.a, full: true }]);
    expect(res.ok).toBe(false);
    expect(res.error).toBe(RIVAL_OWNED);
  });
});

describe('aiCompanies: ship routes gating', () => {
  test('the candidate list is built from producer-to-acceptor pairs 15..80 apart', () => {
    const g = seed17();
    const c = shipCandidates(g.state);
    expect(c.length).toBeGreaterThan(0);
    for (const p of c) {
      expect(p.dist).toBeGreaterThanOrEqual(15);
      expect(p.dist).toBeLessThanOrEqual(80);
    }
  });

  test('a rival without cash builds no ship route', () => {
    const g = seed17();
    const r = ensureRivals(g.state, 1)[0];
    r.money = 100;
    expect(buildShipRoute(g.ctx, r)).toBe(false);
    expect(shipRoutesOf(r).length).toBe(0);
  });

  test('default games (aiCompanies off) create no rivals and no ships', () => {
    const g = Game.create({ seed: 17, width: 96, height: 96, townCount: 8 });
    g.stepDays(120);
    expect(g.state.rivals).toBeUndefined();
    expect(g.state.vehicles.some((v) => v.ownerId != null)).toBe(false);
  }, 120000);

  test('addShips does nothing without a route', () => {
    const g = seed17();
    const r = ensureRivals(g.state, 1)[0];
    addShips(g.ctx, r);
    expect(r.vehicles.length).toBe(0);
  });
});
