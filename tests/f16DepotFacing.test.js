/** F16: an auto-facing road depot prefers the through route over a 1-tile dead-end stub on the other side. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { autoDepotDir } from '../js/ui/tools/depot.js';
import { catchmentWarning } from '../js/ui/tools/placement.js';

describe('F16 road depot auto-facing', () => {
  test('depot between a straight road (west) and a 1-tile stray stub (east) faces the straight road', () => {
    const g = flatGame(7);
    // straight north-south road along x=25; depot tile (26,21) sits east of its middle
    expect(g.buildRoad(25, 18, 25, 24).ok).toBe(true);
    // 1-tile dead-end stub at (27,21): its only road bit points east, away from the depot
    const stub = g.state.map.tiles[21 * g.state.map.width + 27];
    stub.road = 2;
    // old DIRS order (N, E, S, W) would pick the stub (E) first; the through road (W) must win
    expect(autoDepotDir(g, 26, 21, 'road')).toBe(8);
    expect(g.buildDepot(26, 21, 'road', 8).ok).toBe(true);
  });

  test('straight road only: auto-facing unchanged', () => {
    const g = flatGame(7);
    expect(g.buildRoad(20, 24, 30, 24).ok).toBe(true);
    expect(autoDepotDir(g, 25, 25, 'road')).toBe(1);
  });
});

describe('F16 catchment warning', () => {
  test('a stop with no industry or house in reach warns that it covers nothing', () => {
    const g = flatGame(7);
    const m = g.state.map;
    // clear every building around the probe tile so only the empty-catchment branch can apply
    for (let y = 50; y <= 70; y++) for (let x = 30; x <= 50; x++) m.tiles[y * m.width + x].building = null;
    g.state.industries = g.state.industries.filter((i) => i.x < 30 || i.x > 50 || i.y < 50 || i.y > 70);
    expect(catchmentWarning(g.state, [{ x: 40, y: 60 }], 3))
      .toBe('Station catchment covers no industry - it will not supply or accept cargo');
  });
});
