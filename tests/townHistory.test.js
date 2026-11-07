/** TH: town population history (town.hist): lazy monthly samples, 240 cap, saved with the game. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { clearArea } from '../js/simulation/map.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { updateMonthly as townMonthly } from '../js/simulation/loco/townManager.js';
import { pushTownHistory, TOWN_HISTORY_MONTHS } from '../js/simulation/loco/town.js';
import { townHistorySeries } from '../js/ui/windows/town.js';

function townGame() {
  const game = Game.create({ seed: 42, width: 96, height: 96 });
  const s = game.state;
  clearArea(s, 4, 14, 60, 34, 'grass');
  s.towns = [{ id: 900, name: 'Histville', x: 30, y: 24, population: 1234, houses: [], passengersLastMonth: 0,
    passengersTransported: 0, goodsDelivered: 0, growthCounter: 0, mailLastMonth: 0, passengersThisMonth: 0,
    transportedThisMonth: 0, mailThisMonth: 0, goodsThisMonth: 0, deliveredPassThisMonth: 0 }];
  return { game, s, town: s.towns[0] };
}

describe('town population history', () => {
  test('no hist at day 0; one sample after the first month end', () => {
    const { game, s, town } = townGame();
    expect(town.hist).toBeUndefined();
    townMonthly(game);
    expect(Array.isArray(town.hist)).toBe(true);
    expect(town.hist.length).toBe(1);
    expect(town.hist[0]).toBe(town.population); // sampled after updateMonthlyTown (population is recomputed from houses)
  });

  test('pushTownHistory: samples oldest first and caps at 240', () => {
    const town = { population: 10 };
    expect(TOWN_HISTORY_MONTHS).toBe(240);
    pushTownHistory(town, null);
    expect(town.hist).toBeUndefined();
    for (let i = 0; i < 300; i++) { town.population = i; pushTownHistory(town, { year: 1950, month: 0 }); }
    expect(town.hist.length).toBe(240);
    expect(town.hist[0]).toBe(60);
    expect(town.hist[239]).toBe(299);
  });

  test('save/load keeps the history', () => {
    const { game, s, town } = townGame();
    townMonthly(game);
    town.population = 777; townMonthly(game);
    const back = parseState(serializeState(s));
    const bt = back.towns.find((t) => t.id === 900);
    expect(bt.hist).toEqual(town.hist);
    expect(bt.hist.length).toBe(2);
  });

  test('series: last label is the sample month, oldest first', () => {
    const g = townHistorySeries([100, 200, 300], { year: 1951, month: 1 });
    expect(g.labels).toEqual(['Dec 50', 'Jan 51', 'Feb 51']);
    expect(g.series[0].values).toEqual([100, 200, 300]);
    expect(townHistorySeries(undefined, null).labels).toEqual([]);
  });
});
