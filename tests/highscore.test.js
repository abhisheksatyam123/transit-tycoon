import { test, expect } from 'bun:test';
import {
  HIGHSCORE_MAX, insertHighScore, makeHighScoreEntry, parseHighScores, scenarioKey, recordGameEnd, compareEntries,
} from '../js/ui/highscore.js';

const e = (score, value = 0, savedAt = 0, name = 'C') => ({ name, score, value, date: { year: 1950, month: 0, day: 1 }, scenario: 'moscow', reason: 'won', savedAt });

test('table keeps top 10 sorted by score, then value, then earlier save', () => {
  let t = [];
  for (let i = 0; i < 12; i++) t = insertHighScore(t, e(i * 10, 0, i, 'c' + i)).table;
  expect(t.length).toBe(HIGHSCORE_MAX);
  expect(t[0].score).toBe(110);
  expect(t[9].score).toBe(20);
  const tie = insertHighScore([e(50, 1000, 1)], e(50, 2000, 2));
  expect(tie.table[0].value).toBe(2000);
  expect(tie.rank).toBe(1);
  expect(compareEntries(e(5, 0, 1), e(5, 0, 2))).toBeLessThan(0);
});

test('rank 0 when the entry falls off a full table', () => {
  let t = [];
  for (let i = 0; i < 10; i++) t = insertHighScore(t, e(100 + i)).table;
  const r = insertHighScore(t, e(1));
  expect(r.rank).toBe(0);
  expect(r.table.length).toBe(10);
});

test('entry from state; scenario key defaults to random', () => {
  const st = { company: { name: 'Acme', performanceIndex: 412.6, companyValue: 3000000 }, date: { year: 1961, month: 4, day: 1 }, scenario: 'moscow' };
  const en = makeHighScoreEntry(st, 'lost', 99);
  expect(en).toMatchObject({ name: 'Acme', score: 413, value: 3000000, scenario: 'moscow', reason: 'lost', savedAt: 99 });
  expect(scenarioKey({})).toBe('random');
});

test('parse: bad JSON, arrays and non-object entries are dropped', () => {
  expect(parseHighScores(null)).toEqual({});
  expect(parseHighScores('[1]')).toEqual({});
  expect(parseHighScores('{bad')).toEqual({});
  expect(parseHighScores('{"moscow":[{"score":1},7]}').moscow.length).toBe(1);
});

test('recordGameEnd records once per state and skips the editor', () => {
  const st = { company: { name: 'X', performanceIndex: 1, companyValue: 1 }, date: { year: 1950, month: 0, day: 1 }, scenario: 'zz-test' };
  expect(recordGameEnd({ ...st, editor: true }, 'won')).toBe(0);
  const first = recordGameEnd(st, 'won', 1);
  expect(first).toBeGreaterThanOrEqual(0);
  expect(recordGameEnd(st, 'won', 2)).toBe(0);
});
