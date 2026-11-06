/** E1: electrified rail (catenary): convert cost + fields, unelectrify, demolish clears, electric routing, save. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { COSTS } from '../js/config/costs.js';
import { findPath } from '../js/simulation/pathfinder.js';
import { findVehiclePath } from '../js/simulation/routing.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { modelAvailable } from '../js/simulation/vehicles.js';

/** A straight rail line y=30 from x=10..20 plus a parallel detour line y=24 from x=10..20 linked at both ends. */
function twoRoutes() {
  const g = flatGame();
  expect(g.buildRail(10, 30, 20, 30).ok).toBe(true);
  expect(g.buildRail(10, 30, 10, 24).ok).toBe(true);
  expect(g.buildRail(10, 24, 20, 24).ok).toBe(true);
  expect(g.buildRail(20, 24, 20, 30).ok).toBe(true);
  return g;
}

describe('electrify command', () => {
  test('dry run prices per rail tile, does not change tiles or money', () => {
    const g = twoRoutes();
    const money = g.state.company.money;
    const r = g.convertRail(10, 30, 14, 30, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.tiles).toBe(5);
    expect(r.cost).toBe(COSTS.electrify * 5);
    expect(g.tile(12, 30).elec).toBeUndefined();
    expect(g.state.company.money).toBe(money);
  });

  test('electrifies rail tiles only, sets elec = 1 and charges the cost', () => {
    const g = twoRoutes();
    const money = g.state.company.money;
    const r = g.convertRail(9, 30, 14, 30); // x=9 has no rail: skipped
    expect(r.ok).toBe(true);
    expect(r.tiles).toBe(5);
    for (let x = 10; x <= 14; x++) expect(g.tile(x, 30).elec).toBe(1);
    expect(g.tile(9, 30).elec).toBeUndefined();
    expect(g.tile(10, 25).elec).toBeUndefined(); // not in rectangle
    expect(g.state.company.money).toBeLessThan(money);
  });

  test('rectangle with no rail is refused', () => {
    const g = flatGame();
    expect(g.convertRail(4, 4, 6, 6).ok).toBe(false);
  });

  test('unelectrify clears elec and is free', () => {
    const g = twoRoutes();
    g.convertRail(10, 30, 20, 30);
    const money = g.state.company.money;
    const r = g.convertRail(10, 30, 20, 30, { unelectrify: true });
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(0);
    expect(g.tile(15, 30).elec).toBeUndefined();
    expect('elec' in g.tile(15, 30)).toBe(false);
    expect(g.state.company.money).toBe(money);
  });

  test('demolishing electrified rail removes elec', () => {
    const g = twoRoutes();
    g.convertRail(10, 30, 20, 30);
    expect(g.demolish(15, 30, 15, 30).ok).toBe(true);
    expect('elec' in g.tile(15, 30)).toBe(false);
  });
});

describe('electric routing', () => {
  test('electric path refuses non-electrified track, diesel path uses both', () => {
    const g = twoRoutes();
    // electrify only the detour: the straight line y=30 stays diesel-only
    g.convertRail(10, 24, 20, 24);
    g.convertRail(10, 24, 10, 30);
    g.convertRail(20, 24, 20, 30);
    const map = g.state.map;
    const goal = [{ x: 20, y: 30 }];
    // straight diesel route is shorter than the detour through y=24
    const diesel = findPath(map, { x: 10, y: 30 }, goal, 'rail');
    expect(diesel.length).toBe(11);
    const electric = findPath(map, { x: 10, y: 30 }, goal, 'rail', { electric: true });
    expect(electric).not.toBeNull();
    expect(electric.some((p) => p.y === 24)).toBe(true);
    // with no electrified route at all, the electric train finds nothing
    const g2 = twoRoutes();
    expect(findPath(g2.state.map, { x: 10, y: 30 }, goal, 'rail', { electric: true })).toBeNull();
  });

  test('electric locomotive uses findVehiclePath, diesel does not restrict', () => {
    const g = twoRoutes();
    const v = { kind: 'train', modelId: 'eng_volt', tx: 10, ty: 30, history: [] };
    expect(MODEL_BY_ID.eng_volt.traction).toBe('electric');
    expect(findVehiclePath(g.state, v, [{ x: 20, y: 30 }])).toBeNull(); // nothing electrified yet
    g.convertRail(10, 30, 20, 30);
    expect(findVehiclePath(g.state, v, [{ x: 20, y: 30 }])).not.toBeNull();
    const diesel = { ...v, modelId: 'eng_thunder' };
    g.convertRail(10, 30, 20, 30, { unelectrify: true });
    expect(findVehiclePath(g.state, diesel, [{ x: 20, y: 30 }])).not.toBeNull();
  });

  test('electric models are offered only once track is electrified', () => {
    const g = twoRoutes();
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_volt)).toBe(false);
    g.convertRail(10, 30, 12, 30);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_volt)).toBe(true);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_thunder)).toBe(true);
  });
});

describe('electrify save', () => {
  test('elec round-trips through serialize/deserialize', () => {
    const g = twoRoutes();
    g.convertRail(10, 30, 14, 30);
    const g2 = Game.deserialize(JSON.parse(g.serialize()));
    expect(g2.tile(12, 30).elec).toBe(1);
    expect(g2.tile(18, 30).elec).toBeUndefined();
    expect(g2.serialize()).toBe(g.serialize());
  });
});
