/** Raw industry construction (OpenTTD raw_industry_construction: normal / none / prospect; cmdFound.js). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { fundIndustry, prospectIndustry, estimateFound, isRawIndustry, rawIndustryMode, PROSPECT_CHANCE, FOUND_ERR } from '../js/simulation/cmdFound.js';
import { INDUSTRY_BY_ID } from '../js/config/industries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';

const withMode = (g, mode) => { setSetting(g.state, 'rawIndustryConstruction', mode); return g; };
const ctx = (g) => ({ state: g.state, rng: g.rng, emit: () => {} });
const newsTexts = (g) => (g.state.news || []).map((n) => n.text);

describe('raw industry construction setting', () => {
  test('default is normal and the setting is not written into a new state (defaults unchanged)', () => {
    expect(DEFAULT_SETTINGS.rawIndustryConstruction).toBe('normal');
    const g = flatGame(3);
    expect(g.state.settings).toBeUndefined();
    expect(rawIndustryMode(g.state)).toBe('normal');
  });

  test('raw vs processing classification follows the cargo tables', () => {
    expect(isRawIndustry(INDUSTRY_BY_ID.coal_mine)).toBe(true);
    expect(isRawIndustry(INDUSTRY_BY_ID.forest)).toBe(true);
    expect(isRawIndustry(INDUSTRY_BY_ID.power_station)).toBe(false);
    expect(isRawIndustry(INDUSTRY_BY_ID.sawmill)).toBe(false);
  });

  test('normal mode: a raw industry is funded at the chosen site (unchanged behaviour)', () => {
    const g = flatGame(3);
    const r = fundIndustry(ctx(g), 'coal_mine', 12, 20);
    expect(r.ok).toBe(true);
    expect(r.industry.x).toBe(12);
    expect(r.industry.y).toBe(20);
  });

  test('none mode: raw industries are refused, processing industries are still fundable', () => {
    const g = withMode(flatGame(3), 'none');
    expect(fundIndustry(ctx(g), 'coal_mine', 12, 20).error).toBe(FOUND_ERR.rawNone);
    expect(estimateFound(g.state, 'industry', 12, 20, 'coal_mine').ok).toBe(false);
    expect(estimateFound(g.state, 'industry', 12, 20, 'coal_mine').error).toBe(FOUND_ERR.rawNone);
    // a processing industry is not blocked by the mode (it is funded on a valid site)
    expect(estimateFound(g.state, 'industry', 40, 26, 'power_station').error).not.toBe(FOUND_ERR.rawNone);
    expect(fundIndustry(ctx(g), 'power_station', 40, 26).ok).toBe(true);
  });

  test('prospect mode: funding a raw industry never uses the click site and charges the price', () => {
    const g = withMode(flatGame(5), 'prospect');
    const before = g.state.company.money;
    const r = fundIndustry(ctx(g), 'coal_mine', 12, 20);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBe(before - r.cost);
    if (!r.prospectFailed) expect(r.industry.typeId).toBe('coal_mine');
  });

  test('prospect mode: money is refused without spending when short of cash', () => {
    const g = withMode(flatGame(5), 'prospect');
    g.state.company.money = 0;
    const r = prospectIndustry(ctx(g), 'coal_mine');
    expect(r.ok).toBe(false);
    expect(g.state.company.money).toBe(0);
  });

  test('prospect mode: dryRun estimate spends nothing and draws no rng', () => {
    const g = withMode(flatGame(5), 'prospect');
    const before = g.state.company.money;
    const rs = g.state.rngState;
    const r = prospectIndustry(ctx(g), 'coal_mine', { dryRun: true });
    expect(r.ok).toBe(true);
    expect(g.state.company.money).toBe(before);
    expect(g.state.rngState).toBe(rs);
  });

  test('prospect mode: success places the industry on a valid site and posts a "found" news', () => {
    // try seeds until a success occurs (chance 0.70 per try), then check placement and news
    let done = null;
    for (let seed = 1; seed < 40 && !done; seed++) {
      const g = withMode(flatGame(seed), 'prospect');
      const n0 = g.state.industries.length;
      const r = prospectIndustry(ctx(g), 'coal_mine');
      if (r.ok && !r.prospectFailed) done = { g, r, n0 };
    }
    expect(done).not.toBeNull();
    const { g, r, n0 } = done;
    expect(g.state.industries.length).toBe(n0 + 1);
    expect(r.industry.x).toBeGreaterThanOrEqual(0);
    expect(newsTexts(g).some((t) => t.startsWith('New Coal Mine found'))).toBe(true);
  });

  test('prospect mode: failure keeps the money spent and posts "Prospecting failed" news', () => {
    let done = null;
    for (let seed = 1; seed < 80 && !done; seed++) {
      const g = withMode(flatGame(seed), 'prospect');
      const before = g.state.company.money;
      const r = prospectIndustry(ctx(g), 'coal_mine');
      if (r.ok && r.prospectFailed) done = { g, r, before };
    }
    expect(done).not.toBeNull();
    expect(done.g.state.company.money).toBe(done.before - done.r.cost);
    expect(newsTexts(done.g).some((t) => t.startsWith('Prospecting failed'))).toBe(true);
  });

  test('prospect mode: the same seed gives the same result (deterministic, game rng)', () => {
    const run = () => {
      const g = withMode(flatGame(9), 'prospect');
      const r = prospectIndustry(ctx(g), 'coal_mine');
      return JSON.stringify([r.prospectFailed, r.industry || null, g.state.rngState]);
    };
    expect(run()).toBe(run());
  });

  test('prospect mode: processing industries keep the normal fund path', () => {
    const g = withMode(flatGame(5), 'prospect');
    const r = fundIndustry(ctx(g), 'power_station', 40, 26);
    expect(r.error).not.toBe(FOUND_ERR.rawNone);
  });

  test('per-type chance table matches OpenTTD prospecting_chance (coal 0xB3333333 = 0.70, forest 0xBFFFFFFF = 0.75)', () => {
    expect(PROSPECT_CHANCE.coal_mine).toBeCloseTo(0xB3333333 / 2 ** 32, 2);
    expect(PROSPECT_CHANCE.forest).toBeCloseTo(0xBFFFFFFF / 2 ** 32, 2);
  });

  test('setting survives a save/load round-trip', () => {
    const g = withMode(flatGame(3), 'none');
    const back = parseState(serializeState(g.state));
    expect(back.settings.rawIndustryConstruction).toBe('none');
  });
});
