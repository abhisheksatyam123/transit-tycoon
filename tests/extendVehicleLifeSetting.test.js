/** OpenTTD vehicle.extend_vehicle_life port. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting, setSetting } from '../js/simulation/settings.js';
import { effectiveMaxAge, isVehicleOld } from '../js/simulation/vehicles.js';
import { condOperand } from '../js/simulation/condOrders.js';
import { isAutoreplaceEligible } from '../js/simulation/autorenew.js';

function setup() {
  const g = flatGame(11);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('extendVehicleLife', () => {
  test('default is 0 and hash untouched (lazy settings)', () => {
    expect(DEFAULT_SETTINGS.extendVehicleLife).toBe(0);
    const g = flatGame(1);
    expect(getSetting(g.state, 'extendVehicleLife')).toBe(0);
    expect(g.state.settings).toBeUndefined();
  });
  test('effectiveMaxAge adds 10 years when set to 10', () => {
    const { g, v } = setup();
    const base = effectiveMaxAge(g.state, v);
    setSetting(g.state, 'extendVehicleLife', 10);
    expect(effectiveMaxAge(g.state, v)).toBe(base + 10 * 365);
    expect(effectiveMaxAge(g.state, { maxAge: 20 * 365 })).toBe(30 * 365);
    expect(effectiveMaxAge(g.state, {})).toBe(30 * 365);
  });
  test('remaining lifetime in condOrders increases', () => {
    const { g, v } = setup();
    v.maxAge = 25 * 365; v.age = 10 * 365;
    expect(condOperand(g.state, v, 'lifetime')).toBe(15);
    setSetting(g.state, 'extendVehicleLife', 10);
    expect(condOperand(g.state, v, 'lifetime')).toBe(25);
  });
  test('autorenew / isVehicleOld respects extended age', () => {
    const { g, v } = setup();
    v.maxAge = 25 * 365; v.age = 26 * 365;
    setSetting(g.state, 'autorenew', true);
    expect(isVehicleOld(g.state, v)).toBe(true);
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    setSetting(g.state, 'extendVehicleLife', 10);
    expect(isVehicleOld(g.state, v)).toBe(false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
  });
  test('save/load preserves extendVehicleLife', () => {
    const { g } = setup();
    setSetting(g.state, 'extendVehicleLife', 10);
    const g2 = Game.deserialize(g.serialize());
    expect(getSetting(g2.state, 'extendVehicleLife')).toBe(10);
  });
});
