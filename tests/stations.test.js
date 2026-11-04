import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { industryTiles } from '../js/simulation/industries.js';

describe('stations and depots', () => {
  test('two adjacent station builds merge into one station', () => {
    const g = flatGame();
    const a = g.buildRailStation(10, 24, 'x', 1);
    const b = g.buildRailStation(11, 24, 'x', 1);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.stationId).toBe(a.stationId);
    expect(g.state.stations.length).toBe(1);
  });

  test('station tiles reference the station building', () => {
    const g = flatGame();
    const r = g.buildRailStation(10, 24, 'x', 3);
    expect(r.ok).toBe(true);
    for (let x = 10; x <= 12; x++) {
      const b = g.tile(x, 24).building;
      expect(b.type).toBe('station');
      expect(b.kind).toBe('rail');
    }
  });

  test('catchment of a station contains the adjacent industry tiles', () => {
    const g = flatGame();
    const mine = placeIndustry(g.state, 'coal_mine', 10, 20);
    const st = g.buildRailStation(10, 24, 'x', 3);
    expect(st.ok).toBe(true);
    const catch_ = new Set(g.catchmentTiles(st.stationId).map((t) => `${t.x},${t.y}`));
    const tiles = industryTiles(mine);
    expect(tiles.length).toBeGreaterThan(0);
    const inside = tiles.filter((t) => catch_.has(`${t.x},${t.y}`));
    expect(inside.length).toBeGreaterThan(0);
  });

  test('depot sets its direction bit on the track tile', () => {
    const g = flatGame();
    const r = g.buildDepot(20, 25, 'rail', 1);
    expect(r.ok).toBe(true);
    const t = g.tile(20, 25);
    expect(t.building.type).toBe('depot');
    expect(t.building.kind).toBe('rail');
    expect(t.rail & 1).toBe(1); // N bit
  });

  test('coalLine builds two stations and a depot', () => {
    const g = flatGame();
    const L = coalLine(g);
    expect(g.state.stations.length).toBe(2);
    expect(g.state.depots.length).toBe(1);
    expect(L.a.id).not.toBe(L.b.id);
    expect(g.stationsNear(10, 24, 3).length).toBeGreaterThan(0);
  });

  test('station on water is rejected', () => {
    const g = flatGame();
    g.tile(10, 24).terrain = 'water';
    expect(g.buildRailStation(10, 24, 'x', 1).ok).toBe(false);
  });
});
