/**
 * Round AC industryCargoBacklog (default off = current Transit Tycoon behaviour: undelivered industry output is
 * discarded). On: undelivered output is kept per industry (cap 65535, OpenTTD u16 waiting buffer) and offered to the
 * stations in range at each monthly tick. Defaults and the off path draw no extra rng and keep no buffer.
 */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { placeIndustry } from '../js/simulation/industries.js';
import * as Industry from '../js/simulation/loco/industry.js';
import { waitingAmount } from '../js/simulation/stations.js';

/** Flat game with one coal mine at (10,20) as its only industry. */
function mineGame(seed = 42, on = true) {
  const g = flatGame(seed);
  const s = g.state;
  s.industries = s.industries.filter((i) => i.typeId !== 'coal_mine');
  setSetting(s, 'industryCargoBacklog', on);
  const ind = placeIndustry(s, 'coal_mine', 10, 20);
  Industry.ensureIndustryState(ind, s);
  return { g, s, ind };
}

/** Run n daily ticks of one industry (no station in range, so every unit is undelivered). */
function runDays(g, ind, n) {
  for (let i = 0; i < n; i++) Industry.updateDaily(g, ind);
}

describe('industryCargoBacklog setting', () => {
  test('default false and exactly one SETTING_META entry (group economy)', () => {
    expect(DEFAULT_SETTINGS.industryCargoBacklog).toBe(false);
    const meta = SETTING_META.filter((m) => m.key === 'industryCargoBacklog');
    expect(meta.length).toBe(1);
    expect(meta[0].group).toBe('economy');
  });

  test('default: output with no station in range is discarded (buffer stays 0)', () => {
    const { g, s, ind } = mineGame(42, false);
    runDays(g, ind, 60);
    expect(ind.producedMonthly[0]).toBeGreaterThan(0);
    expect(ind.cargoBacklog).toBeUndefined();
    Industry.updateMonthly(g, ind);
    expect(ind.cargoBacklog).toBeUndefined();
    expect(s.industries.includes(ind)).toBe(true);
  });

  test('on: output with no station in range accumulates, capped at 65535', () => {
    const { g, ind } = mineGame(42, true);
    runDays(g, ind, 60);
    expect(ind.cargoBacklog[0]).toBeGreaterThan(0);
    expect(ind.cargoBacklog[0]).toBeLessThanOrEqual(65535);
    // force the cap: keep the eighths buffer full so each day produces the 255-unit maximum
    ind.cargoBacklog[0] = 65530;
    for (let i = 0; i < 3; i++) { ind.outputBuffer[0] = 2040; Industry.updateDaily(g, ind); }
    expect(ind.cargoBacklog[0]).toBe(65535);
  });

  test('on: after a station is built in range, the next monthly tick delivers cargo from the buffer', () => {
    const { g, s, ind } = mineGame(42, true);
    runDays(g, ind, 60);
    const before = ind.cargoBacklog[0];
    expect(before).toBeGreaterThan(0);
    const st = g.buildRailStation(10, 24, 'x', 3);
    expect(st.ok).toBe(true);
    const station = s.stations.find((x) => x.id === st.station?.id) || s.stations[s.stations.length - 1];
    setSetting(s, 'selectGoods', false); // every station in range takes producer cargo (no vehicle needed)
    Industry.updateProducedCargoStats(s, ind);
    expect(ind.statsStations[0]).toContain(station.id);
    Industry.updateMonthly(g, ind);
    expect(ind.cargoBacklog[0]).toBeLessThan(before);
    expect(waitingAmount(station, 'COAL')).toBeGreaterThan(0);
  });

  test('round trip: buffer survives save and load', () => {
    const { g, ind } = mineGame(7, true);
    runDays(g, ind, 40);
    const want = ind.cargoBacklog.slice();
    expect(want[0]).toBeGreaterThan(0);
    const g2 = Game.deserialize(g.serialize());
    const ind2 = g2.state.industries.find((i) => i.id === ind.id);
    expect(ind2.cargoBacklog).toEqual(want);
    expect(g2.serialize()).toBe(g.serialize());
  });
});
