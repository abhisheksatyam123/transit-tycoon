import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { catchmentTiles, STATION_SPREAD } from '../js/simulation/stations.js';
import { availableStyles, styleAvailable, tileRadius, STATION_STYLES } from '../js/config/stationTypes.js';

describe('station types and spread', () => {
  test('default style is available every year and keeps today radius and cost', () => {
    expect(styleAvailable('rail', 'standard', 1850)).toBe(true);
    expect(tileRadius({ kind: 'rail' })).toBe(4);
    expect(tileRadius({ kind: 'bus' })).toBe(3);
    const g = flatGame();
    const r = g.buildRailStation(10, 24, 'x', 3);
    expect(r.ok).toBe(true);
    expect(g.tile(10, 24).building.style).toBeUndefined();
    expect(g.state.stations[0].tiles[0].style).toBeUndefined();
  });

  test('styles are gated by era', () => {
    expect(styleAvailable('rail', 'wooden', 1950)).toBe(true);
    expect(styleAvailable('rail', 'wooden', 1900 - 1)).toBe(false);
    expect(styleAvailable('rail', 'wooden', 1961)).toBe(false);
    expect(styleAvailable('rail', 'modern', 1960)).toBe(false);
    expect(styleAvailable('rail', 'modern', 1990)).toBe(true);
    expect(availableStyles('rail', 1850).map((s) => s.id)).toEqual(['standard']);
  });

  test('building an out-of-era style is refused', () => {
    const g = flatGame();
    g.state.date.year = 1850;
    const r = g.buildRailStation(10, 24, 'x', 2, { style: 'modern' });
    expect(r.ok).toBe(false);
  });

  test('catchment bonus: modern rail style widens its tiles catchment by 1', () => {
    const g = flatGame();
    g.state.date.year = 1990;
    const r = g.buildRailStation(10, 24, 'x', 1, { style: 'modern' });
    expect(r.ok).toBe(true);
    const st = g.state.stations[0];
    expect(st.tiles[0].style).toBe('modern');
    expect(tileRadius(st.tiles[0])).toBe(5);
    const tiles = catchmentTiles(g.state, st);
    expect(tiles.some((p) => p.x === 10 + 5 && p.y === 24)).toBe(true);
    expect(tiles.some((p) => p.x === 10 + 6)).toBe(false);
  });

  test('style cost factor scales the construction cost', () => {
    const g = flatGame();
    g.state.date.year = 1990;
    const plain = g.buildRailStation(10, 24, 'x', 2, { dryRun: true });
    const modern = g.buildRailStation(10, 24, 'x', 2, { dryRun: true, style: 'modern' });
    expect(modern.cost).toBeGreaterThan(plain.cost);
  });

  test('multi-platform rail build: N platforms x length in one command', () => {
    const g = flatGame();
    const r = g.buildRailStation(10, 24, 'x', 3, { platforms: 2 });
    expect(r.ok).toBe(true);
    expect(g.state.stations.length).toBe(1);
    const st = g.state.stations[0];
    expect(st.tiles.length).toBe(6);
    for (const y of [24, 25]) for (let x = 10; x <= 12; x++) {
      expect(g.tile(x, y).building.kind).toBe('rail');
    }
    expect(g.tile(10, 24).rail).not.toBe(0);
  });

  test('spread: a player build that would exceed the limit is refused', () => {
    const g = flatGame();
    expect(g.buildRailStation(10, 24, 'x', 10).ok).toBe(true); // x 10..19
    // adjacent 3-tile extension x 20..22: bounding box 13 > STATION_SPREAD (12)
    const far = g.buildRailStation(20, 24, 'x', 3, { player: true });
    expect(far.ok).toBe(false);
    expect(far.error).toMatch(/spread/i);
    expect(g.state.stations.length).toBe(1);
    expect(g.tile(20, 24).building).toBeNull();
  });

  test('spread: scenario builds (no player flag) are not limited', () => {
    const g = flatGame();
    expect(g.buildRailStation(10, 24, 'x', 10).ok).toBe(true);
    expect(g.buildRailStation(20, 24, 'x', 3).ok).toBe(true);
  });

  test('spread: a build that fits the limit still merges', () => {
    const g = flatGame();
    const a = g.buildRailStation(10, 24, 'x', 2);
    const b = g.buildRailStation(12, 24, 'x', 2, { player: true });
    expect(b.ok).toBe(true);
    expect(b.stationId).toBe(a.stationId);
  });

  test('save/load keeps station style and catchment', () => {
    const g = flatGame();
    g.state.date.year = 1990;
    expect(g.buildRailStation(10, 24, 'x', 2, { style: 'modern', platforms: 2 }).ok).toBe(true);
    const back = parseState(serializeState(g.state));
    const st = back.stations[0];
    expect(st.tiles.filter((t) => t.style === 'modern').length).toBe(4);
    expect(tileRadius(st.tiles[0])).toBe(5);
    expect(back.map.tiles[24 * back.map.width + 10].building.style).toBe('modern');
  });

  test('catalogue sanity: each kind has a default first and ids are unique', () => {
    for (const kind of Object.keys(STATION_STYLES)) {
      const ids = STATION_STYLES[kind].map((s) => s.id);
      expect(ids[0]).toBe('standard');
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
