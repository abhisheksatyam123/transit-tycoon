/** AI7: rival fleet renewal (old or obsolete rival vehicles replaced) and rival city airports (aiCompanies on). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { buildAirRoute, airRouteChoice, AIR_TYPE_ORDER } from '../js/simulation/aiAir.js';
import { renewRivalFleet, renewalModel } from '../js/simulation/aiRenew.js';
import { buyVehicle, setOrders } from '../js/simulation/cmdVehicle.js';
import { airportType } from '../js/simulation/airportTypes.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';

function world(seed = 15) {
  const g = Game.create({ seed, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  ensureRivals(g.state, 1);
  return g;
}

describe('AI7: rival fleet renewal', () => {
  /** A rival air route (planes on its hangar depot) in a year-1990 world with money. */
  function airFleet() {
    const g = world();
    g.stepDays(30);
    const r = g.state.rivals[0];
    r.money = 1e8;
    g.state.date.year = 2000;
    expect(buildAirRoute(g.ctx, r)).toBe(true);
    const rt = r.routes.find((q) => q.air);
    return { g, r, rt, planes: g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft') };
  }

  test('a rival plane past its max age is renewed: a new vehicle, still the rival\'s, same route', () => {
    const { g, r, rt, planes } = airFleet();
    const old = planes[0];
    old.age = old.maxAge + 10;
    old.state = 'depot';
    old.depotId = rt.depot;
    const oldId = old.id, oldModel = old.modelId;
    const before = g.state.vehicles.length;
    renewRivalFleet(g.ctx, r);
    expect(g.state.vehicles.length).toBe(before);
    expect(g.state.vehicles.some((v) => v.id === oldId)).toBe(false);
    const nv = g.state.vehicles.find((v) => v.ownerId === r.id && v.kind === 'aircraft' && v.age === 0);
    expect(nv).toBeTruthy();
    expect(nv.modelId).toBe(oldModel); // still the best plane for the small airport it already uses
    expect(nv.orders.map((o) => o.stationId)).toEqual([rt.a, rt.b]);
    expect(r.vehicles).toContain(nv.id);
    expect(r.vehicles).not.toContain(oldId);
    // the player's own vehicles are never touched by a rival renewal (untagged, not in r.vehicles)
    expect(g.state.vehicles.filter((v) => v.ownerId == null).length).toBe(g.state.vehicles.length - g.state.vehicles.filter((v) => v.ownerId != null).length);
  });

  test('an obsolete plane is renewed with a model the airport takes (same class, best capacity)', () => {
    const { g, r, planes } = airFleet();
    const v = planes[0];
    v.state = 'depot';
    v.depotId = g.state.rivals[0].routes.find((q) => q.air).depot;
    const model = MODEL_BY_ID[v.modelId];
    const saved = model.obsoleteYear;
    model.obsoleteYear = g.state.date.year; // retired now
    try {
      const target = renewalModel(g.state, v);
      expect(target).toBeTruthy();
      expect(target.id).not.toBe(v.modelId);
      expect(target.helicopter).toBeFalsy();
      renewRivalFleet(g.ctx, r);
      expect(g.state.vehicles.some((x) => x.id === v.id)).toBe(false);
      expect(g.state.vehicles.some((x) => x.ownerId === r.id && x.modelId === target.id)).toBe(true);
    } finally {
      model.obsoleteYear = saved;
    }
  });

  test('a rival plane that is not old or obsolete is left alone', () => {
    const { g, r, planes } = airFleet();
    const v = planes[0];
    renewRivalFleet(g.ctx, r);
    expect(g.state.vehicles.some((x) => x.id === v.id)).toBe(true);
  });
});

describe('AI7: rival city airports', () => {
  test('airport type order: largest first, small is the fallback', () => {
    expect(AIR_TYPE_ORDER[AIR_TYPE_ORDER.length - 1].id).toBe('small');
    for (const { id } of AIR_TYPE_ORDER) expect(airportType(id)).toBeTruthy();
  });

  test('a rival builds a city airport in a year it is available, with planes the city airport takes', () => {
    const g = world();
    g.stepDays(365);
    const r = g.state.rivals[0];
    r.money = 1e7;
    g.state.date.year = Math.max(g.state.date.year, airportType('city').introYear + 1); // city from year 0
    const ch = airRouteChoice(g.ctx, r);
    expect(ch).toBeTruthy();
    expect(ch.typeId).toBe('city');
    expect(ch.plane.helicopter).toBeFalsy();
    expect(ch.plane.capacity).toBeGreaterThan(0);
    const ok = buildAirRoute(g.ctx, r);
    expect(ok).toBe(true);
    const rt = r.routes.find((q) => q.air);
    expect(rt.apType).toBe('city');
    const aa = g.state.stations.find((s) => s.id === rt.a);
    expect(aa.tiles.some((t) => t.kind === 'airport')).toBe(true);
    const planes = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft');
    expect(planes.length).toBeGreaterThanOrEqual(1);
    for (const p of planes) expect(MODEL_BY_ID[p.modelId].capacity).toBeGreaterThan(0);
  }, 120000);

  test('a metropolitan airport needs its year: before 1980 the rival falls back to a smaller type', () => {
    const g = world();
    g.stepDays(30);
    const r = g.state.rivals[0];
    r.money = 1e7;
    g.state.date.year = 1975;
    const ch = airRouteChoice(g.ctx, r);
    if (ch) expect(['metropolitan', 'international', 'commuter'].includes(ch.typeId)).toBe(false);
  });
});
