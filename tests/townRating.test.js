/**
 * T8 town rating + authority actions (gap #8). Uses a flat game with one hand-made town so every
 * rule runs through the real commands (station build, demolish) and the monthly update.
 */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { clearArea } from '../js/simulation/map.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { updateAuthorityMonthly, ratingTitle, townRating, advertBonus, LOCAL_AUTHORITY_DIST, STATUE_BONUS } from '../js/simulation/townAuthority.js';
import { updateMonthly as townMonthly } from '../js/simulation/loco/townManager.js';

function townGame() {
  const game = Game.create({ seed: 42, width: 96, height: 96 });
  const s = game.state;
  clearArea(s, 4, 14, 60, 34, 'grass');
  for (let y = 14; y <= 34; y++) for (let x = 4; x <= 60; x++) {
    const t = s.map.tiles[y * s.map.width + x];
    t.height = 1; t.rail = 0; t.road = 0; t.building = null; t.owner = null; t.terrain = 'grass';
  }
  s.company.money = 5_000_000;
  // a town at (30,24) with no houses (houses are not needed for the rating rules)
  s.towns = [{ id: 900, name: 'Testville', x: 30, y: 24, population: 0, houses: [], passengersLastMonth: 0,
    passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
    transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0 }];
  return { game, s, town: s.towns[0] };
}

describe('town rating', () => {
  test('rank titles follow the OpenLoco/OpenTTD bands', () => {
    expect(ratingTitle(-1000)).toBe('Appalling');
    expect(ratingTitle(-501)).toBe('Appalling');
    expect(ratingTitle(-500)).toBe('Poor');
    expect(ratingTitle(-1)).toBe('Poor');
    expect(ratingTitle(0)).toBe('Average');
    expect(ratingTitle(200)).toBe('Good');
    expect(ratingTitle(400)).toBe('Excellent');
    expect(ratingTitle(1000)).toBe('Excellent');
  });

  test('a new town is neutral (500) and carries no authority fields until changed', () => {
    const { town } = townGame();
    expect(townRating(town)).toBe(500);
    expect(town.companyRating).toBeUndefined();
    expect(town.statue).toBeUndefined();
    expect(town.fundMonths).toBeUndefined();
  });

  test('a served station near the town raises the rating monthly, an unserved one lowers it', () => {
    const { game, s, town } = townGame();
    const r = game.buildRailStation(30, 27, 'x', 2);
    expect(r.ok).toBe(true);
    const st = s.stations.find((x) => x.id === r.stationId);
    st.lastPickup = { PASS: s.tick };
    updateAuthorityMonthly(s);
    const up = townRating(town);
    expect(up).toBe(500 + 12 + 0); // +12 served, drift at 500 is zero
    st.lastPickup = { PASS: s.tick - 60 * TICKS_PER_DAY };
    updateAuthorityMonthly(s);
    expect(townRating(town)).toBeLessThan(up);
  });

  test('rating is clamped to -1000..1000', () => {
    const { game, s, town } = townGame();
    game.buildRailStation(30, 27, 'x', 2);
    town.companyRating = 995;
    const st = s.stations[0];
    st.lastPickup = { PASS: s.tick };
    for (let i = 0; i < 5; i++) updateAuthorityMonthly(s);
    expect(townRating(town)).toBeLessThanOrEqual(1000);
  });

  test('station build is refused below the threshold, with the town named in the message', () => {
    const { game, town } = townGame();
    town.companyRating = -200;
    const res = game.buildRailStation(30, 28, 'x', 2);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Testville');
    expect(res.error).toContain('refuses');
    town.companyRating = 0;
    expect(game.buildRailStation(30, 28, 'x', 2).ok).toBe(true);
  });

  test('stations farther than the authority distance are not refused', () => {
    const { game, town } = townGame();
    town.companyRating = -900;
    const far = 30 + LOCAL_AUTHORITY_DIST + 3;
    expect(game.buildRailStation(far, 28, 'x', 2).ok).toBe(true);
  });

  test('removing trees near the town lowers the rating; demolition is refused below 0', () => {
    const { game, s, town } = townGame();
    // plant some forest in the radius, then demolish it
    for (let x = 26; x <= 28; x++) s.map.tiles[20 * s.map.width + x].terrain = 'forest';
    const before = townRating(town);
    const ok = game.demolish(26, 20, 28, 20);
    expect(ok.ok).toBe(true);
    expect(townRating(town)).toBe(before - 3 * 35);
    // now below zero, town road demolition is refused
    town.companyRating = -10;
    s.map.tiles[24 * s.map.width + 30].road = 1;
    const refused = game.demolish(30, 24, 30, 24);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain('Testville');
  });

  test('advertising boosts nearby station cargo ratings, then expires', () => {
    const { game, s, town } = townGame();
    const r = game.buildRailStation(30, 27, 'x', 2);
    const st = s.stations.find((x) => x.id === r.stationId);
    const cost = game.townAction(town.id, 'advertise_small', { dryRun: true }).cost;
    const money0 = s.company.money;
    const res = game.townAction(town.id, 'advertise_small');
    expect(res.ok).toBe(true);
    expect(s.company.money).toBe(money0 - cost);
    expect(st.adBoost.amount).toBeGreaterThan(0);
    expect(st.adBoost.until).toBeGreaterThan(s.tick);
    // the boost is applied inside updateRatings: target rises while active
    expect(st.adBoost.until - s.tick).toBeGreaterThan(30 * TICKS_PER_DAY);
    // after expiry it no longer counts
    s.tick = st.adBoost.until + 1;
    expect(advertBonus(s, st)).toBe(0);
  });

  test('a statue can be built once per town and gives a permanent rating bonus', () => {
    const { game, s, town } = townGame();
    const r0 = townRating(town);
    expect(game.townAction(town.id, 'statue').ok).toBe(true);
    expect(town.statue).toBe(true);
    expect(townRating(town)).toBe(r0 + STATUE_BONUS);
    const again = game.townAction(town.id, 'statue');
    expect(again.ok).toBe(false);
    expect(again.error).toContain('already');
    expect(townRating(town)).toBe(r0 + STATUE_BONUS);
    expect(s.company.money).toBeLessThan(5_000_000);
  });

  test('fund new buildings sets the town to fast growth for a few months', () => {
    const { game, s, town } = townGame();
    expect(game.townAction(town.id, 'fund').ok).toBe(true);
    expect(town.fundMonths).toBe(3);
    expect(game.townAction(town.id, 'fund').ok).toBe(false);
    townMonthly(game);
    expect(town.buildSpeed).toBe(4);
    expect(town.fundMonths).toBe(2);
  });

  test('actions are refused when the company cannot pay', () => {
    const { game, s, town } = townGame();
    s.company.money = 10;
    const res = game.townAction(town.id, 'statue');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Not enough money');
    expect(town.statue).toBeUndefined();
  });

  test('save round-trip keeps the rating state; an old save without it loads at neutral', () => {
    const { game, town } = townGame();
    game.townAction(town.id, 'statue');
    game.townAction(town.id, 'fund');
    const back = parseState(serializeState(game.state));
    const t2 = back.towns[0];
    expect(t2.companyRating).toBe(town.companyRating);
    expect(t2.statue).toBe(true);
    expect(t2.fundMonths).toBe(3);
    // an old save: no authority fields at all
    const old = parseState(serializeState(townGame().game.state));
    expect(townRating(old.towns[0])).toBe(500);
    expect(old.towns[0].statue).toBeUndefined();
  });
});
