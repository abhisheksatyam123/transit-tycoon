import { getTile } from '../js/simulation/map.js';
/** EV: economy recessions (halved production while active, then ends) and plane crashes (clean removal). */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { isInRecession, recessionHalve, updateMonthly as recessionMonth } from '../js/simulation/recession.js';
import { crashChance, maybeCrashLanding } from '../js/simulation/planeCrash.js';
import { AIRPORT_W, AIRPORT_H } from '../js/simulation/constants.js';
import { nearestTown } from '../js/simulation/state.js';

describe('economy recessions', () => {
  test('setting off: no state, no recession, no halving', () => {
    const game = flatGame(3);
    const s = game.state;
    for (let m = 0; m < 60; m++) recessionMonth(game);
    expect(s.recession).toBeUndefined();
    expect(isInRecession(s)).toBe(false);
    expect(recessionHalve(s, 9)).toBe(9);
  });

  test('halves production while active and ends after the recession period', () => {
    const game = flatGame(4);
    const s = game.state;
    setSetting(s, 'economyRecessions', true);
    s.recession = { fluct: 1 }; // the next month end starts the recession
    const events = [];
    game.on('news', (n) => events.push(n));
    recessionMonth(game);
    expect(isInRecession(s)).toBe(true);
    expect(s.recession.fluct).toBeLessThanOrEqual(0);
    expect(recessionHalve(s, 10)).toBe(5); // OpenTTD (amount + 1) >> 1
    expect(recessionHalve(s, 7)).toBe(4);
    expect(events.some((n) => /World Recession/.test(n.text) && n.cat === 'economy')).toBe(true);
    // walk the months: the recession ends at fluct -12, with the upturn news
    for (let m = 0; m < 20 && isInRecession(s); m++) recessionMonth(game);
    expect(events.some((n) => /Recession over/.test(n.text))).toBe(true);
    expect(isInRecession(s)).toBe(false);
    expect(recessionHalve(s, 10)).toBe(10);
    expect(s.recession.fluct).toBeGreaterThanOrEqual(312);
  });

  test('the first recession is scheduled lazily (state created only when on)', () => {
    const game = flatGame(5);
    setSetting(game.state, 'economyRecessions', true);
    recessionMonth(game);
    expect(game.state.recession).toBeDefined();
    expect(game.state.recession.fluct).toBeGreaterThan(0);
  });
});

describe('plane crashes', () => {
  test('setting off: chance is zero (nothing rolled)', () => {
    const game = flatGame(6);
    const v = { kind: 'aircraft', modelId: 'ac_tu134' };
    expect(crashChance(game.state, v)).toBe(0);
  });

  test('crash removes the vehicle cleanly, news posted, town rating drops, save/load works', () => {
    const game = flatGame(7);
    const s = game.state;
    s.date.year = 1980; // the Tu-134 jet is available from 1967
    setSetting(s, 'planeCrashes', 'normal');
    // a real airport and a rival-owned list reference so cleanup has something to clear
    let spot = null;
    for (let y = 4; y < s.map.height - AIRPORT_H && !spot; y++) {
      for (let x = 4; x < s.map.width - AIRPORT_W && !spot; x++) {
        if (game.buildAirport(x, y, { dryRun: true }).ok) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    const air = game.buildAirport(spot.x, spot.y);
    expect(air.ok).toBe(true);
    const st = s.stations.find((x) => x.id === air.stationId);
    const bought = game.buyVehicle(air.depotId, { modelId: 'ac_tu134' });
    expect(bought.ok).toBe(true);
    const v = bought.vehicle;
    game.setOrders(v.id, [{ stationId: air.stationId }]);
    v.load = { amount: 12, sourceX: 0, sourceY: 0, sinceTick: 0, fromStationId: null };
    v.cargoId = 'PASS';
    v.resv = [];
    s.rivals = [{ id: 99, vehicles: [v.id, 12345] }];
    const town = nearestTown(s, st.x, st.y); // the crash penalty goes to the nearest town
    expect(town).toBeTruthy();
    const before = town.companyRating ?? 500;
    st.cargo.PASS = [{ amount: 40, source: 1, tick: 0 }];
    // a crash roll with a huge chance threshold: force by using jets? use the real function with normal level
    // (li2 is a prop: chance 2^22 * 43/2^22 -> we call maybeCrashLanding with a jet to be deterministic)
    const news0 = s.news.length;
    expect(crashChance(s, v, st)).toBe(43); // city airport: level formula (normal)
    const ob = getTile(s.map, st.x, st.y).building;
    ob.airportType = 'small'; // short strip: jets use the OTTD 3276 value
    expect(crashChance(s, v, st)).toBe(3276);
    let crashed = false;
    for (let i = 0; i < 6000 && !crashed; i++) {
      s.rngState = (s.rngState + i + 1) >>> 0;
      if (s.vehicles.includes(v)) crashed = maybeCrashLanding({ state: s, emit: null }, v, st);
    }
    expect(crashed).toBe(true);
    expect(s.vehicles.includes(v)).toBe(false);
    expect(s.rivals[0].vehicles).toEqual([12345]);
    expect(st.cargo.PASS).toEqual([]);
    expect(st.rating.PASS ?? 1).toBe(1);
    expect(town.companyRating ?? 500).toBeLessThan(before);
    expect(s.news.length).toBe(news0 + 1);
    expect(s.news[s.news.length - 1].text).toMatch(/^Plane crashes! 12 die in fireball at /);
    // no dangling references to the removed vehicle
    expect(s.vehicles.some((w) => w.orderGroup === v.orderGroup && w !== v && v.orderGroup != null)).toBe(false);
    expect(JSON.stringify(s)).not.toContain(`"id":${v.id},"name"`);
    // save/load still works and ticks on
    const g2 = Game.deserialize(game.serialize());
    for (let t = 0; t < 50; t++) g2.step();
    expect(g2.state.vehicles.length).toBe(s.vehicles.length);
  });
});

describe('recession production paths', () => {
  /** Total passengers generated over `ticks` (sum of per-tick increases, so month resets do not count). */
  function paxOver(game, ticks) {
    let total = 0, prev = game.state.towns.reduce((a, t) => a + (t.passengersThisMonth || 0), 0);
    for (let k = 0; k < ticks; k++) {
      game.step();
      const now = game.state.towns.reduce((a, t) => a + (t.passengersThisMonth || 0), 0);
      if (now > prev) total += now - prev;
      prev = now;
    }
    return total;
  }

  test('houses generate about half the passengers during a recession (tileManager path)', () => {
    const TICKS = 3000;
    const rec = Game.create({ seed: 11, width: 96, height: 96 });
    setSetting(rec.state, 'economyRecessions', true);
    rec.state.recession = { fluct: -500 }; // deep in recession for the whole run (fluct stays <= 0)
    const normal = Game.create({ seed: 11, width: 96, height: 96 });
    const during = paxOver(rec, TICKS);
    const base = paxOver(normal, TICKS);
    expect(base).toBeGreaterThan(0);
    expect(during).toBeGreaterThan(0);
    expect(during).toBeLessThan(base * 0.7);
    expect(during).toBeGreaterThan(base * 0.35);
  });
});
