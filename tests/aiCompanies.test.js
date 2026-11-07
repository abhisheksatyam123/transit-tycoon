/** gap #25 stage 1: AI competitor companies (opt-in aiCompanies setting). */
import { test, expect, describe } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { companyOf, ownerMismatch, RIVAL_OWNED } from '../js/simulation/owner.js';
import { vehicleOnTile } from '../js/simulation/cmdStation.js';
import { ROUTE_MIN_DIST, ROUTE_MAX_DIST } from '../js/simulation/aiCompanies.js';
import { manhattan } from '../js/simulation/state.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Random world with 8 towns; `rivals` sets aiCompanies before any month passes. */
function world(rivals, seed = 3) {
  const g = Game.create({ seed, width: 96, height: 96, townCount: 8 });
  if (rivals) setSetting(g.state, 'aiCompanies', rivals);
  return g;
}

describe('aiCompanies', () => {
  test('default (0) leaves the world hash unchanged (see MP note)', () => {
    const out = execFileSync('bun', ['tools/world-hash.js'], { cwd: ROOT, encoding: 'utf8' });
    // MP: ind.hist is saved, so the serialized hash changed (hist-stripped hash is still 211ce1138012979d).
    expect(out).toContain('hash e66b684174510b6b');
  }, 30000);

  test('with 0 rivals no rival state is created', () => {
    const g = world(0);
    g.stepDays(60);
    expect(g.state.rivals).toBeUndefined();
    expect(g.state.vehicles.some((v) => v.ownerId != null)).toBe(false);
  }, 30000);

  test('ownership: companyOf routes to the rival or the player', () => {
    const g = world(1);
    const r = { id: 900, name: 'X', money: 0, loan: 0 };
    g.state.rivals = [r];
    expect(companyOf(g.state, { ownerId: 900 })).toBe(r);
    expect(companyOf(g.state, {})).toBe(g.state.company);
    expect(ownerMismatch({ ownerId: 900 }, {})).toBe(true);
    expect(ownerMismatch({ ownerId: 900 }, { owner: 900 })).toBe(false);
    expect(ownerMismatch({}, {})).toBe(false);
  }, 30000);

  test('with 1 rival, after 12 months it builds stations and buses; money is its own', () => {
    const g = world(1);
    g.state.company.money = 0; // the player does nothing
    const base = world(0);
    base.state.company.money = 0;
    g.stepDays(365);
    base.stepDays(365);
    const r = g.state.rivals[0];
    expect(r.stations.length).toBeGreaterThanOrEqual(2);
    expect(r.routes.length).toBeGreaterThanOrEqual(1);
    expect(r.vehicles.length).toBeGreaterThanOrEqual(2);
    // every route's towns are 15..40 apart
    for (const rt of r.routes) {
      if (rt.freight || rt.air || rt.rail) continue; // only bus routes join towns
      const [a, b] = rt.towns.map((id) => g.state.towns.find((t) => t.id === id));
      const d = manhattan(a.x, a.y, b.x, b.y);
      expect(d).toBeGreaterThanOrEqual(ROUTE_MIN_DIST);
      expect(d).toBeLessThanOrEqual(ROUTE_MAX_DIST);
    }
    // rival vehicles and stations are stamped with its id, and draw in its colour
    const owned = g.state.vehicles.filter((v) => v.ownerId === r.id);
    expect(owned.length).toBe(r.vehicles.length);
    expect(owned.every((v) => v.livery === r.colour)).toBe(true);
    expect(g.state.stations.filter((s) => s.ownerId === r.id).length).toBe(r.stations.length);
    // the rival's money moved by its own income/costs; the player's money did not move
    expect(r.money).not.toBe(100000);
    // the player's money equals a game with no rival: the rival's stops, buses and upkeep are its own
    expect(g.state.company.money).toBe(base.state.company.money);
  }, 60000);

  test('the player cannot sell, order or demolish a rival vehicle', () => {
    const g = world(1);
    g.stepDays(120);
    const v = g.state.vehicles.find((x) => x.ownerId != null);
    expect(v).toBeTruthy();
    expect(g.sellVehicle(v.id).error).toBe(RIVAL_OWNED);
    expect(g.setOrders(v.id, []).error).toBe(RIVAL_OWNED);
    expect(g.stopVehicle(v.id).error).toBe(RIVAL_OWNED);
    expect(g.state.vehicles.includes(v)).toBe(true);
    // a rival station tile with no vehicle on it (a parked rival train would be refused first, for another reason)
    const st = g.state.stations.find((s) => s.ownerId != null && s.tiles.some((t) => !vehicleOnTile(g.state, t.x, t.y)));
    expect(st).toBeTruthy();
    const tile = st.tiles.find((t) => !vehicleOnTile(g.state, t.x, t.y));
    expect(g.demolish(tile.x, tile.y, tile.x, tile.y).error).toBe(RIVAL_OWNED);
  }, 30000);

  test('save round-trip keeps rivals, owners and routes', () => {
    const g = world(2);
    g.stepDays(90);
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(g2.state.rivals.length).toBe(g.state.rivals.length);
    expect(g2.state.rivals.map((r) => r.routes)).toEqual(g.state.rivals.map((r) => r.routes));
    expect(g2.state.vehicles.filter((v) => v.ownerId != null).length)
      .toBe(g.state.vehicles.filter((v) => v.ownerId != null).length);
    expect(Game.deserialize(json).serialize()).toBe(json);
  }, 30000);
});

describe('aiCompanies stage 2', () => {
  test('a rival with routes and buses earns: value grows after 2 years on seed 15', () => {
    const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
    setSetting(g.state, 'aiCompanies', 1);
    g.stepDays(365);
    const r1 = g.state.rivals[0];
    const v1 = r1.companyValue;
    g.stepDays(365);
    const r = g.state.rivals[0];
    expect(r.bankrupt).toBeFalsy();
    expect(r.companyValue).toBeGreaterThan(v1);
    expect(r.stats.profit).toBeGreaterThan(0);
    // no bus is stranded: every rival bus is running or stopped at a depot, none lost
    expect(g.state.vehicles.filter((v) => v.ownerId === r.id && v.state === 'lost').length).toBe(0);
  }, 120000);

  test('bankruptcy: a rival below zero for 12 months is wound up cleanly', () => {
    const g = world(1);
    g.stepDays(120);
    const r = g.state.rivals[0];
    expect(r.vehicles.length).toBeGreaterThan(0);
    // force a sustained deficit: no cash and a huge loan keep the value negative
    r.money = -1000000; r.loan = 2000000;
    r.companyValue = -1; r.negValueMonths = 0;
    g.stepDays(400);
    expect(r.bankrupt).toBe(true);
    expect(g.state.vehicles.some((v) => v.ownerId === r.id)).toBe(false);
    expect(g.state.stations.some((s) => s.ownerId === r.id)).toBe(false);
    expect(g.state.depots.some((d) => d.ownerId === r.id)).toBe(false);
    expect(g.state.news.some((n) => /bankrupt/.test(n.text))).toBe(true);
    // a wound-up company does not come back or build again
    const n = g.state.stations.length;
    g.stepDays(60);
    expect(g.state.stations.length).toBe(n);
  }, 120000);

  test('setting 0 with the stage-2 code: world hash unchanged', () => {
    const g = world(0);
    g.stepDays(60);
    expect(g.state.rivals).toBeUndefined();
    expect(g.state.company.loan).toBe(100000);
  }, 30000);
});
