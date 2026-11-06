/** One-way roads (T42): toggle cycle, refusals, pathfinder and link checks, save roundtrip, demolish/junction clearing. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { findPath } from '../js/simulation/pathfinder.js';
import { connected } from '../js/simulation/network.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

/** Straight road y=24 from x=20..30 with a bypass loop through y=28 (x=20 and x=30 are junctions). */
function loopGame() {
  const g = flatGame(7);
  expect(g.buildRoad(20, 24, 30, 24).ok).toBe(true);
  const bypass = [{ x: 20, y: 24 }, { x: 20, y: 25 }, { x: 20, y: 26 }, { x: 20, y: 27 }, { x: 20, y: 28 },
    { x: 21, y: 28 }, { x: 22, y: 28 }, { x: 23, y: 28 }, { x: 24, y: 28 }, { x: 25, y: 28 }, { x: 26, y: 28 },
    { x: 27, y: 28 }, { x: 28, y: 28 }, { x: 29, y: 28 }, { x: 30, y: 28 }, { x: 30, y: 27 }, { x: 30, y: 26 },
    { x: 30, y: 25 }, { x: 30, y: 24 }];
  expect(g.buildRoadPath(bypass).ok).toBe(true);
  return g;
}

describe('one-way toggle', () => {
  test('cycles two-way -> +axis -> -axis -> two-way and clears the field', () => {
    const g = loopGame();
    expect(tileAt(g, 25, 24).oneWay).toBeUndefined();
    expect(g.toggleOneWay(25, 24).state).toBe(1);
    expect(tileAt(g, 25, 24).oneWay).toBe(1);
    expect(g.toggleOneWay(25, 24).state).toBe(2);
    expect(g.toggleOneWay(25, 24).state).toBe(0);
    expect(tileAt(g, 25, 24).oneWay).toBeUndefined();
  });

  test('dry run changes nothing', () => {
    const g = loopGame();
    expect(g.toggleOneWay(25, 24, { dryRun: true }).ok).toBe(true);
    expect(tileAt(g, 25, 24).oneWay).toBeUndefined();
  });

  test('refusals: junction, no road, town road, out of bounds', () => {
    const g = loopGame();
    expect(g.toggleOneWay(30, 24).ok).toBe(false); // junction
    expect(g.toggleOneWay(40, 24).ok).toBe(false); // no road
    expect(g.toggleOneWay(-1, 24).ok).toBe(false);
    tileAt(g, 25, 24).owner = 'town';
    const r = g.toggleOneWay(25, 24);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Town/);
  });
});

describe('one-way routing', () => {
  test('pathfinder must take the bypass against a one-way segment', () => {
    const g = loopGame();
    const m = g.state.map;
    for (let x = 21; x <= 29; x++) expect(g.toggleOneWay(x, 24).ok).toBe(true); // +axis (east) for 21..29
    const east = findPath(m, { x: 20, y: 24 }, [{ x: 30, y: 24 }], 'road');
    expect(east.length).toBe(11); // straight east through the one-way run
    const west = findPath(m, { x: 30, y: 24 }, [{ x: 20, y: 24 }], 'road');
    expect(west.length).toBeGreaterThan(15); // must go around
    expect(west.some((t) => t.y === 28)).toBe(true);
  });

  test('link check: a one-way tile is entered only in its direction', () => {
    const g = loopGame();
    const m = g.state.map;
    g.toggleOneWay(25, 24); // +axis
    expect(connected(m, 'road', 24, 24, 25, 24)).toBe(true);
    expect(connected(m, 'road', 25, 24, 24, 24)).toBe(false);
    expect(connected(m, 'road', 25, 24, 26, 24)).toBe(true);
    expect(connected(m, 'road', 26, 24, 25, 24)).toBe(false);
    expect(connected(m, 'rail', 24, 24, 25, 24)).toBe(false); // no rail here; rail layer untouched by one-way
  });

  test('rail connectivity ignores one-way (rail layer unchanged)', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 30, 24).ok).toBe(true);
    tileAt(g, 25, 24).oneWay = 1;
    expect(connected(g.state.map, 'rail', 25, 24, 24, 24)).toBe(true);
  });
});

describe('one-way persistence and clearing', () => {
  test('save/load roundtrip keeps the flag', () => {
    const g = loopGame();
    g.toggleOneWay(25, 24); g.toggleOneWay(25, 24); // -axis
    const s2 = parseState(serializeState(g.state));
    expect(s2.map.tiles[24 * s2.map.width + 25].oneWay).toBe(2);
  });

  test('demolish clears the flag', () => {
    const g = loopGame();
    g.toggleOneWay(25, 24);
    expect(g.demolish(25, 24, 25, 24).ok).toBe(true);
    expect(tileAt(g, 25, 24).oneWay).toBeUndefined();
  });

  test('building a junction on a one-way tile clears the flag', () => {
    const g = loopGame();
    g.toggleOneWay(25, 24);
    expect(g.buildRoad(25, 22, 25, 24).ok).toBe(true); // branch north makes (25,24) a T junction
    expect(tileAt(g, 25, 24).oneWay).toBeUndefined();
  });

  test('two-way map without one-way tiles has no oneWay field anywhere', () => {
    const g = loopGame();
    for (const t of g.state.map.tiles) expect('oneWay' in t).toBe(false);
  });
});
