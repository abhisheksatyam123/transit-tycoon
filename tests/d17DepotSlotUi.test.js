/**
 * D17 depot UI: the Position input is shown only when multiheadInterleave AND multiEngineConsists are on,
 * and its range helper clamps to 0..extra and defaults to the append position.
 */
import { test, expect, describe } from 'bun:test';
import { enginePositionUiOn, enginePositionRange } from '../js/ui/enginePosition.js';
import { setSetting } from '../js/simulation/settings.js';

function stateWith(a, b) {
  const s = { settings: {} };
  setSetting(s, 'multiheadInterleave', a);
  setSetting(s, 'multiEngineConsists', b);
  return s;
}

describe('D17 depot engine-position predicate', () => {
  test('off when either setting is off', () => {
    expect(enginePositionUiOn(stateWith(false, false))).toBe(false);
    expect(enginePositionUiOn(stateWith(true, false))).toBe(false);
    expect(enginePositionUiOn(stateWith(false, true))).toBe(false);
  });
  test('on only when both are on', () => {
    expect(enginePositionUiOn(stateWith(true, true))).toBe(true);
  });
  test('defaults (both off) keep the UI unchanged', () => {
    expect(enginePositionUiOn({})).toBe(false);
  });
});

describe('D17 depot engine-position range helper', () => {
  test('defaults to the append position (extra) when no request', () => {
    expect(enginePositionRange(2, undefined)).toEqual({ min: 0, max: 2, value: 2 });
    expect(enginePositionRange(2, '')).toEqual({ min: 0, max: 2, value: 2 });
    expect(enginePositionRange(0, null)).toEqual({ min: 0, max: 0, value: 0 });
    expect(enginePositionRange(1, 'abc')).toEqual({ min: 0, max: 1, value: 1 });
  });
  test('clamps to [0, extra]', () => {
    expect(enginePositionRange(2, -3).value).toBe(0);
    expect(enginePositionRange(2, 9).value).toBe(2);
    expect(enginePositionRange(2, 1).value).toBe(1);
  });
  test('floors fractions and tolerates string input', () => {
    expect(enginePositionRange(3, '1.7').value).toBe(1);
    expect(enginePositionRange(3, '0').value).toBe(0);
  });
});
