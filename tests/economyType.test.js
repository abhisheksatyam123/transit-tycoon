// EF: economyType setting. 'openloco' (default) = current TT monthly production up/down + closures;
// 'frozen' = OpenTTD ET_FROZEN (industry_cmd.cpp:2926): no production changes, no closures.
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { updateMonthly as industriesMonthly } from '../js/simulation/loco/industryManager.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

const opts = (settings) => ({ seed: 1, width: 96, height: 96, townCount: 8, startYear: 1950, settings });

/** Step n months; return a per-industry snapshot of production targets, closing flags and the industry count. */
function run(g, months) {
  const trace = [];
  const seen = new Map();
  for (let m = 0; m < months; m++) {
    for (const i of g.state.industries) if (!seen.has(i.id)) seen.set(i.id, { targets: i.dailyProductionTarget.slice(), closing: i.closingDown });
    industriesMonthly(g);
    for (const i of g.state.industries) {
      const s = seen.get(i.id);
      if (!s) continue; // newly opened industry
      trace.push({ id: i.id, before: s.targets, after: i.dailyProductionTarget.slice(), closing: i.closingDown });
      s.targets = i.dailyProductionTarget.slice();
      s.closing = i.closingDown;
    }
  }
  return { trace, count: g.state.industries.length, seen };
}

describe('economyType setting', () => {
  test('default is openloco and is listed as a select option', () => {
    expect(DEFAULT_SETTINGS.economyType).toBe('openloco');
    const g = Game.create(opts({}));
    expect(getSetting(g.state, 'economyType')).toBe('openloco');
    expect(SETTING_META.find((m) => m.key === 'economyType').options.map((o) => o[0])).toEqual(['openloco', 'frozen']);
  });

  test('frozen: production targets and closing flags never change over 3 simulated years', () => {
    const g = Game.create(opts({ economyType: 'frozen' }));
    const before = g.state.industries.length;
    const { trace, count } = run(g, 36);
    expect(trace.length).toBeGreaterThan(0);
    for (const t of trace) {
      expect(t.after).toEqual(t.before);
      expect(t.closing).toBe(false);
    }
    expect(count).toBeGreaterThanOrEqual(before); // nothing removed
    for (const i of g.state.industries) expect(i.closingDown).toBe(false);
  });

  test('default (openloco): production changes or closures do happen over 3 simulated years', () => {
    const g = Game.create(opts({}));
    const { trace } = run(g, 36);
    const changed = trace.some((t) => t.closing || t.after.some((v, k) => v !== t.before[k]));
    expect(changed).toBe(true);
  });
});
