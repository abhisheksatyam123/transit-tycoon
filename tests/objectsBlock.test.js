// F8 B2: transmitters and lighthouses block road/rail/station/depot/airport/canal/HQ builds (OpenTTD
// ClearTile_Object); owned land is cleared without refund when the player builds on it.
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { objectBlocks, objectError, canAddBits, ERR } from '../js/simulation/trackRules.js';

const at = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('objects block building (F8 B2)', () => {
  test('objectBlocks: transmitter and lighthouse block, owned land and absent do not', () => {
    expect(objectBlocks({ object: { type: 'transmitter' } })).toBe(true);
    expect(objectBlocks({ object: { type: 'lighthouse' } })).toBe(true);
    expect(objectBlocks({ object: { type: 'owned' } })).toBe(false);
    expect(objectBlocks({})).toBe(false);
    expect(objectError({ object: { type: 'transmitter' } })).toBe(ERR.object);
    expect(objectError({})).toBeNull();
  });

  test('canAddBits refuses rail and road on a transmitter tile; owned land is allowed', () => {
    expect(canAddBits({ object: { type: 'transmitter' }, road: 0, rail: 0 }, 'road', 2)).toBe(ERR.object);
    expect(canAddBits({ object: { type: 'lighthouse' }, road: 0, rail: 0 }, 'rail', 2)).toBe(ERR.object);
    expect(canAddBits({ object: { type: 'owned' }, road: 0, rail: 0 }, 'road', 2)).toBeNull();
  });

  test('buildRoad over a transmitter fails and leaves the tile untouched', () => {
    const g = flatGame(42);
    at(g, 10, 20).object = { type: 'transmitter' };
    const r = g.buildRoad(9, 20, 11, 20);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ERR.object);
    expect(at(g, 10, 20).road).toBeFalsy();
  });

  test('buildRail over a lighthouse fails', () => {
    const g = flatGame(42);
    at(g, 10, 20).object = { type: 'lighthouse' };
    const r = g.buildRail(9, 20, 11, 20);
    expect(r.ok).toBe(false);
    expect(r.error).toBe(ERR.object);
  });

  test('rail and road stations, depots and HQ refuse a transmitter tile', () => {
    const g = flatGame(42);
    at(g, 10, 20).object = { type: 'transmitter' };
    expect(g.buildRoadStop(10, 20, 'bus').ok).toBe(false);
    expect(g.buildRailStation(10, 20, 'x', 1).ok).toBe(false);
    expect(g.buildDepot(10, 20, 'road', 2).ok).toBe(false);
    expect(g.buildHQ(10, 20).ok).toBe(false);
  });

  test('building a road over owned land clears the object, no refund', () => {
    const g = flatGame(42);
    at(g, 10, 20).object = { type: 'owned' };
    const m0 = g.state.company.money;
    const r = g.buildRoad(9, 20, 11, 20);
    expect(r.ok).toBe(true);
    expect(at(g, 10, 20).object).toBeUndefined();
    expect(at(g, 10, 20).road).toBeTruthy();
    // no refund for the owned land itself: only the road cost is charged
    expect(g.state.company.money).toBeLessThan(m0);
  });

  test('the HQ clears owned land under its footprint', () => {
    const g = flatGame(42);
    at(g, 10, 20).object = { type: 'owned' };
    const r = g.buildHQ(10, 20);
    expect(r.ok).toBe(true);
    expect(at(g, 10, 20).object).toBeUndefined();
  });

  test('demolishing a transmitter still works (demolish path unchanged)', () => {
    const g = flatGame(42);
    expect(g.buildObject('transmitter', 10, 20).ok).toBe(true);
    expect(g.buildRoad(9, 20, 11, 20).ok).toBe(false);
    const d = g.demolish(10, 20, 10, 20);
    expect(d.ok).toBe(true);
    expect(at(g, 10, 20).object).toBeUndefined();
    expect(g.buildRoad(9, 20, 11, 20).ok).toBe(true);
  });
});
