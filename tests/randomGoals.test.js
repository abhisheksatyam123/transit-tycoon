import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { RANDOM_GOALS, evaluateRandomGoals, randomGoalSnapshot, freightTotal } from '../js/simulation/randomGoals.js';

const fresh = () => Game.create({ seed: 7 });
const station = (id) => ({ id, x: 1, y: 1, kind: 'bus' });
const veh = (id, orders, profit = 0) => ({ id, orders: Array(orders).fill({ stationId: 1 }), profit: [profit], value: 0 });
const snap = (g) => randomGoalSnapshot(g.ctx);

describe('random-world goals', () => {
  test('the list is created lazily: state has no rgoals until the UI asks', () => {
    const g = fresh();
    expect(g.state.rgoals).toBeUndefined();
    expect(snap(g).total).toBe(RANDOM_GOALS.length);
    expect(g.state.rgoals.index).toBe(0);
  });

  test('stages complete in order from state, one check can finish several', () => {
    const g = fresh();
    snap(g);
    const s = g.state;
    const completed = [];
    g.ctx.emit = (ev, p) => { if (ev === 'goal') completed.push(p.id); };
    s.stations.push(station(1));
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).toEqual(['station']);
    s.vehicles.push(veh(10, 1));
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).toEqual(['station']); // a single order does not count
    s.vehicles.push(veh(11, 2));
    s.company.cargoUnitsTotalDelivered = 5;
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).toEqual(['station', 'route', 'income']);
    // a 200 t freight total is needed; passengers do not count
    s.company.cargoDelivered = { PASS: 100, COAL: 150 };
    evaluateRandomGoals(g.ctx);
    expect(freightTotal(s)).toBe(150);
    expect(s.rgoals.index).toBe(3);
    s.company.cargoDelivered.GOODS = 60;
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).toContain('freight200');
    expect(s.rgoals.index).toBe(4);
    expect(completed).toEqual(['station', 'route', 'income', 'freight200']);
    // passengers are a later stage and do not finish freight early
    s.company.cargoDelivered.PASS = 499;
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.index).toBe(4);
  });

  test('pax, profit and value stages complete from state', () => {
    const g = fresh();
    snap(g);
    const s = g.state;
    s.company.cargoDelivered = { COAL: 200, PASS: 500 };
    s.company.cargoUnitsTotalDelivered = 500;
    s.stations.push(station(1));
    s.vehicles.push(veh(1, 2, 1000), veh(2, 2, 1000), veh(3, 2, 1000), veh(4, 2, 1000), veh(5, 2, 1000));
    s.company.money = 300000; s.company.loan = 0;
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).toEqual(RANDOM_GOALS.map((x) => x.id));
    const row = snap(g);
    expect(row.completed).toBe(RANDOM_GOALS.length);
    expect(row.goals.every((r) => r.done)).toBe(true);
  });

  test('profit stage needs 5 vehicles with positive recent profit', () => {
    const g = fresh();
    snap(g);
    const s = g.state;
    s.stations.push(station(1));
    s.company.cargoUnitsTotalDelivered = 1;
    s.vehicles.push(veh(1, 2, 10), veh(2, 2, 10), veh(3, 2, 10), veh(4, 2, 10), veh(5, 2, -5));
    s.company.cargoDelivered = { COAL: 200, PASS: 500 };
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).not.toContain('profit5');
    s.vehicles.push(veh(6, 2, 1));
    evaluateRandomGoals(g.ctx);
    expect(s.rgoals.done).toContain('profit5');
  });

  test('rival companies do not count toward tutorial stages', () => {
    const g = fresh();
    snap(g);
    const s = g.state;
    const prog = (id) => RANDOM_GOALS.find((x) => x.id === id).progress(s);
    const before = { station: prog('station').v, route: prog('route').v, profit: prog('profit5').v, value: prog('value250k').v };
    s.stations.push({ ...station(1), ownerId: 7 });
    for (let i = 0; i < 5; i++) s.vehicles.push({ ...veh(100 + i, 2, 1000), ownerId: 7 });
    expect(prog('station').v).toBe(before.station);
    expect(prog('route').v).toBe(before.route);
    expect(prog('profit5').v).toBe(before.profit);
    expect(prog('value250k').v).toBe(before.value);
    // the same entities owned by the player do count
    s.stations.push(station(2));
    s.vehicles.push(veh(200, 2, 1000));
    expect(prog('station').v).toBe(1);
    expect(prog('route').v).toBe(1);
    expect(prog('profit5').v).toBe(1);
  });

  test('progress shows partial counts for the window', () => {
    const g = fresh();
    snap(g);
    g.state.company.cargoDelivered = { COAL: 120 };
    const r = snap(g);
    const freight = r.goals.find((x) => x.id === 'freight200');
    expect(freight.active).toBe(false); // earlier stages still open
    expect(freight.v).toBe(120);
    expect(freight.t).toBe(200);
  });

  test('save round-trip keeps progress and does not repeat completions', () => {
    const g = fresh();
    snap(g);
    g.state.stations.push(station(1));
    evaluateRandomGoals(g.ctx);
    const json = serializeState(g.state);
    const g2 = new Game(parseState(json));
    expect(g2.state.rgoals.done).toEqual(['station']);
    const before = g2.state.news.length;
    evaluateRandomGoals(g2.ctx);
    expect(g2.state.rgoals.done).toEqual(['station']);
    expect(g2.state.news.length).toBe(before);
    expect(snap(g2).completed).toBe(1);
  });

  test('old random saves without rgoals load and get the list on demand', () => {
    const g = fresh();
    const old = parseState(serializeState(g.state));
    delete old.rgoals;
    const g2 = new Game(old);
    expect(g2.state.rgoals).toBeUndefined();
    expect(snap(g2).total).toBe(RANDOM_GOALS.length);
  });

  test('a completion posts a news item', () => {
    const g = fresh();
    snap(g);
    g.state.stations.push(station(1));
    evaluateRandomGoals(g.ctx);
    expect(g.state.news.some((n) => /Goal complete: Build your first station/.test(n.text))).toBe(true);
  });
});
