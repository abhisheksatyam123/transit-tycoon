// OpenTTD vehicle.disable_elrails (def false): electric engines do not need catenary when on.
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { findPath } from '../js/simulation/pathfinder.js';
import { findVehiclePath, needsElectric } from '../js/simulation/routing.js';
import { modelAvailable } from '../js/simulation/vehicles.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { Game } from '../js/simulation/game.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

/** Straight rail y=30 x=10..20, no electrification anywhere. */
function plainLine() {
  const g = flatGame();
  expect(g.buildRail(10, 30, 20, 30).ok).toBe(true);
  return g;
}
const electricTrain = { kind: 'train', modelId: 'eng_volt', tx: 10, ty: 30, history: [] };

describe('disable_elrails (disableElrails)', () => {
  test('defaults to false (catenary required, current behaviour)', () => {
    expect(DEFAULT_SETTINGS.disableElrails).toBe(false);
    expect(MODEL_BY_ID.eng_volt.traction).toBe('electric');
  });

  test('off: an electric train finds no path on non-electrified track', () => {
    const g = plainLine();
    expect(findVehiclePath(g.state, electricTrain, [{ x: 20, y: 30 }])).toBeNull();
    expect(needsElectric(electricTrain, g.state)).toBe(true);
  });

  test('on: the electric train routes over plain rail; the requirement is dropped', () => {
    const g = plainLine();
    setSetting(g.state, 'disableElrails', true);
    expect(getSetting(g.state, 'disableElrails')).toBe(true);
    expect(needsElectric(electricTrain, g.state)).toBe(false);
    const path = findVehiclePath(g.state, electricTrain, [{ x: 20, y: 30 }]);
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 20, y: 30 });
  });

  test('on: electric engines are buyable without any electrified track', () => {
    const g = plainLine();
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_volt)).toBe(false);
    setSetting(g.state, 'disableElrails', true);
    expect(modelAvailable(g.state, MODEL_BY_ID.eng_volt)).toBe(true);
  });

  test('diesel trains are unaffected by the setting', () => {
    const g = plainLine();
    setSetting(g.state, 'disableElrails', true);
    const diesel = { kind: 'train', modelId: 'eng_thunder', tx: 10, ty: 30, history: [] };
    expect(needsElectric(diesel, g.state)).toBe(false);
    expect(findPath(g.state.map, { x: 10, y: 30 }, [{ x: 20, y: 30 }], 'rail')).not.toBeNull();
  });

  test('is a checkbox in the Vehicles group and survives save/load', () => {
    const meta = SETTING_META.find((m) => m.key === 'disableElrails');
    expect(meta.group).toBe('vehicles');
    expect(meta.type).toBe('check');
    const g = Game.create({ seed: 1, width: 96, height: 96, townCount: 8, startYear: 1950, settings: { disableElrails: true } });
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'disableElrails')).toBe(true);
  });
});
