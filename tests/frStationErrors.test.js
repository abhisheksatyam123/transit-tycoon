import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { ERR } from '../js/simulation/trackRules.js';
import { AXIS_BITS } from '../js/simulation/constants.js';

// Rail bits: x-axis straight = AXIS_BITS.x, y-axis straight = AXIS_BITS.y, a corner = one x bit + one y bit.
const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('rail station refusals on existing track (FR friction 3)', () => {
  test('a corner (curve) under the station gives the curve message, not the generic one', () => {
    const g = flatGame();
    const t = tileAt(g, 12, 24);
    t.rail = 2 | 1; // x bit + y bit: a curve
    const r = g.buildRailStation(10, 24, 'x', 3);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ERR.railCurve);
    expect(r.error).toMatch(/straight track along one axis/);
  });

  test('straight track on the other axis gives the wrong-axis message', () => {
    const g = flatGame();
    tileAt(g, 11, 24).rail = AXIS_BITS.y;
    const r = g.buildRailStation(10, 24, 'x', 3);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ERR.railAxis);
  });

  test('straight track on the station axis is allowed', () => {
    const g = flatGame();
    tileAt(g, 11, 24).rail = AXIS_BITS.x;
    const r = g.buildRailStation(10, 24, 'x', 3);
    expect(r.ok).toBe(true);
  });
});
