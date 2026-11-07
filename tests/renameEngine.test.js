/** Engine rename (renameEngine, lazy state.engineNames) and president rename (renamePresident, lazy company.presidentName). */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { engineDisplayName, presidentDisplayName, PRESIDENT_DEFAULT_NAME, MAX_NAME_LENGTH } from '../js/simulation/cmdRename.js';
import { ALL_VEHICLE_MODELS } from '../js/config/vehicles.js';

const model = ALL_VEHICLE_MODELS[0];

describe('renameEngine', () => {
  test('rename sets lazy engineNames; display name uses it; trimmed', () => {
    const g = flatGame(23);
    expect(g.state.engineNames).toBeUndefined();
    const r = g.renameEngine(model.id, '  City Hopper ');
    expect(r.ok).toBe(true);
    expect(g.state.engineNames).toEqual({ [model.id]: 'City Hopper' });
    expect(engineDisplayName(g.state, model)).toBe('City Hopper');
  });

  test('blank name removes the entry and deletes the map when empty', () => {
    const g = flatGame(23);
    g.renameEngine(model.id, 'Alpha');
    expect(g.renameEngine(model.id, '   ').ok).toBe(true);
    expect(g.state.engineNames).toBeUndefined();
    expect(engineDisplayName(g.state, model)).toBe(model.name);
  });

  test('blank keeps other renamed engines', () => {
    const g = flatGame(23);
    const other = ALL_VEHICLE_MODELS[1];
    g.renameEngine(model.id, 'Alpha');
    g.renameEngine(other.id, 'Beta');
    g.renameEngine(model.id, '');
    expect(g.state.engineNames).toEqual({ [other.id]: 'Beta' });
  });

  test('unknown model is refused and leaves no map behind', () => {
    const g = flatGame(23);
    const r = g.renameEngine('no-such-model-xyz', 'Name');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    expect(g.state.engineNames).toBeUndefined();
  });

  test('length and control-character rules apply', () => {
    const g = flatGame(23);
    expect(g.renameEngine(model.id, 'x'.repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
    expect(g.renameEngine(model.id, 'bad\u0007name').ok).toBe(false);
    expect(g.state.engineNames).toBeUndefined();
    expect(g.renameEngine(model.id, 'x'.repeat(MAX_NAME_LENGTH)).ok).toBe(true);
  });

  test('dryRun validates without storing', () => {
    const g = flatGame(23);
    expect(g.renameEngine(model.id, 'Dry', { dryRun: true }).ok).toBe(true);
    expect(g.state.engineNames).toBeUndefined();
  });

  test('save/load roundtrip keeps engine names', () => {
    const g = flatGame(23);
    g.renameEngine(model.id, 'Saved Name');
    const back = parseState(serializeState(g.state));
    expect(back.engineNames).toEqual({ [model.id]: 'Saved Name' });
    expect(engineDisplayName(back, model)).toBe('Saved Name');
  });
});

describe('renamePresident', () => {
  test('rename sets lazy presidentName; shown by display helper', () => {
    const g = flatGame(23);
    expect(g.state.company.presidentName).toBeUndefined();
    expect(presidentDisplayName(g.state)).toBe(PRESIDENT_DEFAULT_NAME);
    const r = g.renamePresident('  Ada Lovelace ');
    expect(r.ok).toBe(true);
    expect(g.state.company.presidentName).toBe('Ada Lovelace');
    expect(presidentDisplayName(g.state)).toBe('Ada Lovelace');
  });

  test('blank resets to default by deleting the field', () => {
    const g = flatGame(23);
    g.renamePresident('Ada');
    expect(g.renamePresident('').ok).toBe(true);
    expect(g.state.company.presidentName).toBeUndefined();
    expect(presidentDisplayName(g.state)).toBe(PRESIDENT_DEFAULT_NAME);
  });

  test('invalid name refused', () => {
    const g = flatGame(23);
    expect(g.renamePresident('y'.repeat(MAX_NAME_LENGTH + 1)).ok).toBe(false);
    expect(g.state.company.presidentName).toBeUndefined();
  });

  test('save/load roundtrip keeps president name', () => {
    const g = flatGame(23);
    g.renamePresident('Grace');
    const back = parseState(serializeState(g.state));
    expect(back.company.presidentName).toBe('Grace');
  });
});
