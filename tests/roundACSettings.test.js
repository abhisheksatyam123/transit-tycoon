/**
 * Round AC settings (default-preserving ports):
 *  - economy.exclusive_rights        -> exclusiveRights (town action 'rights')
 *  - construction.road_stop_on_town_road -> roadStopOnTownRoad (buildRoadStop on town roads)
 *  - company.engine_renew_months     -> engineRenewMonths (autorenew delay past max age)
 *  - company.engine_renew_money      -> engineRenewMoney (money needed before renewal)
 * Each default reproduces the current Transit Tycoon behaviour; the non-default value changes it.
 */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { actionList, doTownAction } from '../js/simulation/townAuthority.js';
import { buildRoadStop } from '../js/simulation/cmdStation.js';
import { autorenewVehicle } from '../js/simulation/autorenew.js';
import { effectiveMaxAge } from '../js/simulation/vehicles.js';
import { AXIS_BITS } from '../js/simulation/constants.js';
import { getTile } from '../js/simulation/map.js';

function townGame() {
  const game = Game.create({ seed: 1 });
  const town = game.state.towns.find((t) => t.houses && t.houses.length > 0) || game.state.towns[0];
  game.state.company.money = 1e9;
  town.companyRating = 500;
  delete town.unwantedMonths;
  delete town.exclusiveMonths;
  return { game, town, ctx: { state: game.state, emit: () => {} } };
}

function puffer() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, v: r.vehicle };
}

describe('Round AC settings: defaults', () => {
  test('defaults reproduce the current behaviour', () => {
    expect(DEFAULT_SETTINGS.exclusiveRights).toBe(true);
    expect(DEFAULT_SETTINGS.roadStopOnTownRoad).toBe(true);
    expect(DEFAULT_SETTINGS.engineRenewMonths).toBe(6);
    expect(DEFAULT_SETTINGS.engineRenewMoney).toBe(100000);
    const g = flatGame();
    expect(getSetting(g.state, 'exclusiveRights')).toBe(true);
    expect(getSetting(g.state, 'engineRenewMonths')).toBe(6);
  });

  test('each key has exactly one UI entry in the right group', () => {
    const groups = { exclusiveRights: 'economy', roadStopOnTownRoad: 'construction', engineRenewMonths: 'companies', engineRenewMoney: 'companies' };
    for (const [key, group] of Object.entries(groups)) {
      const hits = SETTING_META.filter((m) => m.key === key);
      expect(hits.length).toBe(1);
      expect(hits[0].group).toBe(group);
      expect(hits[0].label).toBeTruthy();
      expect(hits[0].help).toBeTruthy();
    }
  });
});

describe('exclusiveRights (economy.exclusive_rights)', () => {
  test('default: rights action is listed, enabled and bought', () => {
    const { game, town, ctx } = townGame();
    const rights = actionList(game.state, town).find((a) => a.id === 'rights');
    expect(rights).toBeTruthy();
    expect(rights.enabled).toBe(true);
    expect(doTownAction(ctx, town.id, 'rights').ok).toBe(true);
    expect(town.exclusiveMonths).toBeGreaterThan(0);
  });

  test('false: rights action is not listed and doTownAction refuses it', () => {
    const { game, town, ctx } = townGame();
    setSetting(game.state, 'exclusiveRights', false);
    expect(actionList(game.state, town).find((a) => a.id === 'rights')).toBeUndefined();
    const res = doTownAction(ctx, town.id, 'rights');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('disabled');
    expect(town.exclusiveMonths).toBeUndefined();
  });

  test('false still lists the other town actions', () => {
    const { game, town } = townGame();
    setSetting(game.state, 'exclusiveRights', false);
    expect(actionList(game.state, town).find((a) => a.id === 'advertise_small')).toBeTruthy();
    expect(actionList(game.state, town).find((a) => a.id === 'bribe')).toBeTruthy();
  });
});

describe('roadStopOnTownRoad (construction.road_stop_on_town_road)', () => {
  function roadTile(g, owner) {
    const t = getTile(g.state.map, 20, 20);
    t.road = AXIS_BITS.x;
    t.owner = owner;
    return t;
  }

  test('default: a bus stop is built on a town road', () => {
    const g = flatGame();
    roadTile(g, 'town');
    const r = buildRoadStop(g.ctx, 20, 20, 'bus');
    expect(r.ok).toBe(true);
  });

  test('false: a bus stop on a town road is refused; a company road is still allowed', () => {
    const g = flatGame();
    setSetting(g.state, 'roadStopOnTownRoad', false);
    roadTile(g, 'town');
    const r = buildRoadStop(g.ctx, 20, 20, 'bus');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('town roads');

    const g2 = flatGame();
    setSetting(g2.state, 'roadStopOnTownRoad', false);
    roadTile(g2, 'company');
    expect(buildRoadStop(g2.ctx, 20, 20, 'bus').ok).toBe(true);
  });
});

describe('engineRenewMonths and engineRenewMoney (company.engine_renew_*)', () => {
  function oldPuffer(g, v, extraDays) {
    v.state = 'depot';
    v.age = effectiveMaxAge(g.state, v) + 1 + extraDays;
    return v;
  }

  test('0 months: renewal happens exactly when past max age', () => {
    const { g, v } = puffer();
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'engineRenewMoney', 0);
    setSetting(g.state, 'engineRenewMonths', 0);
    oldPuffer(g, v, 0);
    expect(autorenewVehicle(g.ctx, v)).not.toBe(null);
  });

  test('6 months: a vehicle 1 day past max age is not yet renewed; 6 months past is', () => {
    const { g, v } = puffer();
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'engineRenewMoney', 0);
    setSetting(g.state, 'engineRenewMonths', 6);
    oldPuffer(g, v, 0);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    v.age = effectiveMaxAge(g.state, v) + 6 * 30 + 1;
    expect(autorenewVehicle(g.ctx, v)).not.toBe(null);
  });

  test('0 money: renewal needs only the purchase cost', () => {
    const { g, v } = puffer();
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'engineRenewMonths', 0);
    setSetting(g.state, 'engineRenewMoney', 0);
    oldPuffer(g, v, 0);
    expect(autorenewVehicle(g.ctx, v)).not.toBe(null);
  });

  test('engineRenewMoney above the company money blocks renewal; a lower one does not', () => {
    const { g, v } = puffer();
    setSetting(g.state, 'autorenew', true);
    setSetting(g.state, 'engineRenewMonths', 0);
    oldPuffer(g, v, 0);
    setSetting(g.state, 'engineRenewMoney', g.state.company.money + 1e9);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    setSetting(g.state, 'engineRenewMoney', 1);
    expect(autorenewVehicle(g.ctx, v)).not.toBe(null);
  });
});
