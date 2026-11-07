// OpenLoco audit r22 (RX4) findings 4, 5, 7, 8. Random 60-day world hash unchanged (see world-hash gate).
import { test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { updateMonthly, updateDaily, failObjective } from '../js/simulation/objective.js';
import { declareBankrupt } from '../js/simulation/loco/companyManager.js';
import { tickStation } from '../js/simulation/loco/station.js';

const small = { seed: 5, width: 64, height: 64, townCount: 3, industryCount: 4 };

// Finding 4 (OL Company.cpp:745-748): bankruptcy fails an active objective and posts the failure news.
test('finding 4: bankruptcy fails an active objective with news', () => {
  const g = Game.create({ ...small, objective: { type: 'companyValue', target: 1e9, timeLimitYears: 5 } });
  const got = [];
  g.on('objective', (e) => got.push(e.status));
  declareBankrupt(g, g.state.company);
  expect(g.state.objective.status).toBe('lost');
  expect(got).toEqual(['lost']);
  expect(g.state.news.some((n) => /Objective failed: the company went bankrupt/.test(n.text))).toBe(true);
});

test('finding 4: bankruptcy leaves an already won objective alone', () => {
  const g = Game.create({ ...small, objective: { type: 'companyValue', target: 1, timeLimitYears: 5 } });
  g.state.company.companyValue = 5;
  updateMonthly(g);
  expect(g.state.objective.status).toBe('won');
  declareBankrupt(g, g.state.company);
  expect(g.state.objective.status).toBe('won');
});

// Finding 5 (OL Company.cpp:152-170 daily evaluation): cargoDelivery wins on the day the target is reached.
test('finding 5: cargoDelivery is won on the day the target is reached', () => {
  const g = Game.create({ ...small, objective: { type: 'cargoDelivery', target: 10, cargoId: 'PASS', timeLimitYears: 5 } });
  g.state.company.cargoDelivered = { PASS: 10 };
  updateDaily(g);
  expect(g.state.objective.status).toBe('won');
});

test('finding 5: companyValue stays monthly', () => {
  const g = Game.create({ ...small, objective: { type: 'companyValue', target: 100, timeLimitYears: 5 } });
  g.state.company.companyValue = 1000;
  updateDaily(g);
  expect(g.state.objective.status).toBe('active');
  updateMonthly(g);
  expect(g.state.objective.status).toBe('won');
});

test('failObjective takes a reason in the news text', () => {
  const g = Game.create({ ...small, objective: { type: 'companyValue', target: 1e9, timeLimitYears: 5 } });
  failObjective(g, g.state.objective, 'test reason');
  expect(g.state.news.some((n) => /Objective failed: test reason/.test(n.text))).toBe(true);
});

// Finding 7 (OL Station.cpp:225-262): acceptance flips post news on player stations, category 'acceptance'.
test('finding 7: acceptance loss posts an acceptance-category news item for a player station', () => {
  const g = Game.create(small);
  const st = { id: 9999, name: 'Test St', x: 1, y: 1, tiles: [], cargo: {}, accepts: { PASS: true } };
  g.state.stations.push(st);
  const before = g.state.news.length;
  tickStation(g, st); // empty catchment: PASS is no longer accepted
  const added = g.state.news.slice(before).filter((n) => /no longer accepts/.test(n.text));
  expect(added.length).toBe(1);
  expect(added[0].cat).toBe('acceptance');
});

test('finding 7: rival stations post no acceptance news', () => {
  const g = Game.create(small);
  const st = { id: 9998, name: 'Rival St', x: 1, y: 1, tiles: [], cargo: {}, accepts: { PASS: true }, ownerId: 2 };
  g.state.stations.push(st);
  const before = g.state.news.length;
  tickStation(g, st);
  expect(g.state.news.slice(before).some((n) => /accepts/.test(n.text))).toBe(false);
});

// Finding 8 (OL VehicleHead.cpp:3145-3167): first delivery per cargo, per industry and per town, OL text.
test('finding 8: first delivery of each cargo celebrates once per town and per industry', async () => {
  const { noteFirstDelivery } = await import('../js/simulation/orders.js');
  const g = Game.create(small);
  const ctx = g.ctx;
  const st = { id: 9997, name: 'Celeb St', x: 2, y: 2, tiles: [], cargo: {}, accepts: {} };
  const ind = { id: 1, name: 'Mine', x: 2, y: 2, celebrated: undefined };
  const before = g.state.news.length;
  noteFirstDelivery(ctx, g.state, st, 'COAL', ind);
  noteFirstDelivery(ctx, g.state, st, 'COAL', ind);
  const texts = g.state.news.slice(before).map((n) => n.text);
  expect(texts.filter((t) => /Workers Celebrate! First Coal delivered to Mine!/.test(t)).length).toBe(1);
  expect(texts.filter((t) => /Citizens Celebrate! First Coal arrive in/.test(t)).length).toBe(1);
  // a different cargo celebrates again
  noteFirstDelivery(ctx, g.state, st, 'WOOD', ind);
  expect(g.state.news.slice(before).some((n) => /First Wood delivered to Mine/.test(n.text))).toBe(true);
});
