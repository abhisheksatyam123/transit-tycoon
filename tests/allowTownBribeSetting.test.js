import { describe, it, expect } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { Game } from '../js/simulation/game.js';
import { actionList, townAction } from '../js/simulation/townAuthority.js';
import { serializeState, parseState } from '../js/simulation/save.js';

function ctxFor(game) {
  return { state: game.state, emit: () => {} };
}

function townWithMoney(game, money = 1e9) {
  game.state.company.money = money;
  return game.state.towns.find((t) => t.houses && t.houses.length > 0) || game.state.towns[0];
}

describe('allowTownBribe setting (OpenTTD economy.bribe)', () => {
  it('defaults to true in DEFAULT_SETTINGS and fresh state', () => {
    expect(DEFAULT_SETTINGS.allowTownBribe).toBe(true);
    const game = Game.create({ seed: 1 });
    expect(getSetting(game.state, 'allowTownBribe')).toBe(true);
  });

  it('when true, bribe action is present and executable', () => {
    const game = Game.create({ seed: 1 });
    const town = townWithMoney(game);
    const ctx = ctxFor(game);
    // Ensure no unwanted/rating blocks; fresh town is fine.
    town.companyRating = 500;
    delete town.unwantedMonths;

    const list = actionList(game.state, town);
    const bribe = list.find((a) => a.id === 'bribe');
    expect(bribe).toBeTruthy();
    expect(bribe.enabled).toBe(true);
    expect(bribe.detail).not.toContain('disabled in game settings');

    const res = townAction(ctx, town.id, 'bribe');
    expect(res.ok).toBe(true);
  });

  it('when false, bribe action is disabled in actionList with error detail', () => {
    const game = Game.create({ seed: 1 });
    setSetting(game.state, 'allowTownBribe', false);
    const town = townWithMoney(game);
    town.companyRating = 500;
    delete town.unwantedMonths;

    const list = actionList(game.state, town);
    const bribe = list.find((a) => a.id === 'bribe');
    expect(bribe).toBeTruthy();
    expect(bribe.enabled).toBe(false);
    expect(bribe.detail).toBe('Bribing disabled in game settings');
  });

  it('when false, townAction refuses bribe with error', () => {
    const game = Game.create({ seed: 1 });
    setSetting(game.state, 'allowTownBribe', false);
    const town = townWithMoney(game);
    town.companyRating = 500;
    delete town.unwantedMonths;

    const res = townAction(ctxFor(game), town.id, 'bribe');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Bribing the town council is disabled in game settings');
  });

  it('save/load preserves allowTownBribe setting', () => {
    const game = Game.create({ seed: 1 });
    setSetting(game.state, 'allowTownBribe', false);
    expect(getSetting(game.state, 'allowTownBribe')).toBe(false);

    const loaded = parseState(serializeState(game.state));
    expect(getSetting(loaded, 'allowTownBribe')).toBe(false);

    setSetting(game.state, 'allowTownBribe', true);
    const loaded2 = parseState(serializeState(game.state));
    expect(getSetting(loaded2, 'allowTownBribe')).toBe(true);
  });
});
