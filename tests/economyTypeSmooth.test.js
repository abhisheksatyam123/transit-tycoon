// OpenTTD economy.type 'smooth' (ChangeIndustryProduction, industry_cmd.cpp:2943-2990) ported as
// loco/industry.js smoothMonthlyChange. Default ('openloco') and 'frozen' paths must not change.
import { test, expect, describe } from 'bun:test';
import { createRng } from '../js/simulation/rng.js';
import { smoothMonthlyChange } from '../js/simulation/loco/industry.js';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { updateMonthly as industriesMonthly } from '../js/simulation/loco/industryManager.js';

const type2 = { produces: ['COAL', 'GOOD'] };
const type1 = { produces: ['COAL'] };
const mkInd = (rates, pct = [0, 0]) => ({ typeId: 'x', dailyProductionTarget: rates.slice(), percentTransportedPrev: pct.slice() });
/** A rng whose 1/22 change draw never fires. */
const quiet = { int: () => 5 };

describe('smoothMonthlyChange', () => {
  test('no change draws and no closure when nothing fires', () => {
    const ind = mkInd([50, 50]);
    const r = smoothMonthlyChange(quiet, ind, type2);
    expect(r).toEqual({ changed: false, pct: 0, up: false, close: false });
    expect(ind.dailyProductionTarget).toEqual([50, 50]);
  });

  test('an industry with no produced cargo is untouched', () => {
    const ind = mkInd([]);
    expect(smoothMonthlyChange(createRng({ s: 1 }, 's'), ind, { produces: [] })).toEqual({ changed: false, pct: 0, up: false, close: false });
  });

  test('closes only when every produced rate is at the minimum (1)', () => {
    // COAL already at 1, GOOD held at 50 (steady, above the minimum): no closure
    expect(smoothMonthlyChange(quiet, mkInd([1, 50]), type2).close).toBe(false);
    // both at 1: closure
    expect(smoothMonthlyChange(quiet, mkInd([1, 1]), type2).close).toBe(true);
  });

  test('rates stay within 1..100 under random draws, both directions', () => {
    for (const pct of [0, 100]) {
      const rng = createRng({ s: 7 }, 's');
      const ind = mkInd([50, 50], [pct, pct]);
      for (let k = 0; k < 4000; k++) {
        smoothMonthlyChange(rng, ind, type2);
        for (const v of ind.dailyProductionTarget) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(100); }
      }
    }
  });

  test('poorly transported (0%) primary industries shrink and eventually close', () => {
    const rng = createRng({ s: 3 }, 's');
    const ind = mkInd([60], [0]);
    let closed = false;
    for (let k = 0; k < 20000 && !closed; k++) closed = smoothMonthlyChange(rng, ind, type1).close;
    expect(closed).toBe(true);
    expect(ind.dailyProductionTarget[0]).toBe(1);
  });

  test('well transported (100%) industries grow to the cap', () => {
    const rng = createRng({ s: 5 }, 's');
    const ind = mkInd([10], [100]);
    for (let k = 0; k < 20000; k++) smoothMonthlyChange(rng, ind, type1);
    expect(ind.dailyProductionTarget[0]).toBe(100);
  });

  test('reports the largest change and its direction', () => {
    const rng = { int: () => 0 }; // every draw is 0: the change fires, and up for pct 0 (int(0,2)===0)
    const ind = mkInd([40], [0]);
    const r = smoothMonthlyChange(rng, ind, type1);
    expect(r.changed).toBe(true);
    expect(r.up).toBe(true);
    expect(r.pct).toBe(3); // +1 on 40: max(((0+10)*40)>>8, 1) = 1 -> 2.5 % rounds to 3
  });
});

describe('economyType smooth in a game', () => {
  test('default stays openloco and smooth is a select option', () => {
    expect(DEFAULT_SETTINGS.economyType).toBe('openloco');
  });

  test('smooth runs for 24 months without errors and keeps primary rates in range', () => {
    const g = Game.create({ seed: 1, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { economyType: 'smooth' } });
    expect(getSetting(g.state, 'economyType')).toBe('smooth');
    for (let m = 0; m < 24; m++) industriesMonthly(g);
    for (const i of g.state.industries) {
      for (const v of i.dailyProductionTarget) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    }
  });
});
