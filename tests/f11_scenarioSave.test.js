/** F11: a saved scenario-editor map round-trips through the JSON file path and starts as a playable game. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { playScenario, isEditor } from '../js/simulation/scenarioEditor.js';

describe('F11 scenario file save/load', () => {
  test('editor JSON keeps the editor flag and start year; deserialized + playScenario starts the company', () => {
    const g = Game.create({ editor: true, seed: 9, width: 40, height: 40, startYear: 1980, emptyFlat: true });
    const json = g.serialize();
    const parsed = JSON.parse(json);
    expect(parsed.editor.startYear).toBe(1980);
    const back = Game.deserialize(json);
    expect(isEditor(back.state)).toBe(true);
    const r = playScenario(back.state);
    expect(r.ok).toBe(true);
    expect(r.year).toBe(1980);
    expect(isEditor(back.state)).toBe(false);
    expect(back.state.date.year).toBe(1980);
    expect(back.state.company).toBeTruthy();
  });

  test('playScenario refuses a normal game (no editor field)', () => {
    const g = Game.create({ seed: 4, width: 40, height: 40, townCount: 0, industryCount: 0 });
    expect(playScenario(g.state).ok).toBe(false);
  });
});
