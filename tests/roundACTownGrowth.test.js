import { describe, test, expect } from 'bun:test';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { Game } from '../js/simulation/game.js';
import { growForTick, countActiveStations, ottdGrowthPeriod } from '../js/simulation/loco/townGrow.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

// TT_BASE_GROWTH_EVENTS: growForTick calls (of 200, buildSpeed 2) that grew a no-station town, measured on the
// pre-change tree (git archive of cacc423) with the same seed. The default path must reproduce it exactly.
const TT_BASE_GROWTH_EVENTS = 43;

const game = () => Game.create({ seed: 3, width: 96, height: 96, startYear: 1960, emptyFlat: true });
const townOf = (g) => g.state.towns.find((t) => t.houses && t.houses.length) || g.state.towns[0];

/** Give the town a station at its centre; picked = a pickup at the current tick. */
function addStation(g, town, lastPickup) {
  g.state.stations = g.state.stations || [];
  g.state.stations.push({
    id: 900 + g.state.stations.length, x: town.x, y: town.y, tiles: [{ x: town.x, y: town.y }],
    lastPickup, accepts: {}, cargo: {}, rating: {},
  });
}

/** Number of growForTick calls (out of n) that grew the town, buildSpeed 2 (TT default pace). */
function growEvents(g, town, n) {
  town.buildSpeed = 2;
  let k = 0;
  for (let i = 0; i < n; i++) if (growForTick(g, town, { placeHouses: true, allowTownRoads: true })) k++;
  return k;
}

describe('town growth model setting (opt-in OpenTTD model)', () => {
  test('default is tt and there is exactly one SETTING_META entry', () => {
    expect(DEFAULT_SETTINGS.townGrowthModel).toBe('tt');
    expect(getSetting(game().state, 'townGrowthModel')).toBe('tt');
    expect(SETTING_META.filter((m) => m.key === 'townGrowthModel').length).toBe(1);
    const meta = SETTING_META.find((m) => m.key === 'townGrowthModel');
    expect(meta.options.map((o) => o[0])).toEqual(['tt', 'ottd']);
  });

  test('default path: a town with no stations grows at the TT base rate (unchanged)', () => {
    const g = game();
    const town = townOf(g);
    expect(getSetting(g.state, 'townGrowthModel')).toBe('tt');
    // TT_BASE_GROWTH_EVENTS: measured on the pre-change tree (git archive of cacc423), same seed and calls.
    expect(growEvents(g, town, 200)).toBe(TT_BASE_GROWTH_EVENTS);
  });

  test('ottd: a town with no active station grows markedly slower than with one active station', () => {
    const none = game();
    const townNone = townOf(none);
    setSetting(none.state, 'townGrowthModel', 'ottd');
    const slow = growEvents(none, townNone, 2400);

    const one = game();
    const townOne = townOf(one);
    setSetting(one.state, 'townGrowthModel', 'ottd');
    addStation(one, townOne, { PASS: one.state.tick });
    const fast = growEvents(one, townOne, 2400);

    expect(fast).toBeGreaterThan(0);
    // measured (seed 3): 25 vs 72 over 2400 calls; growTown itself often fails, so the ratio is below the 6x chance ratio
    expect(slow * 2).toBeLessThan(fast);
  });

  test('ottd: stations count only with a pickup or unload in the last 20 days', () => {
    const g = game();
    const town = townOf(g);
    const now = g.state.tick;
    addStation(g, town, { PASS: now - 21 * TICKS_PER_DAY }); // stale pickup
    expect(countActiveStations(g.state, town)).toBe(0);
    g.state.stations[0].lastUnload = now - 19 * TICKS_PER_DAY; // recent delivery
    expect(countActiveStations(g.state, town)).toBe(1);
  });

  test('ottd growth period follows the OpenTTD table scaled by houses', () => {
    const g = game();
    const town = townOf(g);
    town.houses = [];
    expect(ottdGrowthPeriod(town, 0)).toBe(320);
    expect(ottdGrowthPeriod(town, 1)).toBe(420);
    expect(ottdGrowthPeriod(town, 9)).toBe(100);
    town.fundMonths = 2;
    expect(ottdGrowthPeriod(town, 0)).toBe(120);
  });
});

