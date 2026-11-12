// F4: catchmentTiles() is memoised per station. The cache must never change the result,
// must never reach a save file, and must not recompute when nothing changed.
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { catchRadius, catchmentTiles } from '../js/simulation/stations.js';
import { setSetting } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';

/** The original (uncached) catchment loop, kept here as the oracle. */
function uncachedTiles(state, st) {
  const { map } = state;
  if (!st || st.tiles.length === 0) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of st.tiles) {
    const r = catchRadius(state, t);
    x0 = Math.min(x0, t.x - r); y0 = Math.min(y0, t.y - r);
    x1 = Math.max(x1, t.x + r); y1 = Math.max(y1, t.y + r);
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(map.width - 1, x1); y1 = Math.min(map.height - 1, y1);
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      for (const t of st.tiles) {
        const r = catchRadius(state, t);
        if (Math.abs(t.x - x) <= r && Math.abs(t.y - y) <= r) { out.push({ x, y }); break; }
      }
    }
  }
  return out;
}

/** Same tiles, same order, as the uncached loop. */
function expectSame(state) {
  for (const st of state.stations) {
    const got = catchmentTiles(state, st);
    const want = uncachedTiles(state, st);
    expect(got.length).toBe(want.length);
    for (let i = 0; i < want.length; i++) {
      expect(got[i].x).toBe(want[i].x);
      expect(got[i].y).toBe(want[i].y);
    }
  }
}

describe('catchmentTiles cache', () => {
  test('matches the uncached loop after build / add tile / remove tile / radius / setting changes', () => {
    const g = flatGame();
    const s = g.state;
    expect(g.buildRailStation(10, 24, 'x', 3).ok).toBe(true);
    const bus = g.buildRoadStop(10, 30, 'bus');
    expect(bus.ok).toBe(true);
    expectSame(s);

    // tile added to an existing station (merge)
    expect(g.buildRailStation(13, 24, 'x', 1).ok).toBe(true);
    expectSame(s);

    // tile removed through the real demolish path
    expect(g.demolish(13, 24, 13, 24).ok).toBe(true);
    expectSame(s);

    // explicit per-tile radius overrides the kind radius
    const rail = s.stations.find((st) => st.kinds.rail);
    rail.tiles[0].radius = 2;
    expectSame(s);
    rail.tiles[0].radius = 7;
    expectSame(s);
    delete rail.tiles[0].radius;
    expectSame(s);

    // a style change changes the resolved radius of the tile
    rail.tiles[1].style = 'modern';
    expectSame(s);
    delete rail.tiles[1].style;
    expectSame(s);

    // global setting toggle (both ways, then back to the default by deleting the key)
    setSetting(s, 'modifiedCatchment', false);
    expectSame(s);
    setSetting(s, 'modifiedCatchment', true);
    expectSame(s);
    delete s.settings.modifiedCatchment;
    expectSame(s);
  });

  test('airport radius follows the airport type on the station tile', () => {
    const g = flatGame();
    const s = g.state;
    expect(g.buildAirport(50, 20).ok).toBe(true);
    expectSame(s);
    const st = s.stations[s.stations.length - 1];
    const air = st.tiles.find((t) => t.kind === 'airport');
    // a heavier airport type changes the radius of a tile that is already in the station
    s.map.tiles[air.y * s.map.width + air.x].building.airportType = 'international';
    expectSame(s);
    s.map.tiles[air.y * s.map.width + air.x].building.airportType = 'heliport';
    expectSame(s);
  });

  test('whole station removal / addition keeps behaviour identical', () => {
    const g = flatGame();
    const s = g.state;
    expect(g.buildRailStation(10, 24, 'x', 2).ok).toBe(true);
    expect(g.buildRailStation(20, 24, 'x', 2).ok).toBe(true);
    expectSame(s);
    const keep = s.stations[0];
    const dropped = s.stations.slice(1);
    s.stations = s.stations.filter((st) => st === keep);
    expectSame(s);
    s.stations.push(...dropped);
    expectSame(s);
  });

  test('the cache is not written to a saved station record and survives a round trip', () => {
    const g = flatGame();
    const s = g.state;
    expect(g.buildRailStation(10, 24, 'x', 3).ok).toBe(true);
    expect(g.buildRoadStop(10, 30, 'bus').ok).toBe(true);
    catchmentTiles(s, s.stations[0]); // populate the cache
    for (const st of s.stations) {
      for (const key of Object.keys(st)) expect(key.startsWith('_catch')).toBe(false);
    }
    const json = serializeState(s);
    expect(json.includes('_catch')).toBe(false);
    expect(json.includes('catchTiles')).toBe(false);
    // reload: a fresh station record computes the same tiles (and has no stale cache)
    const s2 = parseState(json);
    expectSame(s2);
    for (const st of s2.stations) expect(Object.keys(st).some((k) => k.startsWith('_catch'))).toBe(false);
  });

  test('a second call returns the same array without recomputing', () => {
    const g = flatGame();
    const s = g.state;
    expect(g.buildRailStation(10, 24, 'x', 3).ok).toBe(true);
    const st = s.stations[0];
    const a = catchmentTiles(s, st);
    const b = catchmentTiles(s, st);
    expect(b).toBe(a); // identity: the memoised array is handed back, nothing was rebuilt
    // and it is still the right array
    const want = uncachedTiles(s, st);
    expect(a.length).toBe(want.length);
    for (let i = 0; i < want.length; i++) {
      expect(a[i].x).toBe(want[i].x);
      expect(a[i].y).toBe(want[i].y);
    }
    // a real change makes a new array
    expect(g.buildRailStation(13, 24, 'x', 1).ok).toBe(true);
    const c = catchmentTiles(s, st);
    expect(c).not.toBe(a);
  });
});
