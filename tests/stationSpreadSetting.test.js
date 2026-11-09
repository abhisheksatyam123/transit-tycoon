import { describe, test, expect } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { spreadOk, STATION_SPREAD } from '../js/simulation/stations.js';
import { Game } from '../js/simulation/game.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

describe('stationSpread setting', () => {
  test('default is 12', () => {
    expect(DEFAULT_SETTINGS.stationSpread).toBe(12);
    expect(STATION_SPREAD).toBe(12);
    expect(getSetting(flatGame().state, 'stationSpread')).toBe(12);
  });

  test('spreadOk respects limit parameter', () => {
    const st = { tiles: [{ x: 0, y: 0 }] };
    expect(spreadOk(st, [{ x: 12, y: 0 }], 12)).toBe(false);
    expect(spreadOk(st, [{ x: 12, y: 0 }], 16)).toBe(true);
    expect(spreadOk(st, [{ x: 11, y: 0 }])).toBe(true);
  });

  test('rail join refused at 13, allowed at 16', () => {
    const g1 = flatGame();
    const a1 = g1.buildRailStation(4, 24, 'x', 1, { player: true });
    expect(a1.ok).toBe(true);
    const f = g1.buildRailStation(17, 24, 'x', 1, { player: true, joinStationId: a1.stationId });
    expect(f.ok).toBe(false);
    expect(f.error).toMatch(/spread/);

    const g2 = flatGame();
    setSetting(g2.state, 'stationSpread', 16);
    const a2 = g2.buildRailStation(4, 24, 'x', 1, { player: true });
    const far = g2.buildRailStation(17, 24, 'x', 1, { player: true, joinStationId: a2.stationId });
    expect(far.ok).toBe(true);
    expect(far.stationId).toBe(a2.stationId);
  });

  test('road/bus/truck join respects stationSpread', () => {
    const g = flatGame();
    const a = g.buildRailStation(4, 24, 'x', 1, { player: true });
    expect(a.ok).toBe(true);
    // distance 13 from x=4 -> x=17, bounding box 14 > 12
    const bus = g.buildRoadStop(17, 24, 'bus', { player: true, joinStationId: a.stationId });
    expect(bus.ok).toBe(false);
    expect(bus.error).toMatch(/spread/);
    const truck = g.buildRoadStop(17, 24, 'truck', { player: true, joinStationId: a.stationId });
    expect(truck.ok).toBe(false);
    const road = g.buildRoadStop(17, 24, 'bus', { player: true, joinStationId: a.stationId });
    expect(road.ok).toBe(false);

    const g2 = flatGame();
    setSetting(g2.state, 'stationSpread', 16);
    const a2 = g2.buildRailStation(4, 24, 'x', 1, { player: true });
    const ok = g2.buildRoadStop(17, 24, 'bus', { player: true, joinStationId: a2.stationId });
    expect(ok.ok).toBe(true);
    expect(ok.stationId).toBe(a2.stationId);
  });

  test('airport building with adjacent station refused when exceeding spread, allowed when increased', () => {
    // Use heliport (1x1) to control spread precisely. flatGame clear area y 14..34.
    const g = flatGame();
    g.state.date.year = 1995;
    const a = g.buildRailStation(10, 20, 'x', 1, { player: true });
    expect(a.ok).toBe(true);
    // heliport at 12,20 joins rail station at 10,20 — spread fine (bbox 3) — should join
    const near = g.buildAirport(12, 20, { type: 'heliport', player: true, joinStationId: a.stationId });
    expect(near.ok).toBe(true);

    // Far join refused: station at 4,20; heliport join at 20,20 (distance 16, bbox 17 > 12)
    const g2 = flatGame();
    g2.state.date.year = 1995;
    const b = g2.buildRailStation(4, 20, 'x', 1, { player: true });
    expect(b.ok).toBe(true);
    // opts.player not forwarded for airport in all paths? Our code checks regardless of player flag for join/adjacent, so any build is checked.
    const far = g2.buildAirport(20, 20, { type: 'heliport', joinStationId: b.stationId });
    expect(far.ok).toBe(false);
    expect(far.error).toMatch(/spread/);

    const g3 = flatGame();
    g3.state.date.year = 1995;
    setSetting(g3.state, 'stationSpread', 24);
    const c = g3.buildRailStation(4, 20, 'x', 1, { player: true });
    const farOk = g3.buildAirport(20, 20, { type: 'heliport', joinStationId: c.stationId });
    expect(farOk.ok).toBe(true);
  });

  test('dock building with adjacent station respects spread', () => {
    const g = flatGame();
    // make (5,20) adjacent to water: clearArea region already; carve water at (6,20)
    const s = g.state;
    const W = s.map.width;
    s.map.tiles[20 * W + 6].terrain = 'water';
    s.map.tiles[20 * W + 6].height = 0;
    const a = g.buildRailStation(5, 20, 'x', 1, { player: true });
    expect(a.ok).toBe(true);
    // rail station tile at (5,20) is occupied, so dock adjacent check elsewhere: create station far for join test
    const g2 = flatGame();
    const s2 = g2.state;
    const W2 = s2.map.width;
    s2.map.tiles[20 * W2 + 21].terrain = 'water';
    s2.map.tiles[20 * W2 + 21].height = 0;
    const b = g2.buildRailStation(4, 20, 'x', 1, { player: true });
    expect(b.ok).toBe(true);
    const far = g2.buildDock(20, 20, { joinStationId: b.stationId });
    expect(far.ok).toBe(false);
    expect(far.error).toMatch(/spread/);

    const g3 = flatGame();
    setSetting(g3.state, 'stationSpread', 24);
    const s3 = g3.state;
    const W3 = s3.map.width;
    s3.map.tiles[20 * W3 + 21].terrain = 'water';
    s3.map.tiles[20 * W3 + 21].height = 0;
    const c = g3.buildRailStation(4, 20, 'x', 1, { player: true });
    const ok = g3.buildDock(20, 20, { joinStationId: c.stationId });
    expect(ok.ok).toBe(true);
  });

  test('SETTING_META has stationSpread with options', () => {
    const m = SETTING_META.find((e) => e.key === 'stationSpread');
    expect(m).toBeDefined();
    expect(m.group).toBe('construction');
    expect(m.label).toMatch(/Station spread/);
    expect(Array.isArray(m.options)).toBe(true);
    expect(m.options.length).toBeGreaterThan(0);
    expect(m.options.map((o) => String(o[0])).includes('12')).toBe(true);
  });

  test('save/load keeps stationSpread', () => {
    const g = flatGame();
    setSetting(g.state, 'stationSpread', 24);
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'stationSpread')).toBe(24);
  });
});
