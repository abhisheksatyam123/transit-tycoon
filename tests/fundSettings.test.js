/**
 * OpenTTD economy.fund_buildings / economy.fund_roads -> fundBuildings / fundRoads.
 * Both default true (= the town actions were always available before this setting), so the default
 * preserves the current behaviour. Off hides the action from actionList and doTownAction refuses it,
 * mirroring exclusiveRights (town_cmd.cpp GetMaskOfTownActions).
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { actionList, doTownAction, FUND_MONTHS, ROAD_WORKS_MONTHS } from '../js/simulation/townAuthority.js';

function townGame() {
  const game = Game.create({ seed: 1 });
  const town = game.state.towns.find((t) => t.houses && t.houses.length > 0) || game.state.towns[0];
  game.state.company.money = 1e9;
  town.companyRating = 500;
  delete town.unwantedMonths;
  delete town.fundMonths;
  delete town.roadWorksMonths;
  return { game, town, ctx: { state: game.state, emit: () => {} } };
}

describe('fundBuildings / fundRoads settings: defaults and metadata', () => {
  test('both default to true (= current behaviour)', () => {
    expect(DEFAULT_SETTINGS.fundBuildings).toBe(true);
    expect(DEFAULT_SETTINGS.fundRoads).toBe(true);
    const g = Game.create({ seed: 1 });
    expect(getSetting(g.state, 'fundBuildings')).toBe(true);
    expect(getSetting(g.state, 'fundRoads')).toBe(true);
  });

  test('each key has exactly one UI entry in the economy group', () => {
    for (const key of ['fundBuildings', 'fundRoads']) {
      const hits = SETTING_META.filter((m) => m.key === key);
      expect(hits.length).toBe(1);
      expect(hits[0].group).toBe('economy');
      expect(hits[0].type).toBe('check');
      expect(hits[0].label).toBeTruthy();
      expect(hits[0].help).toContain('OpenTTD');
      expect(hits[0].help).toContain('def true');
    }
  });
});

describe('fundBuildings (economy.fund_buildings)', () => {
  test('default: Fund new buildings is listed, enabled and executes', () => {
    const { game, town, ctx } = townGame();
    const fund = actionList(game.state, town).find((a) => a.id === 'fund');
    expect(fund).toBeTruthy();
    expect(fund.enabled).toBe(true);
    const res = doTownAction(ctx, town.id, 'fund');
    expect(res.ok).toBe(true);
    expect(town.fundMonths).toBe(FUND_MONTHS);
  });

  test('off: Fund new buildings is not listed and doTownAction refuses it', () => {
    const { game, town, ctx } = townGame();
    setSetting(game.state, 'fundBuildings', false);
    expect(actionList(game.state, town).find((a) => a.id === 'fund')).toBeUndefined();
    const res = doTownAction(ctx, town.id, 'fund');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('disabled');
    expect(town.fundMonths).toBeUndefined();
  });

  test('off leaves the other town actions listed', () => {
    const { game, town } = townGame();
    setSetting(game.state, 'fundBuildings', false);
    const list = actionList(game.state, town);
    expect(list.find((a) => a.id === 'roadworks')).toBeTruthy();
    expect(list.find((a) => a.id === 'advertise_small')).toBeTruthy();
    expect(list.find((a) => a.id === 'bribe')).toBeTruthy();
    expect(list.find((a) => a.id === 'rights')).toBeTruthy();
  });
});

describe('fundRoads (economy.fund_roads)', () => {
  test('default: Fund local road reconstruction is listed, enabled and executes', () => {
    const { game, town, ctx } = townGame();
    const roadworks = actionList(game.state, town).find((a) => a.id === 'roadworks');
    expect(roadworks).toBeTruthy();
    expect(roadworks.enabled).toBe(true);
    const res = doTownAction(ctx, town.id, 'roadworks');
    expect(res.ok).toBe(true);
    expect(town.roadWorksMonths).toBe(ROAD_WORKS_MONTHS);
  });

  test('off: Fund local road reconstruction is not listed and doTownAction refuses it', () => {
    const { game, town, ctx } = townGame();
    setSetting(game.state, 'fundRoads', false);
    expect(actionList(game.state, town).find((a) => a.id === 'roadworks')).toBeUndefined();
    const res = doTownAction(ctx, town.id, 'roadworks');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('disabled');
    expect(town.roadWorksMonths).toBeUndefined();
  });

  test('off leaves the other town actions listed', () => {
    const { game, town } = townGame();
    setSetting(game.state, 'fundRoads', false);
    const list = actionList(game.state, town);
    expect(list.find((a) => a.id === 'fund')).toBeTruthy();
    expect(list.find((a) => a.id === 'advertise_small')).toBeTruthy();
    expect(list.find((a) => a.id === 'bribe')).toBeTruthy();
    expect(list.find((a) => a.id === 'rights')).toBeTruthy();
  });

  test('both off hides only the two funding actions', () => {
    const { game, town } = townGame();
    setSetting(game.state, 'fundBuildings', false);
    setSetting(game.state, 'fundRoads', false);
    const ids = actionList(game.state, town).map((a) => a.id);
    expect(ids).not.toContain('fund');
    expect(ids).not.toContain('roadworks');
    expect(ids).toContain('advertise_small');
    expect(ids).toContain('statue');
    expect(ids).toContain('bribe');
    expect(ids).toContain('rights');
  });
});
