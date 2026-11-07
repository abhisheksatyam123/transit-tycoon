import { test, expect } from 'bun:test';
import {
  AUTOSAVE_INTERVALS, AUTOSAVE_DEFAULT, AUTOSAVE_SLOTS, normalizeInterval, parseAutosavePrefs,
  advanceAutosaveCounter, pickAutosaveSlot, autosaveLabel,
} from '../js/ui/autosavePrefs.js';

test('intervals: off, 1, 3, 6, 12; default monthly', () => {
  expect(AUTOSAVE_INTERVALS).toEqual([0, 1, 3, 6, 12]);
  expect(AUTOSAVE_DEFAULT).toBe(1);
  expect(normalizeInterval('3')).toBe(3);
  expect(normalizeInterval(0)).toBe(0);
  expect(normalizeInterval(5)).toBe(AUTOSAVE_DEFAULT);
  expect(normalizeInterval('x')).toBe(AUTOSAVE_DEFAULT);
});

test('parse prefs: null, bad JSON and bad fields fall back to default', () => {
  expect(parseAutosavePrefs(null).interval).toBe(1);
  expect(parseAutosavePrefs('{bad').interval).toBe(1);
  expect(parseAutosavePrefs('{"interval":6}').interval).toBe(6);
  expect(parseAutosavePrefs('{"interval":7}').interval).toBe(1);
});

test('counter: off never fires; interval N fires every N months', () => {
  let m = 0; let fired = 0;
  for (let i = 0; i < 12; i++) { const r = advanceAutosaveCounter(0, m); m = r.months; if (r.due) fired++; }
  expect(fired).toBe(0);
  m = 0; fired = 0;
  for (let i = 0; i < 12; i++) { const r = advanceAutosaveCounter(3, m); m = r.months; if (r.due) fired++; }
  expect(fired).toBe(4);
  m = 0; const r1 = advanceAutosaveCounter(1, m);
  expect(r1.due).toBe(true);
});

test('ring: empty slot first, else oldest savedAt', () => {
  expect(pickAutosaveSlot([])).toBe(AUTOSAVE_SLOTS[0]);
  const full = [
    { slot: 'auto-1', savedAt: 300 }, { slot: 'auto-2', savedAt: 100 }, { slot: 'auto-3', savedAt: 200 },
  ];
  expect(pickAutosaveSlot(full)).toBe('auto-2');
  expect(pickAutosaveSlot([{ slot: 'auto-1', savedAt: 5 }, null, { slot: 'auto-3', savedAt: 1 }])).toBe('auto-2');
});

test('labels for the load window', () => {
  expect(autosaveLabel('auto-2')).toBe('Autosave 2');
  expect(autosaveLabel('1')).toBe('1');
});
