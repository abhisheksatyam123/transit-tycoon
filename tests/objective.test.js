import { test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { updateMonthly, updateDaily, createObjective } from '../js/simulation/objective.js';

const small = { seed: 5, width: 64, height: 64, townCount: 3, industryCount: 4 };

test('no objective for default random game', () => {
  const g = Game.create(small);
  expect(g.state.objective).toBeUndefined();
  updateMonthly(g);
  expect(g.state.objective).toBeUndefined();
});

test('createObjective validates type', () => {
  const g = Game.create(small);
  expect(() => createObjective(g.state, { type: 'x' })).toThrow();
});

test('progress and win', () => {
  const g = Game.create({ ...small, objective: { type: 'companyValue', target: 1000000, timeLimitYears: 5 } });
  const got = [];
  g.on('objective', (e) => got.push(e.status));
  g.state.company.companyValue = 400000;
  updateMonthly(g);
  expect(g.state.objective.progress).toBe(400000);
  expect(g.state.objective.status).toBe('active');
  g.state.company.companyValue = 1200000;
  updateMonthly(g);
  expect(g.state.objective.status).toBe('won');
  expect(got).toEqual(['won']);
  updateMonthly(g); // no repeat
  expect(got.length).toBe(1);
});

test('lose by time limit (OpenLoco calendar rule: fails once the year is past start + limit - 1, checked daily)', () => {
  const g = Game.create({ ...small, objective: { type: 'performanceIndex', target: 900, timeLimitYears: 2 } });
  const start = g.state.objective.startYear;
  g.state.date.day = 2; // the 1st of a month is never a failing day (OpenLoco currentDayOfMonth != 0)
  g.state.date.year = start + 1;
  updateDaily(g);
  expect(g.state.objective.status).toBe('active');
  g.state.date.year = start + 2;
  updateDaily(g);
  expect(g.state.objective.status).toBe('lost');
});

test('time limit is not enforced on the 1st of a month', () => {
  const g = Game.create({ ...small, objective: { type: 'performanceIndex', target: 900, timeLimitYears: 2 } });
  g.state.date.year = g.state.objective.startYear + 2;
  g.state.date.day = 1;
  updateDaily(g);
  expect(g.state.objective.status).toBe('active');
  g.state.date.day = 2;
  updateDaily(g);
  expect(g.state.objective.status).toBe('lost');
});

test('cargo delivery counts one cargo or all', () => {
  const g = Game.create({ ...small, objective: { type: 'cargoDelivery', target: 100 } });
  g.state.company.cargoDelivered = { coal: 30, mail: 20 };
  updateMonthly(g);
  expect(g.state.objective.progress).toBe(50);
});
