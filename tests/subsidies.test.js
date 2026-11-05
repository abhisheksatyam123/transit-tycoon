import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { updateMonthly, subsidyMultiplier, MAX_OFFERS } from '../js/simulation/subsidies.js';
import { setSetting } from '../js/simulation/settings.js';

function world(seed = 42) {
  const g = flatGame(seed);
  const mine = placeIndustry(g.state, 'coal_mine', 10, 20);
  const power = placeIndustry(g.state, 'power_station', 40, 20);
  return { g, mine, power };
}
function months(g, n) {
  for (let i = 0; i < n; i++) { g.state.date.month = (g.state.date.month + 1) % 12; if (g.state.date.month === 0) g.state.date.year++; updateMonthly(g); }
}

describe('subsidies', () => {
  test('lazy state, deterministic, capped offers', () => {
    const a = world(), b = world();
    expect(a.g.state.subsidies).toBeUndefined();
    months(a.g, 40); months(b.g, 40);
    expect(a.g.state.subsidies).toBeDefined();
    expect(JSON.stringify(a.g.state.subsidies)).toBe(JSON.stringify(b.g.state.subsidies));
    expect(a.g.state.subsidies.offers.length).toBeLessThanOrEqual(MAX_OFFERS);
  });

  test('does not consume game rng', () => {
    const { g } = world();
    const r = g.state.rngState;
    months(g, 24);
    expect(g.state.rngState).toBe(r);
  });

  test('setting off creates none', () => {
    const { g } = world();
    setSetting(g.state, 'subsidies', false);
    months(g, 60);
    expect(g.state.subsidies).toBeUndefined();
  });

  test('offers expire', () => {
    const { g } = world();
    g.state.subsidies = { nextId: 2, offers: [{ id: 1, cargoId: 'COAL', src: { type: 'industry', id: 1 }, dst: { type: 'industry', id: 2 }, expiresMonths: 2 }], awarded: [] };
    setSetting(g.state, 'subsidies', false);
    months(g, 2);
    expect(g.state.subsidies.offers.length).toBe(0);
  });

  test('award on matching delivery, multiplies, then expires', () => {
    const { g, mine, power } = world();
    g.state.subsidies = { nextId: 2, offers: [{ id: 1, cargoId: 'COAL', src: { type: 'industry', id: mine.id }, dst: { type: 'industry', id: power.id }, expiresMonths: 12 }], awarded: [] };
    const toSt = { x: 40, y: 24 };
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, { x: 5, y: 60 }, g.ctx)).toBe(1); // wrong destination
    expect(subsidyMultiplier(g.state, 'GRAI', 10, 24, toSt, g.ctx)).toBe(1); // wrong cargo
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx)).toBe(2);
    expect(g.state.subsidies.offers.length).toBe(0);
    expect(g.state.subsidies.awarded.length).toBe(1);
    expect(subsidyMultiplier(g.state, 'COAL', 11, 23, toSt, g.ctx)).toBe(2);
    setSetting(g.state, 'subsidies', false);
    months(g, 12);
    expect(g.state.subsidies.awarded.length).toBe(0);
    expect(subsidyMultiplier(g.state, 'COAL', 10, 24, toSt, g.ctx)).toBe(1);
  });

  test('no subsidies: random world has no state', () => {
    expect(Game.create({ seed: 5 }).state.subsidies).toBeUndefined();
  });
});
