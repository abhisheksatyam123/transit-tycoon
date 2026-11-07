import { test, expect, describe } from 'bun:test';
import { COMPANY_COLOURS, DEFAULT_PLAYER_COLOUR, playerColourOf, setCompanyColour } from '../js/simulation/companyColour.js';
import { vehicleLimitError, vehicleKindOfModel } from '../js/simulation/vehicleLimit.js';
import { setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { parseGamePrefs } from '../js/ui/gamePrefs.js';
import { setPlayerColour, playerColour, COMPANY } from '../js/renderer/palette.js';

describe('company colour (CmdSetCompanyColour)', () => {
  test('16 distinct colours, default is the old yellow', () => {
    expect(COMPANY_COLOURS.length).toBe(16);
    expect(new Set(COMPANY_COLOURS.map((c) => c.hex)).size).toBe(16);
    expect(playerColourOf({ company: {} })).toBe(DEFAULT_PLAYER_COLOUR);
    expect(DEFAULT_PLAYER_COLOUR).toBe('#f5b300');
  });
  test('lazy: no colour key until chosen; set when chosen', () => {
    const state = { company: { money: 1 }, rivals: [] };
    expect('colour' in state.company).toBe(false);
    expect(setCompanyColour({ state }, '#1d3b8f').ok).toBe(true);
    expect(state.company.colour).toBe('#1d3b8f');
    expect(playerColourOf(state)).toBe('#1d3b8f');
  });
  test('refuses a colour a rival uses, and unknown colours', () => {
    const state = { company: {}, rivals: [{ id: 5, colour: '#2b7fd9' }] };
    const r = setCompanyColour({ state }, '#2B7FD9');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rival/);
    expect(state.company.colour).toBeUndefined();
    expect(setCompanyColour({ state }, '#000001').ok).toBe(false);
  });
  test('palette getter follows the chosen colour, back to default on null', () => {
    setPlayerColour('#8fd3f0');
    expect(playerColour()).toBe('#8fd3f0');
    expect(COMPANY.dark).not.toBe('#123f7a');
    setPlayerColour(null);
    expect(playerColour()).toBe('#1e6fd9');
    expect(COMPANY.dark).toBe('#123f7a');
  });
});

describe('max vehicles per company', () => {
  test('defaults are 500 for each kind', () => {
    expect(DEFAULT_SETTINGS.maxTrains).toBe(500);
    expect(DEFAULT_SETTINGS.maxRoadVeh).toBe(500);
    expect(DEFAULT_SETTINGS.maxAircraft).toBe(500);
    expect(DEFAULT_SETTINGS.maxShips).toBe(500);
  });
  test('refuses at the limit, counts per owner', () => {
    const state = { settings: {}, vehicles: [{ kind: 'road', ownerId: null }, { kind: 'road', ownerId: 7 }, { kind: 'train' }] };
    setSetting(state, 'maxRoadVeh', 2);
    expect(vehicleLimitError(state, 'road', null)).toBe(null); // 1 < 2
    state.vehicles.push({ kind: 'road', ownerId: null });
    expect(vehicleLimitError(state, 'road', null)).toMatch(/limit reached: 2 road vehicles/);
    expect(vehicleLimitError(state, 'road', 7)).toBe(null); // rival has its own count
    expect(vehicleLimitError(state, 'train', null)).toBe(null);
  });
  test('model kinds map to limit kinds', () => {
    expect(vehicleKindOfModel({ kind: 'engine' })).toBe('train');
    expect(vehicleKindOfModel({ kind: 'bus' })).toBe('road');
    expect(vehicleKindOfModel({ kind: 'aircraft' })).toBe('aircraft');
    expect(vehicleKindOfModel({ kind: 'ship' })).toBe('ship');
  });
});

describe('pause on new game pref', () => {
  test('defaults off and tolerates bad JSON', () => {
    expect(parseGamePrefs(null).pauseOnNewGame).toBe(false);
    expect(parseGamePrefs('{bad').pauseOnNewGame).toBe(false);
    expect(parseGamePrefs('{"pauseOnNewGame":true}').pauseOnNewGame).toBe(true);
    expect(parseGamePrefs('{"pauseOnNewGame":"yes"}').pauseOnNewGame).toBe(false);
  });
});
