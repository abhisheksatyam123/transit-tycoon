import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { COSTS } from '../js/config/costs.js';
import { HQ_SIZE, HQ_ERR } from '../js/simulation/cmdHQ.js';
import { headquarterVariation } from '../js/simulation/loco/company.js';
import * as CompanyManager from '../js/simulation/loco/companyManager.js';

describe('company HQ (T31)', () => {
  test('absent by default: no hq field and no hq tiles on a fresh game', () => {
    const g = flatGame(42);
    expect(g.state.company.hq).toBeUndefined();
    const json = g.serialize();
    expect(json.includes('"hq"')).toBe(false);
    expect(g.state.map.tiles.some((t) => t.building && t.building.type === 'hq')).toBe(false);
  });

  test('builds a 2x2 HQ on a flat site, charges the price, marks the four tiles', () => {
    const g = flatGame(42);
    const m0 = g.state.company.money;
    const r = g.buildHQ(10, 20);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(COSTS.buildHQ);
    expect(g.state.company.money).toBe(m0 - COSTS.buildHQ);
    expect(g.state.company.hq).toEqual({ x: 10, y: 20, level: 0 });
    const W = g.state.map.width;
    for (let dy = 0; dy < HQ_SIZE; dy++) for (let dx = 0; dx < HQ_SIZE; dx++) {
      const b = g.state.map.tiles[(20 + dy) * W + 10 + dx].building;
      expect(b.type).toBe('hq');
      expect(b.dx).toBe(dx); expect(b.dy).toBe(dy);
    }
  });

  test('refusals: water, rail, steep slope, out of bounds, not enough money', () => {
    const g = flatGame(42);
    const s = g.state;
    const W = s.map.width;
    s.map.tiles[20 * W + 10].rail = 1;
    expect(g.buildHQ(10, 20, { dryRun: true }).error).toBe(HQ_ERR.occupied);
    s.map.tiles[20 * W + 10].rail = 0;
    s.map.tiles[21 * W + 11].height = s.map.tiles[21 * W + 11].height + 3;
    expect(g.buildHQ(10, 20, { dryRun: true }).error).toBe(HQ_ERR.slope);
    s.map.tiles[21 * W + 11].height -= 3;
    s.map.tiles[20 * W + 10].terrain = 'water';
    expect(g.buildHQ(10, 20, { dryRun: true }).error).toBe(HQ_ERR.water);
    s.map.tiles[20 * W + 10].terrain = 'grass';
    expect(g.buildHQ(-1, 5).ok).toBe(false);
    expect(g.buildHQ(s.map.width - 1, 5).ok).toBe(false);
    s.company.money = 0;
    expect(g.buildHQ(10, 20).ok).toBe(false);
    expect(g.state.company.hq).toBeUndefined();
  });

  test('estimateHQ and dryRun report the cost without building', () => {
    const g = flatGame(42);
    expect(g.estimateHQ(10, 20).cost).toBe(COSTS.buildHQ);
    expect(g.estimateHQ(10, 20).ok).toBe(true);
    expect(g.buildHQ(10, 20, { dryRun: true }).ok).toBe(true);
    expect(g.state.company.hq).toBeUndefined();
  });

  test('relocating removes the old HQ and charges again', () => {
    const g = flatGame(42);
    g.buildHQ(10, 20);
    const m = g.state.company.money;
    const r = g.buildHQ(30, 25);
    expect(r.ok).toBe(true);
    expect(g.state.company.money).toBe(m - COSTS.buildHQ);
    expect(g.state.company.hq.x).toBe(30);
    const W = g.state.map.width;
    expect(g.state.map.tiles[20 * W + 10].building).toBeNull();
    expect(g.state.map.tiles[25 * W + 30].building.type).toBe('hq');
    expect(g.state.map.tiles.filter((t) => t.building && t.building.type === 'hq').length).toBe(4);
  });

  test('level follows performance index (monthly update) and posts news on change', () => {
    const g = flatGame(42);
    g.buildHQ(10, 20);
    const c = g.state.company;
    const game = { state: g.state, ctx: g.ctx };
    const W = g.state.map.width;
    c.performanceIndex = 500;
    expect(headquarterVariation(c)).toBe(2);
    CompanyManager.updateMonthlyHeadquarters(game);
    expect(c.hq.level).toBe(2);
    expect(g.state.map.tiles[20 * W + 10].building.level).toBe(2);
    expect(g.state.news.some((n) => /grew to level 2/.test(n.text))).toBe(true);
    c.performanceIndex = 2000;
    CompanyManager.updateMonthlyHeadquarters(game);
    expect(c.hq.level).toBe(4);
    c.performanceIndex = 0;
    CompanyManager.updateMonthlyHeadquarters(game);
    expect(c.hq.level).toBe(0);
  });

  test('demolishing an HQ tile removes the whole HQ with no refund', () => {
    const g = flatGame(42);
    g.buildHQ(10, 20);
    const m = g.state.company.money;
    const r = g.demolish(11, 21, 11, 21);
    expect(r.ok).toBe(true);
    expect(g.state.company.hq).toBeUndefined();
    expect(g.state.map.tiles.some((t) => t.building && t.building.type === 'hq')).toBe(false);
    expect(g.state.company.money).toBeLessThanOrEqual(m);
  });

  test('save/load roundtrip keeps the HQ record and tiles', () => {
    const g = flatGame(42);
    g.buildHQ(10, 20);
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.hq).toEqual({ x: 10, y: 20, level: 0 });
    const W = g2.state.map.width;
    expect(g2.state.map.tiles[21 * W + 11].building.type).toBe('hq');
  });
});
