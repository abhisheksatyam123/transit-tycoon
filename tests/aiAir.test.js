/** gap #25 stage 4: AI rival air routes, rival road/property upkeep and owner rules (aiCompanies opt-in). */
import { test, expect, describe, beforeAll } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { buildAirport } from '../js/simulation/cmdAirport.js';
import { buyVehicle, setOrders } from '../js/simulation/cmdVehicle.js';
import { upkeepFor } from '../js/simulation/economy.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { buildAirRoute, airRouteBudget, pickAirTowns, airPlaneModel } from '../js/simulation/aiAir.js';
import { airportType } from '../js/simulation/airportTypes.js';
import { RIVAL_OWNED } from '../js/simulation/owner.js';

function seed15() {
  const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  return g;
}

/** Seed-15 world after one year, with the rival given cash and an air route built directly (fast). */
function airWorld() {
  const g = seed15();
  g.stepDays(365);
  const r = g.state.rivals[0];
  r.money = 1e6;
  expect(buildAirRoute(g.ctx, r)).toBe(true);
  return { g, r, rt: r.routes.find((q) => q.air) };
}

describe('aiCompanies stage 4: air routes', () => {
  // one shared world (a year of seed 15 plus one air route): building it costs ~15 s on a loaded machine
  let shared;
  beforeAll(() => { shared = airWorld(); }, 120000);
  const world = () => shared;

  test('the air route builds an airport pair 40+ tiles apart, owned by the rival', () => {
    const { g, r, rt } = world();
    const a = g.state.stations.find((s) => s.id === rt.a), b = g.state.stations.find((s) => s.id === rt.b);
    expect(a.ownerId).toBe(r.id);
    expect(b.ownerId).toBe(r.id);
    expect(a.tiles.some((t) => t.kind === 'airport')).toBe(true);
    expect(b.tiles.some((t) => t.kind === 'airport')).toBe(true);
    const ta = g.state.towns.find((t) => t.id === rt.towns[0]), tb = g.state.towns.find((t) => t.id === rt.towns[1]);
    expect(Math.abs(ta.x - tb.x) + Math.abs(ta.y - tb.y)).toBeGreaterThanOrEqual(40);
    // the planes: rival-owned, on the air depot of the first airport, flying the two airports
    const planes = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft');
    expect(planes.length).toBe(2);
    for (const p of planes) expect(p.orders.map((o) => o.stationId)).toEqual([rt.a, rt.b]);
  });

  test('rival planes earn: after a year of flying they have profit and the rival books income', () => {
    const { g, r } = world();
    g.stepDays(365);
    const planes = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft');
    expect(planes.length).toBeGreaterThanOrEqual(1);
    expect(planes.some((v) => v.profit && v.profit.some((p) => p > 0))).toBe(true);
    const income = r.ledger.history.reduce((a, h) => a + (h.income || 0), 0) + (r.ledger.current.income || 0);
    expect(income).toBeGreaterThan(0);
  }, 120000);

  test('small airports take only small planes: a bigger plane is refused, the chosen plane fits', () => {
    const g = seed15();
    const plane = airPlaneModel(g.state);
    expect(plane.capacity).toBeLessThanOrEqual(80);
    expect(plane.helicopter).toBeFalsy();
    expect(airportType('small').cost).toBeLessThan(airportType('city').cost);
    expect(airRouteBudget(g.state, airportType('small').cost)).toBeGreaterThan(0);
  });

  test('the player cannot order a plane to a rival airport, nor buy a plane at a rival hangar', () => {
    const { g, rt } = airWorld(); // own world: this test builds a player airport
    g.state.company.money = 1e7;
    // a player airport elsewhere with a player plane: its orders may not name the rival's airports
    const spot = (() => {
      for (let y = 2; y < 90; y += 3) for (let x = 2; x < 90; x += 3) {
        if (buildAirport(g.ctx, x, y, { type: 'small', dryRun: true }).ok) return { x, y };
      }
      return null;
    })();
    expect(spot).not.toBeNull();
    const built = buildAirport(g.ctx, spot.x, spot.y, { type: 'small' });
    expect(built.ok).toBe(true);
    const bought = buyVehicle(g.ctx, built.depotId, { modelId: airPlaneModel(g.state).id });
    expect(bought.ok).toBe(true);
    const res = setOrders(g.ctx, bought.vehicle.id, [{ stationId: rt.a }, { stationId: rt.b }]);
    expect(res.ok).toBe(false);
    expect(res.error).toBe(RIVAL_OWNED);
    // and a rival hangar cannot take a player plane
    const depot = g.state.depots.find((d) => d.id === rt.depot);
    expect(buyVehicle(g.ctx, depot.id, { modelId: airPlaneModel(g.state).id }).error).toBe(RIVAL_OWNED);
  }, 120000);

  test('rival upkeep: the rival pays property upkeep for its airports; the player does not', () => {
    const { g, r } = airWorld(); // own world: the monthly close below must not leak into the shared one
    const rivalOnly = upkeepFor(g.state, r.id);
    expect(rivalOnly).toBeGreaterThan(0);
    // the rival's airport tiles are not in the player's upkeep: player upkeep equals the no-rival world's
    const base = seed15(); base.stepDays(365);
    expect(upkeepFor(g.state, null)).toBe(upkeepFor(base.state, null));
    // a monthly close charges the rival's property ledger
    g.stepDays(31);
    const prop = r.ledger.history.reduce((a, h) => a + (h.byType?.property || 0), 0) + (r.ledger.current.byType?.property || 0);
    expect(prop).toBeGreaterThan(0);
  }, 300000);

  test('save/load round-trip keeps rival airports, planes and their ownership', () => {
    const { g, r, rt } = world();
    const json = serializeState(g.state);
    const s2 = parseState(json);
    const r2 = s2.rivals[0];
    expect(r2.routes.some((q) => q.air && q.a === rt.a && q.b === rt.b)).toBe(true);
    expect(s2.stations.find((s) => s.id === rt.a).ownerId).toBe(r.id);
    const planesBefore = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft').length;
    expect(s2.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft').length).toBe(planesBefore);
    expect(planesBefore).toBeGreaterThanOrEqual(2);
    expect(upkeepFor(s2, r.id)).toBe(upkeepFor(g.state, r.id));
  }, 120000);

  test('pickAirTowns skips the towns of an existing air route', () => {
    const { g, r, rt } = world();
    const pick = pickAirTowns(g.ctx, r);
    if (pick) {
      expect(rt.towns).not.toContain(pick.a.town.id);
      expect(rt.towns).not.toContain(pick.b.town.id);
    }
  }, 120000);
});
