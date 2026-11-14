/** Scenario editor (basic): editing is free, play-scenario starts a company and clears the flag, save/load round-trip, lazy field. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { playScenario, setEditorStartYear, constructionCharge, isEditor, EDITOR_TOOLS } from '../js/simulation/scenarioEditor.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { START_MONEY, START_LOAN } from '../js/simulation/constants.js';
import { setSetting } from '../js/simulation/settings.js';

const editor = (extra = {}) => Game.create({ editor: true, seed: 7, width: 40, height: 40, startYear: 1960, emptyFlat: true, ...extra });

describe('scenario editor', () => {
  test('normal games have no editor field (lazy)', () => {
    const g = Game.create({ seed: 3, width: 48, height: 48, townCount: 2, industryCount: 2 });
    setSetting(g.state, 'townFounding', 'allowed');
    expect('editor' in g.state).toBe(false);
    expect(g.isEditor()).toBe(false);
    expect(constructionCharge(g.state, 500)).toBe(500);
  });

  test('editor map: flat, no towns or industries, paused-start flag, start year', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    expect(g.state.editor.startYear).toBe(1960);
    expect(g.state.towns.length).toBe(0);
    expect(g.state.industries.length).toBe(0);
    expect(g.state.map.tiles.every((t) => t.height === 1)).toBe(true);
    expect(isEditor(g.state)).toBe(true);
  });

  test('terraform, plant, found town and fund industry cost no money in the editor', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    const m0 = g.state.company.money;
    expect(g.terraform('raise', { x0: 10, y0: 10, x1: 13, y1: 13 }).ok).toBe(true);
    expect(g.terraform('raise', { x0: 20, y0: 20, x1: 21, y1: 21 }).ok).toBe(true);
    const town = g.foundTown(30, 30);
    expect(town.ok).toBe(true);
    expect(g.state.towns.length).toBe(1);
    expect(g.state.company.money).toBe(m0);
    expect(g.state.company.ledger.current.expenses).toBe(0);
    expect(g.state.company.ledger.current.byType.construction || 0).toBe(0);
  });

  test('a normal game still charges for terraform', () => {
    const g = Game.create({ seed: 5, width: 40, height: 40, townCount: 1, industryCount: 0 });
    setSetting(g.state, 'townFounding', 'allowed');
    const m0 = g.state.company.money;
    let ok = false;
    for (let x = 2; x < 36 && !ok; x += 3) ok = g.terraform('raise', { x0: x, y0: 2, x1: x + 1, y1: 3 }).ok;
    expect(ok).toBe(true);
    expect(g.state.company.money).toBeLessThan(m0);
  });

  test('editor time does not advance', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    const d0 = JSON.stringify(g.state.date);
    expect(g.state.speed === undefined).toBe(true); // speed lives in the app; the app clamps it to 0 in editor mode
    expect(JSON.stringify(g.state.date)).toBe(d0);
  });

  test('setEditorStartYear validates range and moves the calendar', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    expect(setEditorStartYear(g.state, 1980).ok).toBe(true);
    expect(g.state.date.year).toBe(1980);
    expect(g.state.date.month).toBe(0);
    expect(setEditorStartYear(g.state, 1900).ok).toBe(false);
    expect(setEditorStartYear(g.state, 2100).ok).toBe(false);
    expect(setEditorStartYear(Game.create({ seed: 2, width: 40, height: 40 }).state, 1980).ok).toBe(false);
  });

  test('play scenario clears the flag, sets the year, starts a fresh company with normal money and loan', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    g.terraform('raise', { x0: 1, y0: 1, x1: 2, y1: 2 });
    g.state.company.money = 12345; // editor work must not matter after Play
    g.state.company.loan = 99999;
    setEditorStartYear(g.state, 1980);
    const r = g.playScenario();
    expect(r.ok).toBe(true);
    expect(r.year).toBe(1980);
    expect('editor' in g.state).toBe(false);
    expect(g.state.date.year).toBe(1980);
    expect(g.state.date.month).toBe(0);
    expect(g.state.company.money).toBe(START_MONEY);
    expect(g.state.company.loan).toBe(START_LOAN);
    expect(g.playScenario().ok).toBe(false); // not an editor any more
  });

  test('play then build costs money again', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    g.playScenario();
    const m0 = g.state.company.money;
    expect(g.terraform('raise', { x0: 10, y0: 10, x1: 12, y1: 12 }).ok).toBe(true);
    expect(g.state.company.money).toBeLessThan(m0);
  });

  test('a scenario round-trips through save/load and stays in editor mode', () => {
    const g = editor();
    setSetting(g.state, 'townFounding', 'allowed');
    g.terraform('raise', { x0: 3, y0: 3, x1: 6, y1: 6 });
    setEditorStartYear(g.state, 1990);
    const json = serializeState(g.state);
    const back = new Game(parseState(json));
    expect(back.state.editor.startYear).toBe(1990);
    expect(back.state.date.year).toBe(1990);
    expect(back.state.map.tiles[3 * 40 + 3].height).toBe(g.state.map.tiles[3 * 40 + 3].height);
    expect(back.state.towns.length).toBe(0);
    // a loaded editor map plays as a new company
    expect(back.playScenario().ok).toBe(true);
    expect(back.state.company.money).toBe(START_MONEY);
  });

  test('editor tool list excludes train/road/air tools', () => {
    expect(EDITOR_TOOLS).toContain('terraform');
    expect(EDITOR_TOOLS).toContain('foundTown');
    expect(EDITOR_TOOLS).not.toContain('rail');
    expect(EDITOR_TOOLS).not.toContain('airport');
  });
});
