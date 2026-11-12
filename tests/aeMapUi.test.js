// New Game map options persistence + the town-layout Settings row (UI/preferences only; generation unchanged).
import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe, beforeEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { Game, MAPGEN_DEFAULTS } from '../js/simulation/game.js';
import {
  NEW_GAME_MAPGEN_KEY, MAPGEN_PREF_VALUES, parseNewGameMapgen, loadNewGameMapgen, saveNewGameMapgen,
  newGameMapgenSelection, loadNewGameSettings, saveNewGameSetting, parseNewGameSettings,
} from '../js/ui/newGamePrefs.js';

// Pinned New Game dialog defaults — the classic map. These values must never change.
const DEFAULT_MAPGEN = {
  terrain: 'normal', seaLevel: 'medium', rivers: 'none', cliffs: 'off', lakes: 'off',
  mountainStyle: 'off', smoothness: 'normal', variety: 0, townDensity: 'normal',
  townLayout: 'mixed', industryDensity: 'normal', climate: 'temperate', snowLine: 5,
};

describe('New Game mapgen options persistence (tt.newGameMapgen)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  });

  test('no stored preference: every mapgen option keeps its default', () => {
    expect(DEFAULT_MAPGEN).toEqual({ ...MAPGEN_DEFAULTS });
    expect(loadNewGameMapgen()).toEqual(DEFAULT_MAPGEN);
    // what the dialog starts with (no remembered Settings values either)
    expect(newGameMapgenSelection(loadNewGameSettings())).toEqual(DEFAULT_MAPGEN);
    expect(DEFAULT_SETTINGS.townLayout).toBe('mixed');
    // nothing was written just by reading
    expect(store.size).toBe(0);
  });

  test('saved non-default options are returned on reload (dialog reopened)', () => {
    saveNewGameMapgen({ ...DEFAULT_MAPGEN, terrain: 'hilly', seaLevel: 'high', rivers: 'many', lakes: 'few', climate: 'arctic', variety: 4, townLayout: 'better', snowLine: 7 });
    const expected = { ...DEFAULT_MAPGEN, terrain: 'hilly', seaLevel: 'high', rivers: 'many', lakes: 'few', climate: 'arctic', variety: 4, townLayout: 'better', snowLine: 7 };
    expect(loadNewGameMapgen()).toEqual(expected);
    expect(newGameMapgenSelection({})).toEqual(expected);
    // stored under the same 'tt.' prefix as tt.newGameSettings, non-default values only
    expect(JSON.parse(store.get(NEW_GAME_MAPGEN_KEY))).toEqual({
      terrain: 'hilly', seaLevel: 'high', rivers: 'many', lakes: 'few', climate: 'arctic', variety: 4, townLayout: 'better', snowLine: 7,
    });
    // choosing a default again clears the stored choice
    saveNewGameMapgen({ ...DEFAULT_MAPGEN, terrain: 'hilly' });
    expect(loadNewGameMapgen()).toEqual({ ...DEFAULT_MAPGEN, terrain: 'hilly' });
  });

  test('a corrupt stored value falls back to the default (valid siblings survive)', () => {
    store.set(NEW_GAME_MAPGEN_KEY, '{not json');
    expect(loadNewGameMapgen()).toEqual(DEFAULT_MAPGEN);
    store.set(NEW_GAME_MAPGEN_KEY, '[1,2,3]');
    expect(loadNewGameMapgen()).toEqual(DEFAULT_MAPGEN);
    store.set(NEW_GAME_MAPGEN_KEY, JSON.stringify({ terrain: 'swamp', variety: '4', snowLine: 99, lakes: 3, climate: 'toyland', townLayout: 'grid' }));
    expect(parseNewGameMapgen(store.get(NEW_GAME_MAPGEN_KEY))).toEqual({ climate: 'toyland' });
    expect(loadNewGameMapgen()).toEqual({ ...DEFAULT_MAPGEN, climate: 'toyland' });
    expect(Object.keys(MAPGEN_PREF_VALUES).sort()).toEqual(Object.keys(DEFAULT_MAPGEN).sort());
  });

  test('unavailable storage gives the defaults and never throws', () => {
    globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
    expect(loadNewGameMapgen()).toEqual(DEFAULT_MAPGEN);
    expect(() => saveNewGameMapgen({ terrain: 'flat' })).not.toThrow();
  });
});

describe('town layout in the Settings window (economy.town_layout)', () => {
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  });

  test('exactly one SETTING_META row in the town-settings group, with label, help and choices', () => {
    const rows = SETTING_META.filter((m) => m.key === 'townLayout');
    expect(rows.length).toBe(1);
    const m = rows[0];
    expect(m.group).toBe('economy');
    expect(m.type).toBe('select');
    expect(m.newGame).toBe(true);
    expect(m.label.length).toBeGreaterThan(0);
    expect(m.help.length).toBeGreaterThan(0);
    expect(m.help.toLowerCase()).toContain('new maps');
    expect(m.options.map(([v]) => v)).toEqual(['mixed', 'original', 'better', '2x2', '3x3', 'random']);
    expect(m.options[0][0]).toBe(DEFAULT_SETTINGS.townLayout);
    expect(SETTING_META.filter((x) => x.group === 'economy' && x.key === 'townLayout').length).toBe(1);
  });

  test('the row remembers the same value the New Game dialog starts from', () => {
    // Settings window select change: current game state + remembered new-game value
    saveNewGameSetting('townLayout', 'original');
    expect(loadNewGameSettings().townLayout).toBe('original');
    expect(newGameMapgenSelection(loadNewGameSettings()).townLayout).toBe('original');
    // back to the default also round-trips
    saveNewGameSetting('townLayout', 'mixed');
    expect(newGameMapgenSelection(loadNewGameSettings()).townLayout).toBe('mixed');
  });

  test('corrupt remembered town layout is dropped by the parser', () => {
    expect(parseNewGameSettings(JSON.stringify({ townLayout: 'diagonal' }))).toEqual({});
    expect(parseNewGameSettings(JSON.stringify({ townLayout: 'better', largeHouses: true }))).toEqual({ townLayout: 'better', largeHouses: true });
    expect(parseNewGameSettings(JSON.stringify({ townLayout: 3 }))).toEqual({});
  });

  test('a new game uses the chosen layout and the setting shows it; existing games are untouched', () => {
    const g = Game.create({ seed: 3, width: 64, height: 64, townCount: 6, mapgen: { townLayout: '2x2' } });
    expect(g.state.mapgen.townLayout).toBe('2x2');
    expect(getSetting(g.state, 'townLayout')).toBe('2x2');
    // the generator only reads state.mapgen: a default game stores neither value
    const plain = Game.create({ seed: 3, width: 64, height: 64, townCount: 6 });
    expect(plain.state.mapgen).toBeUndefined();
    expect(plain.state.settings?.townLayout).toBeUndefined();
  });
});

describe('generation is unchanged', () => {
  test('default random world hash pin (seed 1, 60 days)', () => {
    const g = Game.create({ seed: 1 });
    g.stepDays(60);
    const h = createHash('sha256').update(JSON.stringify(g.state)).digest('hex').slice(0, 16);
    expect(h).toBe('e66b684174510b6b');
  }, 30000);
});
