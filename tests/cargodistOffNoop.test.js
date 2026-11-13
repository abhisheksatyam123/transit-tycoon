/** Default settings (cargodist off, freightDistribution manual): the link graph schedules are true no-ops. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { updateMonthly, updateDaily, cargodistOn, freightMode } from '../js/simulation/cargodist.js';
import { DEFAULT_SETTINGS } from '../js/simulation/settings.js';

describe('cargodist off no-op', () => {
  test('defaults really are cargodist off + manual freight', () => {
    expect(DEFAULT_SETTINGS.cargodist).toBe('off');
    expect(DEFAULT_SETTINGS.freightDistribution).toBe('manual');
    const g = flatGame(31);
    expect(cargodistOn(g.state)).toBe(false);
    expect(freightMode(g.state)).toBe('manual');
  });

  test('updateMonthly and updateDaily leave the state deep-equal and create no cargoDist', () => {
    const g = flatGame(32);
    const before = JSON.stringify(g.state);
    for (let m = 0; m < 6; m++) {
      updateMonthly(g.state);
      updateDaily(g.state);
    }
    expect(g.state.cargoDist).toBeUndefined();
    expect(JSON.stringify(g.state)).toBe(before);
  });
});
