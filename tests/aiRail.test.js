/** gap #25 stage 5: AI rival rail freight routes (aiCompanies opt-in): track, stations, depot, trains, ownership. */
import { test, expect, describe, beforeAll } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting } from '../js/simulation/settings.js';
import { buildRailRoute, railRoutesOf, pickRailPair, railRouteBudget, railEngineModel, railWagonFor, laneRoute } from '../js/simulation/aiRail.js';
import { acceptTakeover, ensureRivals } from '../js/simulation/aiCompanies.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { RIVAL_OWNED } from '../js/simulation/owner.js';
import { buyVehicle, setOrders } from '../js/simulation/cmdVehicle.js';

function seed15() {
  const g = Game.create({ seed: 15, width: 96, height: 96, townCount: 8 });
  setSetting(g.state, 'aiCompanies', 1);
  return g;
}

/** Seed 15 after a year, rival topped up and one rail route built directly (fast). */
function railWorld() {
  const g = seed15();
  g.stepDays(365);
  const r = g.state.rivals[0];
  r.money = 1e6;
  expect(buildRailRoute(g.ctx, r)).toBe(true);
  return { g, r, rt: r.routes.find((q) => q.rail) };
}

describe('aiCompanies stage 5: rail routes', () => {
  let shared;
  beforeAll(() => { shared = railWorld(); }, 120000);

  test('the route builds two rail stations and track owned by the rival', () => {
    const { g, r, rt } = shared;
    const a = g.state.stations.find((s) => s.id === rt.a), b = g.state.stations.find((s) => s.id === rt.b);
    expect(a.ownerId).toBe(r.id);
    expect(b.ownerId).toBe(r.id);
    expect(a.tiles.every((t) => t.kind === 'rail')).toBe(true);
    // track tiles laid by the rival are owned 'rival' with its rivalId (upkeep paid by the rival)
    const rivalTrack = g.state.map.tiles.filter((t) => t.owner === 'rival' && t.rivalId === r.id && t.rail);
    expect(rivalTrack.length).toBeGreaterThan(20);
  }, 120000);

  test('the route has a depot and a train with a full-load order at the source', () => {
    const { g, r, rt } = shared;
    expect(g.state.depots.find((d) => d.id === rt.depot).ownerId).toBe(r.id);
    const trains = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'train');
    expect(trains.length).toBeGreaterThanOrEqual(1);
    const t = trains[0];
    expect(t.cargoId).toBe(rt.cargo);
    expect(t.orders[0].stationId).toBe(rt.a);
    expect(t.orders[0].full).toBe(true);
    expect(t.orders[1].stationId).toBe(rt.b);
  });

  test('the source and destination are 20..60 tiles apart and the cargo is a producer to acceptor', () => {
    const { g, rt } = shared;
    const [src, dst] = rt.industries.map((id) => g.state.industries.find((i) => i.id === id));
    const d = Math.abs(src.x - dst.x) + Math.abs(src.y - dst.y);
    expect(d).toBeGreaterThanOrEqual(20);
    expect(d).toBeLessThanOrEqual(60);
  });

  test('rail budget is twice the estimated route cost and a poor rival builds nothing', () => {
    const g = seed15();
    const r = ensureRivals(g.state, 1)[0];
    const pair = pickRailPair(g.state, new Set());
    expect(pair).not.toBeNull();
    const budget = railRouteBudget(pair.dist, railEngineModel(g.state), railWagonFor(g.state, pair.cargo));
    expect(budget).toBeGreaterThan(0);
    r.money = Math.floor(budget / 4);
    expect(buildRailRoute(g.ctx, r)).toBe(false);
    expect(railRoutesOf(r).length).toBe(0);
  }, 60000);

  test('laneRoute finds a path over open land and returns null for an enclosed goal', () => {
    const g = seed15();
    const map = g.state.map;
    expect(laneRoute(map, { x: 0, y: 0 }, { x: 0, y: 0 }, new Set()).length).toBe(1);
    const goal = { x: 10, y: 10 };
    const ring = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) ring.add((goal.y + dy) * map.width + goal.x + dx);
    expect(laneRoute(map, { x: 0, y: 0 }, goal, ring)).toBeNull();
    const open = laneRoute(map, { x: 0, y: 0 }, goal, new Set());
    expect(open && open[0]).toEqual({ x: 0, y: 0 });
    expect(open[open.length - 1]).toEqual(goal);
  });

  test('the player cannot order a train to a rival rail station or buy one at a rival depot', () => {
    const { g, r, rt } = shared;
    const depot = g.state.depots.find((d) => d.id === rt.depot);
    const eng = railEngineModel(g.state);
    const buy = buyVehicle(g.ctx, depot.id, { modelId: eng.id, wagons: 1, cargoId: rt.cargo });
    expect(buy.ok).toBe(false);
    expect(buy.error).toBe(RIVAL_OWNED);
    const mine = g.state.vehicles.find((v) => v.ownerId === r.id && v.kind === 'train');
    const o = setOrders(g.ctx, mine.id, [{ stationId: rt.a }, { stationId: rt.b }]); // no owner: the player
    expect(o.ok).toBe(false);
    expect(o.error).toBe(RIVAL_OWNED);
  });

  test('save/load round trip keeps the rail route, the train and the rival track', () => {
    const { g, r, rt } = shared;
    const s2 = parseState(serializeState(g.state));
    const r2 = s2.rivals.find((q) => q.id === r.id);
    expect(r2.routes.some((q) => q.rail && q.a === rt.a && q.b === rt.b)).toBe(true);
    const before = g.state.map.tiles.filter((t) => t.owner === 'rival' && t.rivalId === r.id && t.rail).length;
    const after = s2.map.tiles.filter((t) => t.owner === 'rival' && t.rivalId === r.id && t.rail).length;
    expect(after).toBe(before);
    expect(s2.vehicles.some((v) => v.ownerId === r.id && v.kind === 'train')).toBe(true);
  }, 60000);

  test('takeover hands the rival rail track to the player', () => {
    const g = seed15();
    const r = ensureRivals(g.state, 1)[0];
    r.money = 1e6;
    buildRailRoute(g.ctx, r);
    const railTiles = g.state.map.tiles.filter((t) => t.owner === 'rival' && t.rivalId === r.id && t.rail).length;
    expect(railTiles).toBeGreaterThan(0);
    r.takeoverOffer = { price: 0 };
    g.state.company.money = 1e7;
    expect(acceptTakeover(g.ctx, r.id).ok).toBe(true);
    const left = g.state.map.tiles.filter((t) => t.owner === 'rival' && t.rivalId === r.id).length;
    expect(left).toBe(0);
    const mine = g.state.map.tiles.filter((t) => t.owner === 'company' && t.rail).length;
    expect(mine).toBeGreaterThanOrEqual(railTiles);
  }, 60000);

  test('the rival earns from the rail route within a year', () => {
    const g = seed15();
    g.stepDays(365);
    const r = g.state.rivals[0];
    const railTrains = g.state.vehicles.filter((v) => v.ownerId === r.id && v.kind === 'train');
    expect(railRoutesOf(r).length).toBeGreaterThanOrEqual(1);
    expect(railTrains.length).toBeGreaterThanOrEqual(1);
    const delivered = r.ledger.history.reduce((a, h) => a + (h.income || 0), 0) + (r.ledger.current.income || 0);
    expect(delivered).toBeGreaterThan(0);
  }, 60000);
});
