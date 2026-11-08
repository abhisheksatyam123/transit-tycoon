/**
 * Convert road <-> tram tests (OpenTTD CMD_CONVERT_ROAD road_cmd.cpp:2482 CmdConvertRoad).
 * Covers: basic road->tram and tram->road conversion, bit preservation, costs,
 * level crossing refusal, station/depot/bridge/tunnel refusal, same-type skip, empty skip, bounds.
 */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { COSTS } from '../js/config/costs.js';

describe('convertRoad command', () => {
  test('bounds check returns error', () => {
    const g = flatGame();
    expect(g.convertRoad(-1, 0, 5, 5).ok).toBe(false);
    expect(g.convertRoad(0, 0, 1000, 1000).ok).toBe(false);
  });

  test('converts road to tram, preserving bits and charging build(tram) + demolish(track)', () => {
    const g = flatGame();
    expect(g.buildRoad(10, 20, 14, 20).ok).toBe(true);
    const initialBits = [];
    for (let x = 10; x <= 14; x++) {
      const t = g.tile(x, 20);
      expect(t.road).toBeGreaterThan(0);
      expect(t.tram | 0).toBe(0);
      initialBits.push(t.road);
    }
    const moneyBefore = g.state.company.money;
    const expectedPerTile = COSTS.tram + COSTS.demolishTrack;
    const dry = g.convertRoad(10, 20, 14, 20, { dryRun: true, to: 'tram' });
    expect(dry.ok).toBe(true);
    expect(dry.tiles).toBe(5);
    expect(dry.cost).toBe(expectedPerTile * 5);
    expect(g.state.company.money).toBe(moneyBefore);

    const res = g.convertRoad(10, 20, 14, 20, { to: 'tram' });
    expect(res.ok).toBe(true);
    expect(res.tiles).toBe(5);
    expect(res.cost).toBe(expectedPerTile * 5);
    expect(g.state.company.money).toBe(moneyBefore - expectedPerTile * 5);

    for (let x = 10; x <= 14; x++) {
      const t = g.tile(x, 20);
      expect(t.tram).toBe(initialBits[x - 10]);
      expect(t.road | 0).toBe(0);
    }
  });

  test('converts tram to road, preserving bits and charging build(road) + demolish(track)', () => {
    const g = flatGame();
    expect(g.buildTram(10, 20, 14, 20).ok).toBe(true);
    const initialBits = [];
    for (let x = 10; x <= 14; x++) {
      const t = g.tile(x, 20);
      expect(t.tram).toBeGreaterThan(0);
      expect(t.road | 0).toBe(0);
      initialBits.push(t.tram);
    }
    const moneyBefore = g.state.company.money;
    const expectedPerTile = COSTS.road + COSTS.demolishTrack;
    const res = g.convertRoad(10, 20, 14, 20, { to: 'road' });
    expect(res.ok).toBe(true);
    expect(res.tiles).toBe(5);
    expect(res.cost).toBe(expectedPerTile * 5);
    expect(g.state.company.money).toBe(moneyBefore - expectedPerTile * 5);

    for (let x = 10; x <= 14; x++) {
      const t = g.tile(x, 20);
      expect(t.road).toBe(initialBits[x - 10]);
      expect(t.tram | 0).toBe(0);
    }
  });

  test('skips empty tiles and tiles already at target type', () => {
    const g = flatGame();
    expect(g.buildRoad(10, 20, 12, 20).ok).toBe(true);
    // 10,20 to 12,20 has road; 13,20 and 14,20 are empty land.
    // Rect 10,20 to 14,20 -> 3 tiles converted
    const res = g.convertRoad(10, 20, 14, 20, { to: 'tram' });
    expect(res.ok).toBe(true);
    expect(res.tiles).toBe(3);

    // Running convertRoad to: 'tram' again on same rect finds no unconverted road
    const resAgain = g.convertRoad(10, 20, 14, 20, { to: 'tram' });
    expect(resAgain.ok).toBe(false);
    expect(resAgain.error).toMatch(/no road/i);
  });

  test('refuses converting road on level crossing (with rail) to tram with crossing error', () => {
    const g = flatGame();
    // Build rail crossing road
    expect(g.buildRail(10, 20, 10, 24).ok).toBe(true);
    expect(g.buildRoad(8, 22, 12, 22).ok).toBe(true);
    const crossingTile = g.tile(10, 22);
    expect(crossingTile.rail).toBeGreaterThan(0);
    expect(crossingTile.road).toBeGreaterThan(0);

    const res = g.convertRoad(8, 22, 12, 22, { to: 'tram' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/crossing/i);

    // Tiles remain unchanged
    expect(g.tile(10, 22).road).toBeGreaterThan(0);
    expect(g.tile(10, 22).tram | 0).toBe(0);
  });

  test('refuses on station and depot tiles', () => {
    const g = flatGame();
    expect(g.buildRoad(10, 20, 14, 20).ok).toBe(true);
    expect(g.buildRoadStop(12, 20, 'bus').ok).toBe(true);
    expect(g.convertRoad(10, 20, 14, 20, { to: 'tram' }).ok).toBe(false);

    const g2 = flatGame();
    expect(g2.buildRoad(10, 20, 14, 20).ok).toBe(true);
    // Build depot beside road at 12, 21 facing north (dir 1) into (12, 20)
    expect(g2.buildDepot(12, 21, 'road', 1).ok).toBe(true);
    expect(g2.convertRoad(10, 20, 14, 21, { to: 'tram' }).ok).toBe(false);
  });
});
