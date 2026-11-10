/**
 * Advertising campaigns must affect the live cargo rating (loco/station.js updateCargo).
 * Regression: st.adBoost was only read by the dead stations.js updateRatings, so buying a campaign had no effect.
 * Campaign tiers add N % points to the station rating (townAuthority.js ADVERTISE); the live rating is 0..200
 * (UI % = rating200 / 2), so the boost is 2N on the internal scale.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { updateCargo } from '../js/simulation/loco/station.js';
import { addWaiting } from '../js/simulation/stations.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

/** One game day per iteration: the rating update, then the clock advances (campaign expiry is tick-based). */
function runDays(g, st, days) {
  for (let d = 0; d < days; d++) {
    updateCargo(g, st);
    g.state.tick += TICKS_PER_DAY;
  }
  return st.rating200.COAL;
}

function fresh() {
  const g = flatGame(11);
  const L = coalLine(g);
  const st = L.b;
  // A large stock keeps the cargo slot non-empty for the whole run (updateCargo rates only non-empty slots,
  // OpenLoco Station::updateCargo), and keeps the quantity term in one bucket (>1000: 0 points).
  addWaiting(st, 'COAL', 20000, st.x, st.y, g.state.tick, 9999, 0, null, undefined, true);
  return { g, st };
}

describe('advertising campaign -> live cargo rating', () => {
  test('an active campaign raises the converged live rating by 2 x bonus (200-scale)', () => {
    const base = fresh();
    const baseRating = runDays(base.g, base.st, 120);
    const boosted = fresh();
    boosted.st.adBoost = { amount: 25, until: boosted.g.state.tick + 365 * TICKS_PER_DAY };
    const boostedRating = runDays(boosted.g, boosted.st, 120);
    expect(boostedRating - baseRating).toBe(50);
  });

  test('after the campaign expires the rating converges back to the unboosted value', () => {
    const base = fresh();
    const baseRating = runDays(base.g, base.st, 200);
    const boosted = fresh();
    boosted.st.adBoost = { amount: 25, until: boosted.g.state.tick + 60 * TICKS_PER_DAY };
    runDays(boosted.g, boosted.st, 60); // campaign active
    const expiredRating = runDays(boosted.g, boosted.st, 200); // campaign over
    expect(expiredRating).toBe(baseRating);
  });

  test('no campaign: updateCargo is identical to a station that never had adBoost', () => {
    const a = fresh();
    const b = fresh();
    expect(runDays(a.g, a.st, 60)).toBe(runDays(b.g, b.st, 60));
  });
});
