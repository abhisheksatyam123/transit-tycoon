import { describe, test, expect } from 'bun:test';
import { setIndustryProduction } from '../js/simulation/loco/industry.js';
import { setCheatFlag, cheatFlag } from '../js/simulation/cheats.js';
import { Game } from '../js/simulation/game.js';

function ctxWith(){ return { state: { industries: [{ id: 1, typeId: 'coal', dailyProductionTarget: [10,20], dailyProduction: [10,20] }] } }; }

describe('setIndustryProduction', () => {
  test('sets targets and immediate', () => {
    const ctx = ctxWith();
    const r = setIndustryProduction(ctx, 1, [30, 40]);
    expect(r).toEqual({ ok: true, cost: 0, targets: [30, 40] });
    expect(ctx.state.industries[0].dailyProductionTarget).toEqual([30,40]);
    expect(ctx.state.industries[0].dailyProduction).toEqual([30,40]);
  });
  test('clamps 0..255', () => {
    const ctx = ctxWith();
    const r = setIndustryProduction(ctx, 1, [-5, 999]);
    expect(r.targets).toEqual([0,255]);
    expect(ctx.state.industries[0].dailyProductionTarget).toEqual([0,255]);
  });
  test('dryRun does not mutate', () => {
    const ctx = ctxWith();
    const r = setIndustryProduction(ctx, 1, [99,99], { dryRun: true });
    expect(r).toEqual({ ok: true, cost: 0, targets: [99,99] });
    expect(ctx.state.industries[0].dailyProductionTarget).toEqual([10,20]);
  });
  test('unknown industry', () => {
    const r = setIndustryProduction(ctxWith(), 999, [1,2]);
    expect(r).toEqual({ ok: false, error: 'Unknown industry' });
  });
  test('immediate false only updates target', () => {
    const ctx = ctxWith();
    setIndustryProduction(ctx, 1, [55,66], { immediate: false });
    expect(ctx.state.industries[0].dailyProductionTarget).toEqual([55,66]);
    expect(ctx.state.industries[0].dailyProduction).toEqual([10,20]);
  });
  test('cheat flag toggle setupProd', () => {
    const state = { cheats: {}, cheated: false };
    expect(cheatFlag(state, 'setupProd')).toBe(false);
    setCheatFlag(state, 'setupProd', true);
    expect(cheatFlag(state, 'setupProd')).toBe(true);
    expect(state.cheated).toBe(true);
    setCheatFlag(state, 'setupProd', false);
    expect(cheatFlag(state, 'setupProd')).toBe(false);
  });
  test('save/load roundtrip preserves targets via JSON', () => {
    const ctx = ctxWith();
    setIndustryProduction(ctx, 1, [123,45]);
    const round = JSON.parse(JSON.stringify(ctx.state));
    expect(round.industries[0].dailyProductionTarget).toEqual([123,45]);
    expect(round.industries[0].dailyProduction).toEqual([123,45]);
  });
  test('game wrapper', () => {
    const g = new Game(1);
    expect(typeof g.setIndustryProduction).toBe('function');
  });
});
