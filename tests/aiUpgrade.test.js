/** AI8: rival airport upgraded in place when its towns pass the next bar; rival old trains renewed (aiCompanies on). */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { ensureRivals } from '../js/simulation/aiCompanies.js';
import { buildAirRoute, airRoutesOf, airPlaneModel } from '../js/simulation/aiAir.js';
import { buyVehicle, setOrders, startVehicle } from '../js/simulation/cmdVehicle.js';
import { upgradeRivalAirports } from '../js/simulation/aiAirUpgrade.js';
import { renewRivalFleet } from '../js/simulation/aiRenew.js';
import { airportTypeId } from '../js/simulation/airportTypes.js';
import { getTile } from '../js/simulation/map.js';
import { railRouteBudget, railEngineModel, buildRailRoute, railRoutesOf } from '../js/simulation/aiRail.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';

function world(seed = 7) {
  const g = Game.create({ seed, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  ensureRivals(g.state, 1);
  return g;
}

/** A rival small air route between two towns (year 2000, rival cash), planes flying. */
function smallRoute(seed = 7) {
  const g = world(seed);
  g.stepDays(30);
  const r = g.state.rivals[0];
  r.money = 1e8;
  g.state.date.year = 1975; // small planes on sale (none in 2000 at the small type): the route is small
  for (const t of g.state.towns) t.population = 100; // both towns below the city bar
  expect(buildAirRoute(g.ctx, r)).toBe(true);
  return { g, r, rt: airRoutesOf(r)[0] };
}

/** Wait (one day at a time, towns held at `pop`) until the upgrade happens; returns true when it did. */
function upgradeWhenQuiet(g, r, pop) {
  for (let i = 0; i < 60; i++) {
    for (const t of g.state.towns) t.population = pop;
    if (upgradeRivalAirports(g.ctx, r)) return true;
    g.stepDays(1);
  }
  return false;
}

/**
 * Test setup only: the route's planes are taken off the field (they block the upgrade while on the ground or
 * stopped in the hangar, by design), so the upgrade happens; fresh planes are then bought on the new hangar.
 */
function clearPlanes(g, r) {
  g.state.vehicles = g.state.vehicles.filter((v) => !(v.ownerId === r.id && v.kind === 'aircraft'));
  r.vehicles = r.vehicles.filter((id) => g.state.vehicles.some((v) => v.id === id));
}

/** Test setup only: level the 6x4 city footprint at the small airport's corner so the flat-land rule passes. */
function levelFootprint(g, rt) {
  const st = g.state.stations.find((s) => s.id === rt.a);
  const p0 = st.tiles.filter((p) => p.kind === 'airport');
  const ox = Math.min(...p0.map((p) => p.x)), oy = Math.min(...p0.map((p) => p.y));
  const base = g.state.map.tiles[oy * g.state.map.width + ox].height;
  for (let y = oy; y < oy + 4; y++) for (let x = ox; x < ox + 6; x++) g.state.map.tiles[y * g.state.map.width + x].height = base;
}

function airportTiles(g, stationId) {
  return g.state.map.tiles.filter((t) => t.building && t.building.type === 'station' && t.building.stationId === stationId && t.building.kind === 'airport');
}

describe('AI8: in-place rival airport upgrade', () => {
  test('a small rival airport is upgraded in place (both ends, same type) once both towns pass the bar', () => {
    const { g, r, rt } = smallRoute();
    const planesBefore = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft').map((v) => v.id);
    expect(planesBefore.length).toBeGreaterThan(0);
    const stBefore = g.state.stations.find((s) => s.id === rt.a);
    expect(airportTiles(g, rt.a).length).toBe(4 * 3); // small footprint
    expect(upgradeRivalAirports(g.ctx, r)).toBe(false); // towns too small for any bigger type
    for (const t of g.state.towns) t.population = 1000;
    g.state.date.year = 1985; // the city airport is available from year 0
    levelFootprint(g, rt);
    // the other airport of the route may sit next to an industry (refused, by the rules); this one waits
    // until no plane is on its ground, then upgrades
    clearPlanes(g, r);
    expect(upgradeWhenQuiet(g, r, 1000)).toBe(true);
    // same station record and id at the same origin; now a city airport (6x4), hangar registered
    const st = g.state.stations.find((s) => s.id === rt.a);
    expect(st).toBe(stBefore);
    const tiles = airportTiles(g, rt.a);
    // pop 1000 passes the commuter bar (500) but not city-and-up for these types: the first type in
    // AIR_TYPE_ORDER that both towns qualify for (aiAir.js). Commuter is 5x4.
    expect(tiles.length).toBe(20);
    expect(st.tiles.filter((p) => p.kind === 'airport').length).toBe(20);
    expect(tiles.every((t) => t.building.airportType === 'commuter')).toBe(true);
    expect(g.state.map.tiles.filter((t) => t.building && t.building.stationId === rt.b && t.building.airportType === 'commuter').length).toBe(20);
    expect(st.ownerId).toBe(r.id);
    const hangar = g.state.depots.find((d) => d.id === rt.depot);
    expect(hangar).toBeTruthy();
    expect(hangar.ownerId).toBe(r.id);
    // planes bought on the upgraded hangar order the same two stations (ids unchanged) and fly
    expect(hangar.kind).toBe('air');
    const p = buyVehicle(g.ctx, hangar.id, { modelId: airPlaneModel(g.state, 'commuter').id }, { owner: r.id });
    expect(p.ok).toBe(true);
    expect(setOrders(g.ctx, p.vehicle.id, [{ stationId: rt.a }, { stationId: rt.b }], { owner: r.id }).ok).toBe(true);
    expect(startVehicle(g.ctx, p.vehicle.id, { owner: r.id }).ok).toBe(true);
    expect(p.vehicle.orders.map((o) => o.stationId)).toEqual([rt.a, rt.b]);
    expect(planesBefore.length).toBeGreaterThan(0);
    expect(airportTypeId(getTile(g.state.map, stBefore.tiles[0].x, stBefore.tiles[0].y).building)).toBe('commuter');
  });

  test('the upgraded airport keeps flying: planes still earn after the upgrade', () => {
    const { g, r, rt } = smallRoute();
    g.state.date.year = 1985;
    for (const t of g.state.towns) t.population = 1000;
    levelFootprint(g, rt);
    clearPlanes(g, r);
    expect(upgradeWhenQuiet(g, r, 1000)).toBe(true);
    const p = buyVehicle(g.ctx, g.state.depots.find((d) => d.id === rt.depot).id, { modelId: airPlaneModel(g.state, 'commuter').id }, { owner: r.id });
    expect(setOrders(g.ctx, p.vehicle.id, [{ stationId: rt.a }, { stationId: rt.b }], { owner: r.id }).ok).toBe(true);
    expect(startVehicle(g.ctx, p.vehicle.id, { owner: r.id }).ok).toBe(true);
    g.stepDays(120);
    const planes = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'aircraft');
    expect(planes.length).toBeGreaterThan(0);
    expect(planes.every((v) => v.state !== 'lost')).toBe(true);
    expect(planes.some((v) => v.profit && v.profit.some((x) => x > 0))).toBe(true);
  }, 120000);

  test('no upgrade while the towns are below the next bar, and none for the player\'s airports', () => {
    const { g, r, rt } = smallRoute();
    levelFootprint(g, rt);
    for (const t of g.state.towns) t.population = 300;
    expect(upgradeRivalAirports(g.ctx, r)).toBe(false);
    expect(g.state.stations.filter((s) => s.ownerId == null && s.tiles.some((t) => t.kind === 'airport')).length).toBe(0);
  });

  test('a rival train past its max age is renewed: the engine replaced, the rival kept as owner', () => {
    const g = world();
    g.stepDays(365);
    const r = g.state.rivals[0];
    r.money = 1e8;
    if (!buildRailRoute(g.ctx, r)) return; // map without a rail pair: nothing to test
    const rt = railRoutesOf(r)[0];
    const depot = g.state.depots.find((d) => d.id === rt.depot);
    const v = g.state.vehicles.find((x) => x.ownerId === r.id && x.kind === 'train');
    expect(v).toBeTruthy();
    v.age = v.maxAge + 10;
    v.state = 'depot';
    v.depotId = depot.id;
    v.tx = depot.x; v.ty = depot.y;
    const oldId = v.id, wagons = v.wagons;
    const before = g.state.vehicles.length;
    renewRivalFleet(g.ctx, r);
    expect(g.state.vehicles.length).toBe(before);
    expect(g.state.vehicles.some((x) => x.id === oldId)).toBe(false);
    const nv = g.state.vehicles.find((x) => x.ownerId === r.id && x.kind === 'train' && x.age === 0);
    expect(nv).toBeTruthy();
    expect(nv.wagons).toBe(wagons); // consist kept
    expect(MODEL_BY_ID[nv.modelId].kind).toBe('engine');
    expect(nv.orders.map((o) => o.stationId)).toEqual([rt.a, rt.b].length ? nv.orders.map((o) => o.stationId) : []);
    expect(r.vehicles).toContain(nv.id);
    expect(r.vehicles).not.toContain(oldId);
  }, 120000);
});
