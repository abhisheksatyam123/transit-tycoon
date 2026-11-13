/** N8 scenario-editor / New Game fixes: editing is free, restored editor maps start paused, objective merge, editor cleanup. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { doTownAction } from '../js/simulation/townAuthority.js';
import { removeAllTowns, manyRandomTowns } from '../js/simulation/editorGen.js';
import { startSpeed } from '../js/ui/app.js';
import { newGameObjective } from '../js/ui/windows/newGame.js';

const editor = (extra = {}) => Game.create({ editor: true, seed: 11, width: 96, height: 96, startYear: 1960, emptyFlat: true, ...extra });

describe('scenario editor is free', () => {
  test('demolish in the editor leaves money and expenses unchanged', () => {
    const g = editor();
    expect(g.foundTown(30, 30).ok).toBe(true);
    expect(g.state.towns.length).toBe(1);
    const m0 = g.state.company.money;
    const e0 = g.state.company.ledger.current.expenses;
    const c0 = g.state.company.ledger.current.byType.construction || 0;
    const r = g.demolish(25, 25, 40, 40);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0); // a cost is quoted, but the editor does not charge it
    expect(g.state.company.money).toBe(m0);
    expect(g.state.company.ledger.current.expenses).toBe(e0);
    expect(g.state.company.ledger.current.byType.construction || 0).toBe(c0);
  });

  test('a normal game still charges for demolish', () => {
    const g = Game.create({ seed: 5, width: 40, height: 40, townCount: 1, industryCount: 0 });
    const m0 = g.state.company.money;
    const r = g.demolish(0, 0, 39, 39);
    expect(r.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(0);
    expect(g.state.company.money).toBe(m0 - r.cost);
  });

  test('town authority actions cost nothing in the editor but stay usable', () => {
    const g = editor();
    expect(g.foundTown(30, 30).ok).toBe(true);
    const town = g.state.towns[0];
    const m0 = g.state.company.money;
    const e0 = g.state.company.ledger.current.expenses;
    const r = doTownAction(g.ctx, town.id, 'advertise_small');
    expect(r.ok).toBe(true);
    expect(g.state.company.money).toBe(m0);
    expect(g.state.company.ledger.current.expenses).toBe(e0);
  });

  test('a restored editor map starts paused; normal games start at speed 1', () => {
    expect(startSpeed(editor())).toBe(0);
    expect(startSpeed(Game.create({ seed: 5, width: 40, height: 40, townCount: 1, industryCount: 0 }))).toBe(1);
    expect(startSpeed(null)).toBe(1);
  });
});

describe('New Game objective choice', () => {
  test('no target and default type: nothing is passed (default games unchanged)', () => {
    expect(newGameObjective('default', '', '10', undefined)).toBeUndefined();
    expect(newGameObjective('default', '', '10', { type: 'cargoDelivery', target: 5 })).toBeUndefined();
  });

  test('explicit none and explicit type keep their existing shape', () => {
    expect(newGameObjective('none', '', '10', undefined)).toEqual({ type: 'none' });
    expect(newGameObjective('vehicleProfit', '5000', '7', undefined))
      .toEqual({ type: 'vehicleProfit', target: 5000, timeLimitYears: 7 });
    expect(newGameObjective('vehicleProfit', '', '0', undefined))
      .toEqual({ type: 'vehicleProfit', target: undefined, timeLimitYears: 0 });
  });

  test('a typed target on a random world creates an explicit objective with the chosen years', () => {
    expect(newGameObjective('default', '30000', '12', undefined))
      .toEqual({ type: 'companyValue', target: 30000, timeLimitYears: 12 });
  });

  test('a typed target on a scenario refines its default objective and uses the chosen years', () => {
    const def = { type: 'performanceIndex', target: 900, timeLimitYears: 3 };
    expect(newGameObjective('default', '1200', '0', def))
      .toEqual({ type: 'performanceIndex', target: 1200, timeLimitYears: 0 });
  });

  test('a created objective keeps the chosen years in the game state', () => {
    const obj = newGameObjective('default', '30000', '12', undefined);
    const g = Game.create({ seed: 5, width: 40, height: 40, townCount: 1, industryCount: 0, objective: obj });
    expect(g.state.objective.type).toBe('companyValue');
    expect(g.state.objective.target).toBe(30000);
    expect(g.state.objective.timeLimitYears).toBe(12);
  });
});

describe('removing all editor towns mirrors deleteTown cleanup', () => {
  test('subsidies and traffic tied to removed towns are dropped', () => {
    const g = editor();
    expect(manyRandomTowns(g).ok).toBe(true);
    const ids = g.state.towns.map((t) => t.id);
    expect(ids.length).toBeGreaterThan(0);
    const a = ids[0];
    g.state.traffic = { cars: [{ townId: a }, { townId: -1 }], perTown: { [a]: 3, [-1]: 2 } };
    g.state.subsidies = {
      offers: [{ src: { type: 'town', id: a }, dst: { type: 'industry', id: 1 } }, { src: { type: 'industry', id: 1 }, dst: { type: 'industry', id: 2 } }],
      awarded: [{ src: { type: 'town', id: a }, dst: { type: 'town', id: a } }],
    };
    expect(removeAllTowns(g).ok).toBe(true);
    expect(g.state.towns.length).toBe(0);
    expect(g.state.traffic.cars.some((c) => c.townId === a)).toBe(false);
    expect(g.state.traffic.perTown[a]).toBeUndefined();
    expect(g.state.subsidies.offers.length).toBe(1);
    expect(g.state.subsidies.awarded.length).toBe(0);
  });
});
