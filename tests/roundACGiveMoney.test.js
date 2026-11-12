/**
 * Round AC13: opt-in 'give money' town authority action (TT key localGiveMoney, default false / hidden).
 * OpenTTD 16.x has no give-money town action; economy.give_money is company-to-company only. TT adds this
 * donation using the bribe success rating mechanism (town_cmd.cpp TownActionBribe) with no RNG draw.
 */
import { describe, it, expect } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { Game } from '../js/simulation/game.js';
import { actionList, townAction, RATING_GIVE_MONEY_UP_STEP, RATING_BRIBE_MAXIMUM } from '../js/simulation/townAuthority.js';
import { COSTS } from '../js/config/costs.js';
import { constructionTotal } from '../js/simulation/prices.js';

function townGame(money = 50_000_000) {
  const game = Game.create({ seed: 42, width: 96, height: 96 });
  const s = game.state;
  s.company.money = money;
  s.towns = [{ id: 901, name: 'Donateton', x: 30, y: 24, population: 1000, houses: [], passengersLastMonth: 0,
    passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
    transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0, companyRating: 100 }];
  return { game, s, town: s.towns[0], ctx: game.ctx };
}

const DEFAULT_ACTIONS = ['advertise_small', 'advertise_medium', 'advertise_large', 'fund', 'roadworks', 'rights', 'statue', 'bribe'];

describe('localGiveMoney setting (opt-in town donation)', () => {
  it('defaults to false and has exactly one SETTING_META entry in the economy group', () => {
    expect(DEFAULT_SETTINGS.localGiveMoney).toBe(false);
    const game = Game.create({ seed: 1 });
    expect(getSetting(game.state, 'localGiveMoney')).toBe(false);
    const meta = SETTING_META.filter((m) => m.key === 'localGiveMoney');
    expect(meta.length).toBe(1);
    expect(meta[0].group).toBe('economy');
  });

  it('default: action list is unchanged and has no give_money entry', () => {
    const { s, town } = townGame();
    expect(actionList(s, town).map((a) => a.id)).toEqual(DEFAULT_ACTIONS);
  });

  it('default: the action is refused, so it cannot be invoked behind the UI', () => {
    const { s, town, ctx } = townGame();
    const before = s.company.money;
    const r = townAction(ctx, town.id, 'give_money');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Donating to the town is disabled in game settings');
    expect(s.company.money).toBe(before);
    expect(town.companyRating).toBe(100);
  });

  it('on: give_money is listed after statue and before bribe, costs its listed price and raises rating without RNG', () => {
    const { s, town, ctx } = townGame();
    setSetting(s, 'localGiveMoney', true);
    const ids = actionList(s, town).map((a) => a.id);
    expect(ids).toEqual([...DEFAULT_ACTIONS.slice(0, 7), 'give_money', 'bribe']);
    const entry = actionList(s, town).find((a) => a.id === 'give_money');
    const expectedCost = constructionTotal(s, Math.max(COSTS.giveMoney, Math.round(town.population * 90)), 'property');
    expect(entry.cost).toBe(expectedCost);
    expect(entry.enabled).toBe(true);

    const before = s.company.money;
    const rngBefore = s.rngState;
    const r = townAction(ctx, town.id, 'give_money');
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(expectedCost);
    expect(s.company.money).toBe(before - expectedCost);
    expect(town.companyRating).toBe(100 + RATING_GIVE_MONEY_UP_STEP);
    expect(s.rngState).toBe(rngBefore);
  });

  it('on: rating gain is capped at the bribe maximum', () => {
    const { s, town, ctx } = townGame();
    setSetting(s, 'localGiveMoney', true);
    town.companyRating = 700;
    expect(townAction(ctx, town.id, 'give_money').ok).toBe(true);
    expect(town.companyRating).toBe(RATING_BRIBE_MAXIMUM);
  });

  it('on: refused with an error when the company cannot afford the donation', () => {
    const { s, town, ctx } = townGame();
    setSetting(s, 'localGiveMoney', true);
    s.company.money = 1;
    const r = townAction(ctx, town.id, 'give_money');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Not enough money');
    expect(s.company.money).toBe(1);
    expect(town.companyRating).toBe(100);
  });
});
