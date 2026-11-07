/** Hide / unhide engines (cmdEngineVisibility.js): lazy company.hiddenEngines, owner check, save round trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { setEngineHidden, isEngineHidden } from '../js/simulation/cmdEngineVisibility.js';
import { ALL_VEHICLE_MODELS } from '../js/config/vehicles.js';

describe('engine hide / unhide', () => {
  test('hide adds the model and the field; unhiding the last one removes the field', () => {
    const game = flatGame(7);
    const s = game.state;
    const id = ALL_VEHICLE_MODELS[0].id;
    expect(s.company.hiddenEngines).toBeUndefined();
    expect(game.setEngineHidden(id, true).ok).toBe(true);
    expect(s.company.hiddenEngines).toEqual([id]);
    expect(isEngineHidden(s, id)).toBe(true);
    game.setEngineHidden(id, true); // idempotent
    expect(s.company.hiddenEngines).toEqual([id]);
    expect(game.setEngineHidden(id, false).ok).toBe(true);
    expect(s.company.hiddenEngines).toBeUndefined();
    expect(isEngineHidden(s, id)).toBe(false);
  });

  test('unknown model is refused and nothing is stored', () => {
    const game = flatGame(7);
    expect(game.setEngineHidden('no_such_model', true).ok).toBe(false);
    expect(game.state.company.hiddenEngines).toBeUndefined();
  });

  test('hiding does not block buying (the list is UI only)', () => {
    const game = flatGame(7);
    game.setEngineHidden('bus_city', true);
    expect(isEngineHidden(game.state, 'bus_city')).toBe(true);
    expect(setEngineHidden({ state: game.state }, 'bus_city', false).ok).toBe(true);
  });

  test('save / load round trip keeps the hidden list', () => {
    const game = flatGame(7);
    game.setEngineHidden('bus_city', true);
    game.setEngineHidden(ALL_VEHICLE_MODELS[1].id, true);
    const back = parseState(serializeState(game.state));
    expect(back.company.hiddenEngines).toEqual(['bus_city', ALL_VEHICLE_MODELS[1].id]);
  });

  test('a save without the field loads with nothing hidden', () => {
    const game = flatGame(7);
    const back = parseState(serializeState(game.state));
    expect(back.company.hiddenEngines).toBeUndefined();
    expect(isEngineHidden(back, 'bus_city')).toBe(false);
  });
});
