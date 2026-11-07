import { test, expect } from 'bun:test';
import { MOSCOW_TILE_M } from '../js/config/maps/moscowMeta.js';
import { MOSCOW } from '../js/config/maps/moscow.js';
import { TILE_M } from '../js/simulation/scenarios/moscowScale.js';

test('moscowMeta tile size equals the baked map', () => {
  expect(MOSCOW_TILE_M).toBe(MOSCOW.tileMeters);
  expect(TILE_M).toBe(MOSCOW.tileMeters);
});
