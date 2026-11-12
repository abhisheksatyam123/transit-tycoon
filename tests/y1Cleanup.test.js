// Y1 cleanup: the generated large-house table no longer exports the unused LARGE_HOUSE_GROUPS; LARGE_HOUSES stays.
import { test, expect } from 'bun:test';
import * as large from '../js/renderer/pack/large_house_table.js';

test('generated large_house_table has no LARGE_HOUSE_GROUPS export and keeps LARGE_HOUSES', () => {
  expect('LARGE_HOUSE_GROUPS' in large).toBe(false);
  expect(Object.keys(large)).toEqual(['LARGE_HOUSES']);
  expect(typeof large.LARGE_HOUSES).toBe('object');
  expect(large.LARGE_HOUSES[7].group).toBe(7);
});
