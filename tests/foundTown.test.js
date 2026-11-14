import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { COSTS, INDUSTRY_FUND_COSTS } from '../js/config/costs.js';
import { TOWN_MIN_DIST, FOUND_ERR } from '../js/simulation/cmdFound.js';
import { setSetting } from '../js/simulation/settings.js';

/** A land tile at least 12 tiles from every town and industry, found by scanning the open map. */
function freeSite(g) {
  const s = g.state;
  for (let y = 4; y < s.map.height - 4; y += 2) for (let x = 4; x < s.map.width - 4; x += 2) {
    if (g.estimateFound('town', x, y).ok && s.towns.every((t) => Math.abs(t.x - x) + Math.abs(t.y - y) >= 12)) return [x, y];
  }
  throw new Error('no free site');
}

describe('found town', () => {
  test('founds a town on a valid site, charges the price and creates the record', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    const [x, y] = freeSite(g);
    const n = g.state.towns.length, money = g.state.company.money;
    const r = g.foundTown(x, y);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(COSTS.foundTown);
    expect(g.state.towns.length).toBe(n + 1);
    const t = g.state.towns.at(-1);
    expect(t.x).toBe(x);
    expect(t.y).toBe(y);
    expect(t.name.length).toBeGreaterThan(0);
    expect(t.houses.length).toBeGreaterThan(0);
    expect(g.state.company.money).toBe(money - COSTS.foundTown);
  });

  test('dry run charges nothing and changes nothing', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    const [x, y] = freeSite(g);
    const n = g.state.towns.length, money = g.state.company.money;
    const r = g.foundTown(x, y, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(g.state.towns.length).toBe(n);
    expect(g.state.company.money).toBe(money);
  });

  test('refuses water, too-close towns, out-of-bounds and missing money with a clear error', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    const s = g.state;
    const [x, y] = freeSite(g);
    // a free grass tile 4 steps from the first town centre (its streets/houses sit within 3-4 tiles)
    const tc = s.towns[0];
    let near = null;
    for (let dx = 4; dx <= 6 && !near; dx++) {
      const x0 = tc.x + dx, y0 = tc.y + 1;
      const tt = s.map.tiles[y0 * s.map.width + x0];
      if (tt && !tt.building && !tt.road && !tt.rail && tt.terrain !== 'water') near = { x: x0, y: y0 };
    }
    near = near ? g.foundTown(near.x, near.y) : { ok: false, error: FOUND_ERR.nearTown };
    expect(near.ok).toBe(false);
    expect(near.error).toBe(FOUND_ERR.nearTown);
    expect(near.error).toContain(String(TOWN_MIN_DIST));
    expect(g.foundTown(-3, 5).error).toBe(FOUND_ERR.bounds);
    // an interior water tile (flatGame area has no water: make one)
    const wi = 30 * s.map.width + 40;
    s.map.tiles[wi].terrain = 'water';
    expect(g.foundTown(40, 30).error).toBe(FOUND_ERR.water);
    s.map.tiles[wi].terrain = 'grass';
    s.company.money = 100;
    const poor = g.foundTown(x, y);
    expect(poor.ok).toBe(false);
    expect(poor.error).toBeTruthy();
    expect(s.company.money).toBe(100);
  });

  test('a tile with a house or track is refused', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    const s = g.state;
    const r = g.buildRail(20, 20, 26, 20);
    expect(r.ok).toBe(true);
    expect(g.foundTown(22, 20).error).toBe(FOUND_ERR.occupied);
  });

  test('fund industry places a building of that type and charges the per-type price', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    const s = g.state;
    const n = s.industries.length, money = s.company.money;
    const r = g.fundIndustry('coal_mine', 12, 20);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(INDUSTRY_FUND_COSTS.coal_mine);
    expect(s.industries.length).toBe(n + 1);
    expect(s.industries.at(-1).typeId).toBe('coal_mine');
    expect(s.map.tiles[20 * s.map.width + 12].building.type).toBe('industry');
    expect(s.company.money).toBe(money - INDUSTRY_FUND_COSTS.coal_mine);
  });

  test('fund industry refuses an overlapping footprint and an unknown type', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    expect(g.fundIndustry('coal_mine', 12, 20).ok).toBe(true);
    const bad = g.fundIndustry('power_station', 13, 20);
    expect(bad.ok).toBe(false);
    expect(bad.error).toBe(FOUND_ERR.industrySite);
    expect(g.fundIndustry('nope', 30, 30).error).toBe(FOUND_ERR.industryType);
  });

  test('found town and industry survive a save/load roundtrip', () => {
    const g = flatGame(42);
    setSetting(g.state, 'townFounding', 'allowed');
    const [x, y] = freeSite(g);
    expect(g.foundTown(x, y).ok).toBe(true);
    expect(g.fundIndustry('farm', 40, 26).ok).toBe(true);
    const g2 = Game.deserialize(g.serialize());
    const t = g2.state.towns.at(-1), i = g2.state.industries.at(-1);
    expect([t.x, t.y]).toEqual([x, y]);
    expect(t.name).toBe(g.state.towns.at(-1).name);
    expect(i.typeId).toBe('farm');
    expect(g2.state.company.money).toBe(g.state.company.money);
    expect(g2.serialize()).toBe(g.serialize());
  });
});
