/**
 * K4: OpenTTD CmdTownRating - set/get company rating in a town.
 * Tests setTownRating/getTownRating in townAuthority.js, game methods,
 * cheats UI action, and save/load round-trip preserving t.ratings.
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { clearArea } from '../js/simulation/map.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { setTownRating, getTownRating, RATING_NEUTRAL } from '../js/simulation/townAuthority.js';
import { MIN_COMPANY_RATING, MAX_COMPANY_RATING } from '../js/simulation/loco/town.js';

function townGame() {
  const game = Game.create({ seed: 42, width: 96, height: 96 });
  const s = game.state;
  clearArea(s, 4, 14, 60, 34, 'grass');
  for (let y = 14; y <= 34; y++) for (let x = 4; x <= 60; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.height = 1; t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
  }
  s.company.money = 5_000_000;
  s.towns = [
    { id: 900, name: 'Testville', x: 30, y: 24, population: 100, houses: [], passengersLastMonth: 0,
      passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
      transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0 },
    { id: 901, name: 'Rivaltown', x: 40, y: 24, population: 80, houses: [], passengersLastMonth: 0,
      passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
      transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0 },
  ];
  return { game, s, town: s.towns[0], town2: s.towns[1] };
}

describe('CmdTownRating (townAuthority)', () => {
  test('setTownRating sets t.ratings[key] clamped to [-1000, 1000]', () => {
    const { game, town } = townGame();
    const ctx = game.ctx;
    let r = setTownRating(ctx, town.id, null, 750);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(0);
    expect(r.rating).toBe(750);
    expect(town.ratings.player).toBe(750);

    r = setTownRating(ctx, town.id, null, 5000);
    expect(r.ok).toBe(true);
    expect(r.rating).toBe(MAX_COMPANY_RATING);
    expect(town.ratings.player).toBe(MAX_COMPANY_RATING);

    r = setTownRating(ctx, town.id, null, -9999);
    expect(r.ok).toBe(true);
    expect(r.rating).toBe(MIN_COMPANY_RATING);
    expect(town.ratings.player).toBe(MIN_COMPANY_RATING);

    // rounding
    r = setTownRating(ctx, town.id, null, 123.7);
    expect(r.rating).toBe(124);
  });

  test('getTownRating returns rating or default 500', () => {
    const { game, town } = townGame();
    expect(getTownRating(game.state, town.id, null)).toBe(RATING_NEUTRAL);
    expect(getTownRating(game.state, 999999, null)).toBe(RATING_NEUTRAL);
    setTownRating(game.ctx, town.id, null, -200);
    expect(getTownRating(game.state, town.id, null)).toBe(-200);
  });

  test('rival companyId keys are independent', () => {
    const { game, town } = townGame();
    setTownRating(game.ctx, town.id, null, 800);
    setTownRating(game.ctx, town.id, 2, -100);
    setTownRating(game.ctx, town.id, 'rivalA', 300);
    expect(getTownRating(game.state, town.id, null)).toBe(800);
    expect(getTownRating(game.state, town.id, 2)).toBe(-100);
    expect(getTownRating(game.state, town.id, 'rivalA')).toBe(300);
    expect(getTownRating(game.state, town.id, 'other')).toBe(RATING_NEUTRAL);
    expect(town.ratings.player).toBe(800);
    expect(town.ratings['2']).toBe(-100);
  });

  test('dryRun reports without mutating', () => {
    const { game, town } = townGame();
    const before = getTownRating(game.state, town.id, null);
    const r = setTownRating(game.ctx, town.id, null, 999, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.rating).toBe(999);
    expect(getTownRating(game.state, town.id, null)).toBe(before);
    expect(town.ratings).toBeUndefined();
  });

  test('unknown town returns error', () => {
    const { game } = townGame();
    expect(setTownRating(game.ctx, 12345, null, 100).ok).toBe(false);
  });
});

describe('Game.setTownRating / getTownRating', () => {
  test('delegates to townAuthority', () => {
    const { game, town } = townGame();
    const r = game.setTownRating(town.id, null, 600);
    expect(r.ok).toBe(true);
    expect(r.rating).toBe(600);
    expect(game.getTownRating(town.id, null)).toBe(600);
    game.setTownRating(town.id, 7, -50);
    expect(game.getTownRating(town.id, 7)).toBe(-50);
  });
});

describe('save/load round-trip preserves t.ratings', () => {
  test('ratings survive serialize/parse', () => {
    const { game, town, town2 } = townGame();
    game.setTownRating(town.id, null, 900);
    game.setTownRating(town.id, 3, -250);
    game.setTownRating(town2.id, 'rival', 400);
    const saved = serializeState(game.state);
    const s = parseState(saved);
    const t1 = s.towns.find((t) => t.id === town.id);
    const t2 = s.towns.find((t) => t.id === town2.id);
    expect(t1.ratings.player).toBe(900);
    expect(t1.ratings['3']).toBe(-250);
    expect(t2.ratings.rival).toBe(400);
  });
});

describe('cheats: Excellent town ratings action (logic)', () => {
  test('sets all towns to +1000 for player and marks cheated', () => {
    const { game } = townGame();
    expect(game.state.cheated).toBeFalsy();
    // Mirrors the cheats window "Excellent town ratings" button handler.
    const towns = game.state.towns || [];
    let n = 0;
    for (const t of towns) {
      const r = game.setTownRating(t.id, null, 1000);
      if (r.ok) n++;
    }
    if (towns.length) game.state.cheated = true;
    expect(n).toBe(towns.length);
    for (const t of game.state.towns) {
      expect(game.getTownRating(t.id, null)).toBe(1000);
    }
    expect(game.state.cheated).toBe(true);
  });
});
