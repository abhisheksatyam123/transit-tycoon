import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { autorenewVehicle, isAutoreplaceEligible } from '../js/simulation/autorenew.js';
import { isVehicleOld } from '../js/simulation/vehicles.js';

// A1: per-rule "replace when old" (OpenTTD autoreplace replace_when_old). Default (flag absent) = replace at any age.
function train() {
  const g = flatGame();
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('autoreplace replace-when-old (A1)', () => {
  test('default (no flag): rule replaces a young vehicle immediately', () => {
    const { g, v } = train();
    expect(g.state.company.autoreplaceWhenOld).toBeUndefined();
    expect(g.setAutoreplace('eng_puffer', 'eng_comet').ok).toBe(true);
    v.state = 'depot';
    expect(v.age).toBeLessThan(v.maxAge);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).toBeTruthy();
    expect(nv.modelId).toBe('eng_comet');
  });

  test('flag on: young vehicle is not replaced; once old it is', () => {
    const { g, v } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    expect(g.setAutoreplaceWhenOld('eng_puffer', true).ok).toBe(true);
    expect(g.state.company.autoreplaceWhenOld).toEqual({ eng_puffer: true });
    v.state = 'depot';
    v.age = 10;
    expect(isVehicleOld(g.state, v)).toBe(false);
    expect(isAutoreplaceEligible(g.state, v)).toBe(false);
    expect(autorenewVehicle(g.ctx, v)).toBe(null);
    expect(g.state.vehicles.includes(v)).toBe(true);
    v.age = v.maxAge + 1;
    expect(isVehicleOld(g.state, v)).toBe(true);
    expect(isAutoreplaceEligible(g.state, v)).toBe(true);
    const nv = autorenewVehicle(g.ctx, v);
    expect(nv).toBeTruthy();
    expect(nv.modelId).toBe('eng_comet');
  });

  test('flag off again removes the key and the empty map', () => {
    const { g } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    expect(g.setAutoreplaceWhenOld('eng_puffer', false).ok).toBe(true);
    expect(g.state.company.autoreplaceWhenOld).toBeUndefined();
  });

  test('clearing the rule also clears the flag', () => {
    const { g } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    g.setAutoreplace('eng_puffer', null);
    expect(g.state.company.autoreplaceWhenOld).toBeUndefined();
  });

  test('unknown model is rejected', () => {
    const { g } = train();
    expect(g.setAutoreplaceWhenOld('nope', true).ok).toBe(false);
    expect(g.state.company.autoreplaceWhenOld).toBeUndefined();
  });

  test('save round-trip keeps the flag', () => {
    const { g } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    g.setAutoreplaceWhenOld('eng_puffer', true);
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.autoreplaceWhenOld).toEqual({ eng_puffer: true });
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('default game save has no autoreplaceWhenOld key', () => {
    const { g } = train();
    g.setAutoreplace('eng_puffer', 'eng_comet');
    expect(g.serialize()).not.toContain('autoreplaceWhenOld');
    const g2 = Game.deserialize(g.serialize());
    expect(g2.state.company.autoreplaceWhenOld).toBeUndefined();
  });
});
