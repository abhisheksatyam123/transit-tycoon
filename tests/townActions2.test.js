/**
 * T8b town actions: bribe, exclusive transport rights, road reconstruction (gap #8b).
 * Sources: OpenTTD town_cmd.cpp (TownActionBribe, TownActionBuyRights, TownActionRoadRebuild, monthly counters).
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { createRng } from '../js/simulation/rng.js';
import { updateAuthorityMonthly, actionList, townAction, townRating, RATING_BRIBE_DOWN_TO, RATING_BRIBE_UP_STEP, EXCLUSIVE_MONTHS, ROAD_WORKS_MONTHS, BRIBE_UNWANTED_MONTHS } from '../js/simulation/townAuthority.js';
import { createTraffic } from '../js/simulation/traffic.js';
import { COSTS } from '../js/config/costs.js';

function townGame() {
  const game = Game.create({ seed: 42, width: 96, height: 96 });
  const s = game.state;
  s.company.money = 50_000_000;
  s.towns = [{ id: 901, name: 'Bribeton', x: 30, y: 24, population: 0, houses: [], passengersLastMonth: 0,
    passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
    transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0 }];
  return { game, s, town: s.towns[0], ctx: game.ctx };
}

/** Find a seed-state (rngState) for which the next bribe draw fails / succeeds (deterministic search). */
function rngStateWith(failing) {
  for (let v = 1; v < 100000; v++) {
    const holder = { rngState: v };
    const r = createRng(holder).next();
    if ((r < 1 / 14) === failing) return v;
  }
  throw new Error('no state');
}

describe('bribe', () => {
  test('costs money and is listed; a successful bribe raises the rating by the OpenTTD step, capped at 800', () => {
    const { s, town, ctx } = townGame();
    town.companyRating = 100;
    s.rngState = rngStateWith(false);
    const before = s.company.money;
    const r = townAction(ctx, town.id, 'bribe');
    expect(r.ok).toBe(true);
    expect(s.company.money).toBeLessThan(before);
    expect(townRating(town)).toBe(100 + RATING_BRIBE_UP_STEP);
    expect(town.unwantedMonths).toBeUndefined();
    town.companyRating = 700;
    s.rngState = rngStateWith(false);
    townAction(ctx, town.id, 'bribe');
    expect(townRating(town)).toBe(800); // capped at RATING_BRIBE_MAXIMUM
  });

  test('a failed bribe sets the rating to the minimum (-50), blocks bribes for 6 months and zeroes station ratings', () => {
    const { s, town, ctx } = townGame();
    town.companyRating = 700;
    s.stations.push({ id: 7001, x: 31, y: 25, tiles: [{ x: 31, y: 25 }], rating: { 0: 80 }, lastPickup: {}, cargo: {}, accepts: {} });
    s.rngState = rngStateWith(true);
    const r = townAction(ctx, town.id, 'bribe');
    expect(r.ok).toBe(true);
    expect(townRating(town)).toBe(RATING_BRIBE_DOWN_TO);
    expect(town.unwantedMonths).toBe(BRIBE_UNWANTED_MONTHS);
    expect(s.stations.at(-1).rating[0]).toBe(0);
    const entry = actionList(s, town).find((a) => a.id === 'bribe');
    expect(entry.enabled).toBe(false);
    expect(townAction(ctx, town.id, 'bribe').ok).toBe(false);
    for (let m = 0; m < BRIBE_UNWANTED_MONTHS; m++) updateAuthorityMonthly(s);
    expect(town.unwantedMonths).toBeUndefined();
    expect(actionList(s, town).find((a) => a.id === 'bribe').enabled).toBe(true);
  });

  test('bribe is refused when the company cannot pay', () => {
    const { s, town, ctx } = townGame();
    s.company.money = 1;
    expect(townAction(ctx, town.id, 'bribe').ok).toBe(false);
  });

  test('bribe draw uses the game RNG (same state gives the same outcome)', () => {
    const a = townGame(), b = townGame();
    a.s.rngState = 12345; b.s.rngState = 12345;
    townAction(a.ctx, a.town.id, 'bribe');
    townAction(b.ctx, b.town.id, 'bribe');
    expect(a.s.rngState).toBe(b.s.rngState);
    expect(townRating(a.town)).toBe(townRating(b.town));
  });
});

