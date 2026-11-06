import { describe, expect, test } from 'bun:test';
import { shipSpriteId, SHIP_BASE } from '../js/renderer/pack/ships.js';

describe('OpenGFX ship sprites', () => {
  test('each model has 8 consecutive direction sprites from its TTD base', () => {
    expect(SHIP_BASE).toEqual({ ship_cargo: 3677, ship_oiltanker: 3669, ship_ferry: 3685 });
    for (const m of Object.keys(SHIP_BASE)) {
      const ids = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => shipSpriteId(m, d));
      expect(ids).toEqual(ids.map((_, i) => SHIP_BASE[m] + i));
    }
  });
  test('direction wraps and unknown models give undefined', () => {
    expect(shipSpriteId('ship_ferry', 9)).toBe(3685 + 1);
    expect(shipSpriteId('ship_nope', 0)).toBeUndefined();
  });
});
