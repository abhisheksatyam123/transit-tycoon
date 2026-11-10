// OpenTTD economy.town_min_distance (IsCloseToTown, town_cmd.cpp:373): generated towns keep this Manhattan spacing.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const opts = (settings) => ({ seed: 3, width: 128, height: 128, townCount: 10, startYear: 1950, settings });
const spots = (g) => g.state.towns.map((t) => [t.x, t.y]);
const minPair = (pts) => {
  let m = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    m = Math.min(m, Math.abs(pts[i][0] - pts[j][0]) + Math.abs(pts[i][1] - pts[j][1]));
  }
  return m;
};

describe('town_min_distance', () => {
  test('default is 0 (automatic spacing)', () => {
    expect(DEFAULT_SETTINGS.townMinDistance).toBe(0);
  });

  test('explicit 0 gives the same towns as no setting (no extra draws)', () => {
    const none = Game.create(opts({}));
    const zero = Game.create(opts({ townMinDistance: 0 }));
    expect(spots(zero)).toEqual(spots(none));
  });

  test('an explicit minimum is respected between every pair of generated towns', () => {
    const g = Game.create(opts({ townMinDistance: 40 }));
    expect(g.state.towns.length).toBeGreaterThan(1);
    expect(minPair(spots(g))).toBeGreaterThanOrEqual(40);
  });

  test('a larger explicit minimum spreads towns further apart than the automatic spacing', () => {
    const auto = Game.create(opts({}));
    const far = Game.create(opts({ townMinDistance: 60 }));
    expect(minPair(spots(far))).toBeGreaterThanOrEqual(60);
    expect(minPair(spots(far))).toBeGreaterThan(minPair(spots(auto)));
  });

  test('UI: an Economy select for new maps, options include automatic', () => {
    const meta = SETTING_META.find((m) => m.key === 'townMinDistance');
    expect(meta.group).toBe('economy');
    expect(meta.newGame).toBe(true);
    expect(meta.type).toBe('select');
    expect(meta.options[0][0]).toBe('0');
  });
});