describe('exclusive transport rights', () => {
  test('is purchasable once, shows an active counter, and expires after 12 months', () => {
    const { s, town, ctx } = townGame();
    expect(townAction(ctx, town.id, 'rights').ok).toBe(true);
    expect(town.exclusiveMonths).toBe(EXCLUSIVE_MONTHS);
    expect(actionList(s, town).find((a) => a.id === 'rights').detail).toMatch(/12 more months/);
    expect(townAction(ctx, town.id, 'rights').ok).toBe(false);
    for (let m = 0; m < EXCLUSIVE_MONTHS - 1; m++) updateAuthorityMonthly(s);
    expect(town.exclusiveMonths).toBe(1);
    updateAuthorityMonthly(s);
    expect(town.exclusiveMonths).toBeUndefined();
    expect(actionList(s, town).find((a) => a.id === 'rights').enabled).toBe(true);
  });

  test('persists through save/load while active', () => {
    const { s, town, ctx } = townGame();
    townAction(ctx, town.id, 'rights');
    const loaded = parseState(serializeState(s));
    expect(loaded.towns[0].exclusiveMonths).toBe(EXCLUSIVE_MONTHS);
  });
});

describe('road reconstruction', () => {
  test('is purchasable, lasts 6 months, and expires', () => {
    const { s, town, ctx } = townGame();
    expect(townAction(ctx, town.id, 'roadworks').ok).toBe(true);
    expect(town.roadWorksMonths).toBe(ROAD_WORKS_MONTHS);
    expect(townAction(ctx, town.id, 'roadworks').ok).toBe(false);
    for (let m = 0; m < ROAD_WORKS_MONTHS; m++) updateAuthorityMonthly(s);
    expect(town.roadWorksMonths).toBeUndefined();
  });

  test('cost follows the OpenTTD table entry scaled like the other actions', () => {
    const { s, town, ctx } = townGame();
    const entry = actionList(s, town).find((a) => a.id === 'roadworks');
    expect(entry.cost).toBeGreaterThanOrEqual(COSTS.roadRebuild);
    expect(townAction(ctx, town.id, 'roadworks', { dryRun: true }).cost).toBe(entry.cost);
  });

  test('road works persist through save/load while active', () => {
    const { s, town, ctx } = townGame();
    townAction(ctx, town.id, 'roadworks');
    const loaded = parseState(serializeState(s));
    expect(loaded.towns[0].roadWorksMonths).toBe(ROAD_WORKS_MONTHS);
  });

  test('no road-works field and a fresh traffic state without the action (default behaviour unchanged)', () => {
    const { s } = townGame();
    expect(createTraffic(s)).toBeTruthy();
    expect(s.towns[0].roadWorksMonths).toBeUndefined();
  });
});

describe('save/load of action fields', () => {
  test('a default town serializes without any new keys', () => {
    const { s } = townGame();
    const json = serializeState(s);
    expect(json.includes('roadWorksMonths')).toBe(false);
    expect(json.includes('exclusiveMonths')).toBe(false);
    expect(json.includes('unwantedMonths')).toBe(false);
  });
});

test('an unwanted town refuses every action (OpenTTD GetMaskOfTownActions)', () => {
  const { game, town } = townGame();
  game.state.company.money = 1e9;
  town.unwantedMonths = 3;
  const ctx = { state: game.state, emit: () => {} };
  expect(actionList(game.state, town).every((a) => !a.enabled)).toBe(true);
  expect(townAction(ctx, town.id, 'statue').ok).toBe(false);
  expect(townAction(ctx, town.id, 'advertise_small').ok).toBe(false);
});
