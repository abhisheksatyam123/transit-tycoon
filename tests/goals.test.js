import '../js/simulation/scenarios/moscowData.js'; // registers the Moscow data (Node: no dynamic import)
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { buildScenario } from '../js/simulation/scenarios/index.js';
import { miniMoscow } from './fixtures/miniMoscow.js';
import { GOALS, evaluateGoals, goalSnapshot, noteDelivery, rollGoalMonth, makeStats, ensureGoals } from '../js/simulation/goals.js';
import { parseState } from '../js/simulation/save.js';

const scenarioGame = () => {
  const g = Game.create({ seed: 3, width: 40, height: 40 });
  buildScenario('moscow', g, miniMoscow());
  return g;
};

describe('goals: random worlds and setup', () => {
  test('random worlds have no scenario goals; the tutorial list is created on request', () => {
    const g = Game.create({ seed: 5 });
    expect(g.state.goals).toBeUndefined();
    expect(g.state.rgoals).toBeUndefined();
    expect(g.goals().total).toBe(7);
    expect(g.state.goals).toBeUndefined();
    expect(g.goals().goals.length).toBe(7);
  });

  test('scenario games start at the first goal with the prebuilt fleet as baseline', () => {
    const g = scenarioGame();
    expect(g.state.goals.index).toBe(0);
    expect(g.state.goals.done).toEqual([]);
    expect(g.state.goals.base).toBe(g.state.nextId - 1);
    const snap = g.goals();
    expect(snap.total).toBe(GOALS.length);
    expect(snap.current.id).toBe('first_route');
    expect(snap.goals.filter((r) => r.active).length).toBe(1);
  });

  test('Moscow starts with the reduced cash pile', async () => {
    const { MOSCOW_MONEY } = await import('../js/simulation/scenarios/moscow.js');
    expect(MOSCOW_MONEY).toBe(4_000_000);
    const m = scenarioGame().state.company.money;
    expect(m).toBeLessThanOrEqual(MOSCOW_MONEY); // construction of the fixture spends some
    expect(m).toBeGreaterThan(MOSCOW_MONEY * 0.8);
  });
});

describe('goals: evaluation and rewards', () => {
  test('a goal pays its reward once, posts good news and emits goal', () => {
    const g = scenarioGame();
    const s = g.state;
    const seen = [];
    g.on('goal', (e) => seen.push(e));
    const m0 = s.company.money;
    // complete first_route: a player vehicle with 2 orders
    s.vehicles.push({ id: s.nextId + 100, orders: [{ stationId: 1 }, { stationId: 1 }], value: 0 });
    const n = evaluateGoals({ state: s, emit: (ev, p) => g.events.emit(ev, p) });
    expect(n).toBeGreaterThanOrEqual(1);
    expect(s.goals.done).toContain('first_route');
    expect(s.company.money).toBeGreaterThanOrEqual(m0 + GOALS[0].reward);
    expect(s.news.some((x) => x.kind === 'good' && /Goal complete: First route/.test(x.text))).toBe(true);
    expect(seen.map((e) => e.id)).toContain('first_route');
    // idempotent: a second check pays nothing more for the same goal
    const m1 = s.company.money;
    evaluateGoals({ state: s, emit: () => {} });
    expect(s.company.money).toBe(m1);
    expect(s.goals.done.filter((d) => d === 'first_route').length).toBe(1);
  });

  test('goals unlock one after another and stop at the first unmet goal', () => {
    const g = scenarioGame();
    const s = g.state;
    s.company.money = 0;
    s.company.ledger.history = [];
    evaluateGoals({ state: s, emit: () => {} });
    expect(s.goals.index).toBe(0); // no routes yet
    expect(goalSnapshot(s).current.id).toBe('first_route');
  });

  test('busy-month goal tracks cargo delivered this month and resets at month end', () => {
    const s = scenarioGame().state;
    noteDelivery(s, 'PAS', 1500);
    noteDelivery(s, 'PAS', 400);
    noteDelivery(s, 'COAL', 9999); // only passengers count
    expect(s.goals.month.PAS).toBe(1900);
    expect(goalSnapshot(s).goals.find((r) => r.id === 'pax_month').v).toBe(0); // not yet unlocked
    rollGoalMonth(s);
    expect(s.goals.month).toEqual({});
  });

  test('profit goal reads the last closed month, not the running one', () => {
    const s = scenarioGame().state;
    s.goals.index = GOALS.findIndex((x) => x.id === 'profit_month');
    s.goals.done = GOALS.slice(0, s.goals.index).map((x) => x.id);
    s.company.ledger.current.income = 1e9; // running month must not count
    s.company.ledger.history = [{ year: 1950, month: 0, income: 50000, expenses: 1000, byType: {} }];
    expect(evaluateGoals({ state: s, emit: () => {} })).toBe(0);
    s.company.ledger.history.push({ year: 1950, month: 1, income: 90000, expenses: 20000, byType: {} });
    expect(evaluateGoals({ state: s, emit: () => {} })).toBe(1);
    expect(s.goals.done).toContain('profit_month');
  });

  test('Kremlin to VDNKh needs a player route serving both ends; prebuilt routes do not count', () => {
    const s = scenarioGame().state;
    const meta = s.scenarioMeta;
    const kr = meta.landmarks.find((l) => l.id === 'kremlin');
    const vd = meta.landmarks.find((l) => l.id === 'vdnkh');
    if (!kr || !vd) return; // fixture without both landmarks
    expect(makeStats(s).kremlinVdnkh).toBe(false);
    expect(s.vehicles.every((v) => v.id <= s.goals.base)).toBe(true);
  });

  test('ensureGoals adds goals to old scenario saves and leaves random saves alone', () => {
    const s = scenarioGame().state;
    delete s.goals;
    expect(ensureGoals(s)).toBeTruthy();
    expect(s.goals.index).toBe(0);
    const r = { scenario: undefined, news: [], nextId: 5 };
    expect(ensureGoals(r)).toBeNull();
  });
});

describe('goals: persistence', () => {
  test('goal state survives a save/load round trip', () => {
    const g = scenarioGame();
    g.state.goals.done.push('first_route');
    g.state.goals.index = 1;
    g.state.goals.month.PAS = 123;
    const back = Game.deserialize(g.serialize());
    expect(back.state.goals.done).toEqual(['first_route']);
    expect(back.state.goals.index).toBe(1);
    expect(back.state.goals.month.PAS).toBe(123);
    expect(back.serialize()).toBe(g.serialize());
  });

  test('parseState fills missing goals for legacy scenario saves', () => {
    const g = scenarioGame();
    const obj = JSON.parse(g.serialize());
    delete obj.goals;
    const st = parseState(JSON.stringify(obj));
    expect(st.goals.index).toBe(0);
  });
});

describe('goals: integration', () => {
  test('the game steps for a month in a scenario world without goal errors', () => {
    const g = scenarioGame();
    for (let i = 0; i < 40 * 30; i++) g.step();
    expect(Array.isArray(g.goals().goals)).toBe(true);
  });
});
