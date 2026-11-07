/** Cheats (cheats.js): money +10M, year change clamped like OpenTTD, magic bulldozer, lazy state.cheated. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { moneyCheat, changeYearCheat, setMagicBulldozer, magicBulldozer, isCheated, MONEY_CHEAT_AMOUNT, CHEAT_MAX_YEAR } from '../js/simulation/cheats.js';
import { TOOL_BUTTONS, TOOL_GROUPS } from '../js/ui/toolbar.js';
import { HOTKEY_ACTIONS } from '../js/ui/hotkeys.js';

describe('cheats: money and year', () => {
  test('no cheat used: state.cheated is absent (lazy) and a save has no cheat fields', () => {
    const g = flatGame(3);
    expect(g.state.cheated).toBeUndefined();
    expect(isCheated(g.state)).toBe(false);
    expect(serializeState(g.state).includes('cheated')).toBe(false);
  });

  test('money cheat adds 10M to the company and marks the game cheated', () => {
    const g = flatGame(3);
    const before = g.state.company.money;
    const r = moneyCheat(g.state);
    expect(r.ok).toBe(true);
    expect(MONEY_CHEAT_AMOUNT).toBe(10000000);
    expect(g.state.company.money).toBe(before + 10000000);
    expect(g.state.cheated).toBe(true);
  });

  test('change year sets the year, keeps month and day, clamps to the valid range', () => {
    const g = flatGame(3);
    const { month, day } = g.state.date;
    const r = changeYearCheat(g.state, 1995);
    expect(r).toMatchObject({ ok: true, year: 1995, clamped: false });
    expect(g.state.date.year).toBe(1995);
    expect(g.state.date.month).toBe(month);
    expect(g.state.date.day).toBe(day);
    expect(g.state.cheated).toBe(true);
    const hi = changeYearCheat(g.state, 99999999);
    expect(hi).toMatchObject({ ok: true, year: CHEAT_MAX_YEAR, clamped: true });
    expect(changeYearCheat(g.state, -40).year).toBe(0);
    expect(changeYearCheat(g.state, Number.NaN).ok).toBe(false);
  });

  test('a year equal to the current one is a no-op and does not mark the game', () => {
    const g = flatGame(3);
    const y = g.state.date.year;
    const r = changeYearCheat(g.state, y);
    expect(r).toMatchObject({ ok: true, clamped: false });
    expect(g.state.cheated).toBeUndefined();
  });
});

describe('cheats: magic bulldozer', () => {
  test('is off by default; turning it on marks cheated; off removes the lazy field', () => {
    const g = flatGame(5);
    expect(magicBulldozer(g.state)).toBe(false);
    expect(g.state.cheats).toBeUndefined();
    setMagicBulldozer(g.state, true);
    expect(magicBulldozer(g.state)).toBe(true);
    expect(g.state.cheated).toBe(true);
    setMagicBulldozer(g.state, false);
    expect(magicBulldozer(g.state)).toBe(false);
    expect(g.state.cheats.magicBulldozer).toBeUndefined();
  });

  test('demolishes an industry footprint and its record when on; refuses it when off', () => {
    const g = flatGame(5);
    const s = g.state;
    placeIndustry(s, 'coal_mine', 40, 20);
    const ind = s.industries[s.industries.length - 1];
    const tile = s.map.tiles[ind.y * s.map.width + ind.x];
    expect(tile.building && tile.building.type).toBe('industry');
    const off = g.demolish(ind.x, ind.y, ind.x, ind.y);
    expect(off.ok).toBe(false);
    expect(s.industries.some((i) => i.id === ind.id)).toBe(true);
    setMagicBulldozer(s, true);
    const on = g.demolish(ind.x, ind.y, ind.x, ind.y);
    expect(on.ok).toBe(true);
    expect(s.industries.some((i) => i.id === ind.id)).toBe(false);
    expect(s.map.tiles[ind.y * s.map.width + ind.x].building).toBeFalsy();
  });

  test('a cheated save round-trips the cheat flags; a clean save has none', () => {
    const g = flatGame(5);
    moneyCheat(g.state);
    setMagicBulldozer(g.state, true);
    const back = parseState(serializeState(g.state));
    expect(back.cheated).toBe(true);
    expect(magicBulldozer(back)).toBe(true);
    const clean = flatGame(6);
    expect(parseState(serializeState(clean.state)).cheated).toBeUndefined();
  });
});

describe('cheats: UI wiring', () => {
  test('road waypoint tool is in the Road+ group; cheats window hotkey is hidden (not rebindable)', () => {
    expect(TOOL_BUTTONS.some((t) => t[0] === 'roadWaypoint')).toBe(true);
    const road = TOOL_GROUPS.find((g) => g[0] === 'road');
    expect(road[3]).toContain('roadWaypoint');
    expect(HOTKEY_ACTIONS.some((a) => a.id.includes('cheat'))).toBe(false);
  });
});
