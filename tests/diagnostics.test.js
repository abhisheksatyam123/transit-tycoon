import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { runDiagnostics, summarizeIssues } from '../js/simulation/diagnostics.js';
import { getTile } from '../js/simulation/map.js';

describe('diagnostics', () => {
  test('a clean flat game with a coal line has no error issues', () => {
    const g = flatGame();
    coalLine(g);
    const issues = runDiagnostics(g);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  test('a half-linked road bit is reported as a network warn with x,y', () => {
    const g = flatGame();
    // lay an isolated road tile pointing east with no matching bit on the neighbour
    const t = getTile(g.state.map, 20, 20);
    t.road = 2;
    const issues = runDiagnostics(g);
    const hit = issues.find((i) => i.id === 'road-half-link:20,20');
    expect(hit).toBeDefined();
    expect(hit.severity).toBe('warn');
    expect(hit.category).toBe('network');
    expect(hit.x).toBe(20);
    expect(hit.y).toBe(20);
  });

  test('NaN company money produces an invariant error', () => {
    const g = flatGame();
    g.state.company.money = NaN;
    const issues = runDiagnostics(g);
    const err = issues.find((i) => i.severity === 'error' && i.category === 'invariant');
    expect(err).toBeDefined();
  });

  test('summarizeIssues counts by severity and category', () => {
    const issues = [
      { severity: 'error', category: 'invariant' },
      { severity: 'warn', category: 'network' },
      { severity: 'warn', category: 'network' },
      { severity: 'info', category: 'town' },
    ];
    expect(summarizeIssues(issues)).toEqual({
      error: 1, warn: 2, info: 1, byCategory: { invariant: 1, network: 2, town: 1 },
    });
    expect(summarizeIssues([])).toEqual({ error: 0, warn: 0, info: 0, byCategory: {} });
  });
});
