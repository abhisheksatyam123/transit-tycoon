/** Q4: town_council_tolerance setting (OpenTTD difficulty.town_council_tolerance, 4 levels). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { refusalAt, refuseBelow, TOLERANCE_THRESHOLDS, TOLERANCE_PERMISSIVE, REFUSE_BELOW } from '../js/simulation/townAuthority.js';
import { serializeState, parseState } from '../js/simulation/save.js';

function townAt(g, rating) {
  const town = g.state.towns[0];
  town.x = 30; town.y = 20;
  town.companyRating = rating;
  return town;
}

describe('town council tolerance setting (Q4)', () => {
  test('default townCouncilTolerance is 0 in DEFAULT_SETTINGS and getSetting', () => {
    expect(DEFAULT_SETTINGS.townCouncilTolerance).toBe(0);
    const g = flatGame();
    expect(getSetting(g.state, 'townCouncilTolerance')).toBe(0);
  });

  test('TOLERANCE_THRESHOLDS and backwards-compat exports', () => {
    expect(TOLERANCE_THRESHOLDS).toEqual({ 0: 0, 1: 200, 2: 400, 3: -Infinity });
    expect(TOLERANCE_PERMISSIVE).toBe(3);
    expect(REFUSE_BELOW).toBe(0);
  });

  test('level 0 (Lenient): rating < 0 refuses, >= 0 allowed', () => {
    const g = flatGame();
    setSetting(g.state, 'townCouncilTolerance', 0);
    expect(refuseBelow(g.state)).toBe(0);
    townAt(g, -1);
    expect(refusalAt(g.state, 30, 20)).not.toBe(null);
    townAt(g, 0);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
    townAt(g, 100);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
  });

  test('level 1 (Tolerant): rating < 200 refuses (e.g. 100 refused), >= 200 allowed', () => {
    const g = flatGame();
    setSetting(g.state, 'townCouncilTolerance', 1);
    expect(refuseBelow(g.state)).toBe(200);
    townAt(g, 100);
    expect(refusalAt(g.state, 30, 20)).not.toBe(null);
    townAt(g, 199);
    expect(refusalAt(g.state, 30, 20)).not.toBe(null);
    townAt(g, 200);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
    townAt(g, 500);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
  });

  test('level 2 (Hostile): rating < 400 refuses (e.g. 300 refused), >= 400 allowed', () => {
    const g = flatGame();
    setSetting(g.state, 'townCouncilTolerance', 2);
    expect(refuseBelow(g.state)).toBe(400);
    townAt(g, 300);
    expect(refusalAt(g.state, 30, 20)).not.toBe(null);
    townAt(g, 399);
    expect(refusalAt(g.state, 30, 20)).not.toBe(null);
    townAt(g, 400);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
  });

  test('level 3 (Permissive): rating -900 allowed (never refuses)', () => {
    const g = flatGame();
    setSetting(g.state, 'townCouncilTolerance', 3);
    expect(refuseBelow(g.state)).toBe(-Infinity);
    townAt(g, -900);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
    townAt(g, -1000);
    expect(refusalAt(g.state, 30, 20)).toBe(null);
  });

  test('SETTING_META: group difficulty, type select, 4 options with correct labels', () => {
    const m = SETTING_META.find((x) => x.key === 'townCouncilTolerance');
    expect(m).toBeTruthy();
    expect(m.group).toBe('difficulty');
    expect(m.type).toBe('select');
    expect(m.options).toEqual([
      ['0', 'Lenient (default)'],
      ['1', 'Tolerant'],
      ['2', 'Hostile'],
      ['3', 'Permissive'],
    ]);
    expect(m.help).toContain('Lenient: refuses below 0 rating');
    expect(m.help).toContain('Tolerant: refuses below 200');
    expect(m.help).toContain('Hostile: refuses below 400');
    expect(m.help).toContain('Permissive: never refuses');
  });

  test('save/load serialization preserves townCouncilTolerance', () => {
    for (const level of [0, 1, 2, 3]) {
      const g = flatGame();
      setSetting(g.state, 'townCouncilTolerance', level);
      const loaded = parseState(serializeState(g.state));
      expect(getSetting(loaded, 'townCouncilTolerance')).toBe(level);
    }
  });
});
