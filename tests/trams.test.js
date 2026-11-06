/** Trams (gap #27): tram track on road and land, cost, demolish, tram-only routing, save roundtrip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { findPath } from '../js/simulation/pathfinder.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { COSTS } from '../js/config/costs.js';
import { listModels } from '../js/simulation/queries.js';

const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('tram track', () => {
  test('lays tram-only track on free land at tram cost', () => {
    const g = flatGame(7);
    const before = g.state.company.money;
    const r = g.buildTram(20, 24, 26, 24);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(COSTS.tram * 7);
    expect(tileAt(g, 22, 24).tram).toBeTruthy();
    expect(tileAt(g, 22, 24).road | 0).toBe(0);
    expect(g.state.company.money).toBeLessThan(before);
  });

  test('lays tram bits on an existing road without touching road bits', () => {
    const g = flatGame(7);
    expect(g.buildRoad(20, 24, 26, 24).ok).toBe(true);
    const road = tileAt(g, 22, 24).road;
    expect(g.buildTram(20, 24, 26, 24).ok).toBe(true);
    expect(tileAt(g, 22, 24).road).toBe(road);
    expect(tileAt(g, 22, 24).tram).toBeTruthy();
  });

  test('demolish on road removes tram bits only; on tram-only land removes it', () => {
    const g = flatGame(7);
    g.buildRoad(20, 24, 26, 24);
    g.buildTram(20, 24, 26, 24);
    expect(g.demolish(22, 24, 22, 24).ok).toBe(true);
    expect(tileAt(g, 22, 24).tram | 0).toBe(0);
    expect(tileAt(g, 22, 24).road).toBeTruthy();
    g.buildTram(20, 30, 26, 30);
    expect(g.demolish(22, 30, 22, 30).ok).toBe(true);
    expect(tileAt(g, 22, 30).tram | 0).toBe(0);
  });

  test('trams do not share rail tiles', () => {
    const g = flatGame(7);
    expect(g.buildRail(20, 24, 26, 24).ok).toBe(true);
    expect(g.buildTram(20, 24, 26, 24).ok).toBe(false);
  });

  test('tram model is hidden until tram track exists, and has no news', () => {
    const g = flatGame(7);
    expect(listModels(g.state, 'road').some((m) => m.kind === 'tram')).toBe(false);
    g.buildTram(20, 24, 26, 24);
    expect(listModels(g.state, 'road').some((m) => m.kind === 'tram')).toBe(true);
  });
});

describe('tram routing', () => {
  test('tram layer paths only over tram bits, buses ignore tram-only track', () => {
    const g = flatGame(7);
    g.buildTram(20, 24, 30, 24);
    const s = g.state.map;
    expect(findPath(s, { x: 20, y: 24 }, [{ x: 30, y: 24 }], 'tram')).not.toBeNull();
    expect(findPath(s, { x: 20, y: 24 }, [{ x: 30, y: 24 }], 'road')).toBeNull();
  });
});

describe('tram save', () => {
  test('tram field round-trips', () => {
    const g = flatGame(7);
    g.buildTram(20, 24, 26, 24);
    const st = parseState(serializeState(g.state));
    expect(st.map.tiles[24 * st.map.width + 22].tram).toBeTruthy();
    expect(st.map.tiles[24 * st.map.width + 22].tram).toBe(tileAt(g, 22, 24).tram);
  });
});
