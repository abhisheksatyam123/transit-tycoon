import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe, beforeEach } from 'bun:test';
import {
  NEW_GAME_SETTING_KEYS, parseNewGameSettings, loadNewGameSettings, saveNewGameSetting, carryOverNewGameSettings,
  clearNewGameSettings,
} from '../js/ui/newGamePrefs.js';

describe('new-game settings carry-over (tt.newGameSettings)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  });

  test('only settings marked newGame are remembered', () => {
    expect(NEW_GAME_SETTING_KEYS).toContain('largeHouses');
    expect(NEW_GAME_SETTING_KEYS).toContain('farmFields');
    expect(NEW_GAME_SETTING_KEYS).not.toContain('treeGrowth');
    expect(parseNewGameSettings('{"largeHouses":true,"treeGrowth":true,"aiCompanies":2,"farmFields":"yes"}'))
      .toEqual({ largeHouses: true, aiCompanies: 2 });
  });

  test('invalid JSON, arrays and null give nothing', () => {
    expect(parseNewGameSettings('{nope')).toEqual({});
    expect(parseNewGameSettings('[true]')).toEqual({});
    expect(parseNewGameSettings(null)).toEqual({});
    expect(parseNewGameSettings(undefined)).toEqual({});
  });

  test('save then load round-trips through localStorage', () => {
    expect(loadNewGameSettings()).toEqual({});
    saveNewGameSetting('largeHouses', true);
    saveNewGameSetting('farmFields', true);
    saveNewGameSetting('treeGrowth', true);
    expect(loadNewGameSettings()).toEqual({ largeHouses: true, farmFields: true });
    saveNewGameSetting('farmFields', false);
    expect(loadNewGameSettings()).toEqual({ largeHouses: true, farmFields: false });
  });

  test('clearing forgets remembered new-game settings', () => {
    saveNewGameSetting('largeHouses', true);
    saveNewGameSetting('aiCompanies', 2);
    expect(loadNewGameSettings()).toEqual({ largeHouses: true, aiCompanies: 2 });
    clearNewGameSettings();
    expect(loadNewGameSettings()).toEqual({});
  });

  test('unavailable storage never throws', () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
    expect(loadNewGameSettings()).toEqual({});
    expect(() => saveNewGameSetting('largeHouses', true)).not.toThrow();
  });

  test('carry-over merges remembered settings; explicit dialog choices win', () => {
    const opts = { seed: 3, width: 96, settings: { farmFields: false } };
    const out = carryOverNewGameSettings(opts, { largeHouses: true, farmFields: true, aiCompanies: 2 });
    expect(out.settings).toEqual({ largeHouses: true, farmFields: false, aiCompanies: 2 });
    expect(out.seed).toBe(3);
    expect(opts.settings).toEqual({ farmFields: false }); // input not mutated
  });

  test('nothing remembered: options returned unchanged (defaults stay identical)', () => {
    const opts = { seed: 3, width: 96 };
    expect(carryOverNewGameSettings(opts, {})).toBe(opts);
    expect(carryOverNewGameSettings(opts, undefined)).toBe(opts);
    expect('settings' in carryOverNewGameSettings(opts, {})).toBe(false);
  });

  test('Moscow scenario and editor games are not changed', () => {
    const rem = { largeHouses: true };
    const m = { scenario: 'moscow', seed: 1 };
    expect(carryOverNewGameSettings(m, rem)).toBe(m);
    const e = { editor: true, width: 64 };
    expect(carryOverNewGameSettings(e, rem)).toBe(e);
    expect(carryOverNewGameSettings({ scenario: 'metropolis' }, rem).settings).toEqual({ largeHouses: true });
  });
});
