import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { joinChoices, adjacentOwn } from '../js/ui/tools/joinPicker.js';

describe('distant join (Ctrl+click station picker)', () => {
  test('joins a non-adjacent station of ours within spread', () => {
    const g = flatGame();
    const a = g.buildRailStation(10, 24, 'x', 1);
    expect(a.ok).toBe(true);
    // 3 tiles away: not adjacent, so without a join it would be a new station
    const b = g.buildRailStation(13, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    expect(b.ok).toBe(true);
    expect(b.stationId).toBe(a.stationId);
    expect(g.state.stations.length).toBe(1);
    expect(g.state.stations[0].tiles.length).toBe(2);
  });

  test('without joinStationId a distant station stays separate', () => {
    const g = flatGame();
    const a = g.buildRailStation(10, 24, 'x', 1);
    const b = g.buildRailStation(13, 24, 'x', 1, { player: true });
    expect(b.stationId).not.toBe(a.stationId);
    expect(g.state.stations.length).toBe(2);
  });

  test('refuses a join beyond the spread limit', () => {
    const g = flatGame();
    const a = g.buildRailStation(4, 24, 'x', 1);
    const far = g.buildRailStation(4 + 13, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    expect(far.ok).toBe(false);
    expect(far.error).toMatch(/spread/);
    expect(g.state.stations.length).toBe(1);
  });

  test('refuses a join of a station that is not ours', () => {
    const g = flatGame();
    const r = g.buildRailStation(10, 24, 'x', 1, { player: true, joinStationId: 999999 });
    expect(r.ok).toBe(false);
  });

  test('a rail station may join a bus-only station (any facility, as in OpenTTD)', () => {
    const g = flatGame();
    const bus = g.buildRoadStop(10, 24, 'bus', { axis: 'x' });
    expect(bus.ok).toBe(true);
    const rail = g.buildRailStation(13, 24, 'x', 1, { player: true, joinStationId: bus.stationId });
    expect(rail.ok).toBe(true);
    expect(rail.stationId).toBe(bus.stationId);
    const st = g.state.stations.find((s) => s.id === bus.stationId);
    expect(st.kinds.rail && st.kinds.bus).toBe(true);
  });

  test('the join survives save and load', () => {
    const g = flatGame();
    const a = g.buildRailStation(10, 24, 'x', 1);
    g.buildRailStation(13, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    const s2 = parseState(serializeState(g.state));
    expect(s2.stations.length).toBe(1);
    expect(s2.stations[0].tiles.map((t) => t.x).sort((p, q) => p - q)).toEqual([10, 13]);
  });

  test('picker helpers list only stations within spread and detect adjacency', () => {
    const g = flatGame();
    const a = g.buildRailStation(10, 24, 'x', 1);
    const tiles = [{ x: 13, y: 24 }];
    expect(adjacentOwn(g.state, tiles)).toBe(false);
    expect(joinChoices(g.state, 'rail', tiles).map((c) => c.id)).toEqual([a.stationId]);
    expect(joinChoices(g.state, 'rail', [{ x: 30, y: 24 }]).map((c) => c.id)).toEqual([]);
    expect(joinChoices(g.state, 'bus', tiles).map((c) => c.id)).toEqual([a.stationId]); // any facility joins
  });
});
