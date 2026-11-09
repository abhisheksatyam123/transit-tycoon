/** Company colour picker (OpenTTD ChangeCompanyColour): setCompanyColour, palette, rival refusal, invalid hex, save/load, new-game default. Primary-only (no secondary; see audit notes in companyColour.js). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { COMPANY_COLOURS, DEFAULT_PLAYER_COLOUR, playerColourOf, setCompanyColour } from '../js/simulation/companyColour.js';
import { playerVehicleColour, setPlayerColour, COMPANY } from '../js/renderer/palette.js';
import { companyRows } from '../js/ui/windows/companies.js';

describe('company colour', () => {
  test('default: playerColourOf is DEFAULT (yellow), company.colour lazily absent', () => {
    const g = flatGame(37);
    expect(g.state.company.colour).toBeUndefined();
    expect(playerColourOf(g.state)).toBe(DEFAULT_PLAYER_COLOUR);
    expect(DEFAULT_PLAYER_COLOUR).toBe('#f5b300');
    expect(COMPANY_COLOURS).toHaveLength(16);
  });

  test('pick a palette colour: ok, stored lowercase, playerColourOf follows', () => {
    const g = flatGame(37);
    const hex = COMPANY_COLOURS[9].hex; // Red
    const r = g.setCompanyColour(hex);
    expect(r.ok).toBe(true);
    expect(g.state.company.colour).toBe(hex);
    expect(playerColourOf(g.state)).toBe(hex);
    // re-pick same colour: still ok, idempotent
    expect(g.setCompanyColour(hex).ok).toBe(true);
    // case-insensitive
    const g2 = flatGame(38);
    expect(g2.setCompanyColour(hex.toUpperCase()).ok).toBe(true);
    expect(g2.state.company.colour).toBe(hex);
  });

  test('invalid hex rejected: unknown, malformed, empty, non-string', () => {
    const g = flatGame(37);
    for (const bad of ['#123456', 'red', '#fff', '', null, undefined, 123, '#GGGGGG']) {
      const r = g.setCompanyColour(bad);
      expect(r.ok).toBe(false);
      expect(g.state.company.colour).toBeUndefined();
      expect(playerColourOf(g.state)).toBe(DEFAULT_PLAYER_COLOUR);
    }
  });

  test('rival refusal: colour in use by a rival is refused and leaves player colour unchanged', () => {
    const g = flatGame(37);
    const rivalHex = COMPANY_COLOURS[5].hex;
    g.state.rivals = [{ id: 99, name: 'Rival', colour: rivalHex }];
    const r = g.setCompanyColour(rivalHex);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/rival/i);
    expect(g.state.company.colour).toBeUndefined();
    // picking a free colour still works
    expect(g.setCompanyColour(COMPANY_COLOURS[9].hex).ok).toBe(true);
    // case-insensitive rival match also refused
    expect(g.setCompanyColour(rivalHex.toUpperCase()).ok).toBe(false);
  });

  test('save/load round-trip preserves colour; absent stays absent', () => {
    const g = flatGame(37);
    const hex = COMPANY_COLOURS[4].hex;
    g.setCompanyColour(hex);
    const s2 = parseState(serializeState(g.state));
    expect(s2.company.colour).toBe(hex);
    expect(playerColourOf(s2)).toBe(hex);
    const g2 = flatGame(99);
    const s3 = parseState(serializeState(g2.state));
    expect(s3.company.colour).toBeUndefined();
    expect(playerColourOf(s3)).toBe(DEFAULT_PLAYER_COLOUR);
  });

  test('new-game default: createGameFast-style post-create apply (app.newGame strips + setCompanyColour)', () => {
    // Mirrors app.newGame: opts.companyColour deleted before generator, applied after via game.setCompanyColour
    const g = flatGame(37);
    const opts = { seed: 37, companyColour: COMPANY_COLOURS[9].hex };
    const cc = opts.companyColour; delete opts.companyColour;
    expect(opts.companyColour).toBeUndefined();
    if (cc) expect(g.setCompanyColour(cc).ok).toBe(true);
    expect(playerColourOf(g.state)).toBe(COMPANY_COLOURS[9].hex);
    // no choice => default
    const g2 = flatGame(38);
    expect(playerColourOf(g2.state)).toBe(DEFAULT_PLAYER_COLOUR);
  });

  test('renderer reacts: setPlayerColour follows playerColourOf (map/vehicle livery)', () => {
    const g = flatGame(37);
    const hex = COMPANY_COLOURS[9].hex;
    g.setCompanyColour(hex);
    setPlayerColour(playerColourOf(g.state));
    expect(playerVehicleColour()).toBe(hex);
    expect(COMPANY.primary).toBe(hex);
    setPlayerColour(null);
    expect(playerVehicleColour()).toBeNull();
  });

  test('companies window rows show the chosen colour for the player', () => {
    const g = flatGame(37);
    const hex = COMPANY_COLOURS[3].hex;
    g.setCompanyColour(hex);
    const rows = companyRows(g.state);
    expect(rows[0].player).toBe(true);
    expect(rows[0].colour).toBe(hex);
  });

  test('primary-only: no secondary field exists (documented, OTTD secondary intentionally omitted)', () => {
    const g = flatGame(37);
    g.setCompanyColour(COMPANY_COLOURS[9].hex);
    expect(g.state.company.colourSecondary).toBeUndefined();
    expect(g.state.company.secondaryColour).toBeUndefined();
    // save/load does not introduce one either
    const s2 = parseState(serializeState(g.state));
    expect(s2.company.colourSecondary).toBeUndefined();
  });
});
