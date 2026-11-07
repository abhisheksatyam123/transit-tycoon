/** Competitor speed (competitorSpeed setting, OpenTTD difficulty.competitor_speed): rival think cadence. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { thinkPasses, competitorSpeed } from '../js/simulation/aiCompanies.js';

const st = (level) => ({ settings: { competitorSpeed: level } });

describe('competitorSpeed cadence', () => {
  test('default 2 is exactly one think pass every month (old behaviour)', () => {
    expect(DEFAULT_SETTINGS.competitorSpeed).toBe(2);
    for (let m = 0; m < 240; m++) expect(thinkPasses(st(2), m)).toBe(1);
    expect(thinkPasses({}, 1234)).toBe(1); // no settings object at all
  });

  test('levels map to the documented cadence, integer only', () => {
    let v0 = 0, v1 = 0, v3 = 0, v4 = 0;
    for (let m = 0; m < 120; m++) {
      v0 += thinkPasses(st(0), m); v1 += thinkPasses(st(1), m);
      v3 += thinkPasses(st(3), m); v4 += thinkPasses(st(4), m);
    }
    expect(v0).toBe(30); // every 4th month
    expect(v1).toBe(60); // every 2nd month
    expect(v3).toBe(240);
    expect(v4).toBe(360);
    for (const m of [0, 1, 7]) for (let l = 0; l <= 4; l++) expect(Number.isInteger(thinkPasses(st(l), m))).toBe(true);
  });

  test('invalid stored value falls back to medium', () => {
    expect(competitorSpeed({ settings: { competitorSpeed: 9 } })).toBe(2);
    expect(competitorSpeed({ settings: { competitorSpeed: 'x' } })).toBe(2);
  });

  test('very fast acts more often than very slow over N days with AI enabled', () => {
    const run = (level) => {
      const g = flatGame(7);
      setSetting(g.state, 'aiCompanies', 1);
      setSetting(g.state, 'competitorSpeed', level);
      g.stepDays(60); // two months of real simulation with a rival
      let passes = 0;
      const start = g.state.date.year * 12 + g.state.date.month;
      for (let m = 0; m < 24; m++) passes += thinkPasses(g.state, start + m);
      return passes;
    };
    expect(run(4)).toBeGreaterThan(run(0));
    expect(run(2)).toBe(24);
  });

  test('setting is saved and loaded', () => {
    const g = flatGame(3);
    setSetting(g.state, 'competitorSpeed', 4);
    const back = parseState(serializeState(g.state));
    expect(getSetting(back, 'competitorSpeed')).toBe(4);
    expect(typeof getSetting(back, 'competitorSpeed')).toBe('number');
  });

  test('settings window entry under companies', () => {
    const m = SETTING_META.find((x) => x.key === 'competitorSpeed');
    expect(m).toBeTruthy();
    expect(m.group).toBe('companies');
    expect(m.options.map((o) => o[0])).toEqual(['0', '1', '2', '3', '4']);
  });
});
