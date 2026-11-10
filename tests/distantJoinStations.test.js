// OpenTTD station.distant_join_stations (def true): a join to a station that is not next to the new tiles.
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { distantJoinRefused } from '../js/simulation/cmdStation.js';

describe('distant_join_stations', () => {
  test('default on, and the UI lists it under Construction as a checkbox', () => {
    expect(DEFAULT_SETTINGS.distantJoinStations).toBe(true);
    const meta = SETTING_META.find((m) => m.key === 'distantJoinStations');
    expect(meta.group).toBe('construction');
    expect(meta.type).toBe('check');
  });

  test('default (on): a distant join succeeds, as before', () => {
    const g = flatGame();
    setSetting(g.state, 'stationSpread', 16);
    const a = g.buildRailStation(4, 24, 'x', 1);
    const far = g.buildRailStation(4 + 13, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    expect(far.ok).toBe(true);
    expect(far.stationId).toBe(a.stationId);
  });

  test('off: a distant join is refused with a clear error; a plain build still works', () => {
    const g = flatGame();
    setSetting(g.state, 'stationSpread', 16);
    setSetting(g.state, 'distantJoinStations', false);
    expect(getSetting(g.state, 'distantJoinStations')).toBe(false);
    const a = g.buildRailStation(4, 24, 'x', 1);
    const far = g.buildRailStation(4 + 13, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    expect(far.ok).toBe(false);
    expect(far.error).toMatch(/Distant join is disabled/);
    const plain = g.buildRailStation(4 + 13, 24, 'x', 1, { player: true });
    expect(plain.ok).toBe(true);
    expect(plain.stationId).not.toBe(a.stationId);
  });

  test('off: a join to an adjacent station is still allowed', () => {
    const g = flatGame();
    setSetting(g.state, 'distantJoinStations', false);
    const a = g.buildRailStation(4, 24, 'x', 1);
    const adj = g.buildRailStation(5, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    expect(adj.ok).toBe(true);
    expect(adj.stationId).toBe(a.stationId);
  });

  test('helper: no join requested is never refused', () => {
    const g = flatGame();
    setSetting(g.state, 'distantJoinStations', false);
    expect(distantJoinRefused(g.state, null, [{ x: 4, y: 24 }])).toBe(false);
    expect(distantJoinRefused(g.state, {}, [{ x: 4, y: 24 }])).toBe(false);
  });
});
