import { test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { DEFAULT_SETTINGS, getSetting, setSetting, allSettings } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

test('defaults and no lazy state for default games', () => {
  const g = Game.create(small);
  expect(g.state.settings).toBeUndefined();
  expect(g.state.objective).toBeUndefined();
  for (const k of Object.keys(DEFAULT_SETTINGS)) expect(getSetting(g.state, k)).toBe(DEFAULT_SETTINGS[k]);
});

test('setSetting / allSettings', () => {
  const g = Game.create(small);
  setSetting(g.state, 'cargoPaymentPercent', 60);
  expect(getSetting(g.state, 'cargoPaymentPercent')).toBe(60);
  expect(allSettings(g.state).inflation).toBe(true);
});

test('opts.settings applied at creation', () => {
  const g = Game.create({ ...small, settings: { inflation: false, breakdowns: 'none', bogus: 1 } });
  expect(getSetting(g.state, 'inflation')).toBe(false);
  expect(getSetting(g.state, 'breakdowns')).toBe('none');
  expect(g.state.settings.bogus).toBeUndefined();
});

test('max loan option', () => {
  const g = Game.create({ ...small, maxLoan: 500000 });
  expect(g.state.company.maxLoan).toBe(500000);
});

test('save/load roundtrip keeps settings and objective', () => {
  const g = Game.create({ ...small, settings: { subsidies: false, cargoPaymentPercent: 70 }, objective: { type: 'vehicleProfit', target: 5000, timeLimitYears: 3 } });
  const g2 = Game.deserialize(serializeState(g.state));
  expect(getSetting(g2.state, 'subsidies')).toBe(false);
  expect(getSetting(g2.state, 'cargoPaymentPercent')).toBe(70);
  expect(g2.state.objective).toEqual(g.state.objective);
  expect(parseState(serializeState(g.state)).objective.type).toBe('vehicleProfit');
});
