import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { COSTS } from '../js/config/costs.js';
import { OBJECT_ERR } from '../js/simulation/cmdObject.js';
import { placeHouse, layStreet } from '../js/simulation/towns.js';


const at = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('placeable objects (gap #31b: transmitter, lighthouse, owned land)', () => {
  test('absent by default: no object field on a fresh game', () => {
    const g = flatGame(42);
    expect(g.serialize().includes('"object"')).toBe(false);
  });

  test('transmitter builds on a flat grass tile, charges its price, sets tile.object', () => {
    const g = flatGame(42);
    const m0 = g.state.company.money;
    const r = g.buildObject('transmitter', 10, 20);
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(COSTS.buildTransmitter);
    expect(g.state.company.money).toBe(m0 - COSTS.buildTransmitter);
    expect(at(g, 10, 20).object).toEqual({ type: 'transmitter' });
  });

  test('transmitter refused on a slope; lighthouse refused away from water', () => {
    const g = flatGame(42);
    at(g, 11, 20).height = 3;
    expect(g.buildObject('transmitter', 10, 20, { dryRun: true }).error).toBe(OBJECT_ERR.flat);
    expect(g.buildObject('lighthouse', 10, 20, { dryRun: true }).error).toBe(OBJECT_ERR.coast);
  });

  test('lighthouse builds beside water and is refused on water itself', () => {
    const g = flatGame(42);
    at(g, 12, 20).terrain = 'water';
    expect(g.buildObject('lighthouse', 11, 20).ok).toBe(true);
    expect(at(g, 11, 20).object).toEqual({ type: 'lighthouse' });
    expect(g.buildObject('transmitter', 12, 20, { dryRun: true }).error).toBe(OBJECT_ERR.water);
  });

  test('refuses roads, rail, buildings and an existing object; cost is the owned-land price', () => {
    const g = flatGame(42);
    const s = g.state; const W = s.map.width;
    s.map.tiles[20 * W + 10].road = 1;
    expect(g.buildObject('owned', 10, 20, { dryRun: true }).error).toBe(OBJECT_ERR.occupied);
    s.map.tiles[20 * W + 10].road = 0;
    s.map.tiles[20 * W + 11].rail = 1;
    expect(g.buildObject('owned', 11, 20, { dryRun: true }).error).toBe(OBJECT_ERR.occupied);
    expect(g.buildObject('owned', 12, 20).ok).toBe(true);
    expect(g.buildObject('owned', 12, 20, { dryRun: true }).error).toBe(OBJECT_ERR.occupied);
    expect(g.buildObject('owned', 12, 20, { dryRun: true }).ok).toBe(false);
    expect(COSTS.buildOwnedLand).toBeLessThan(COSTS.buildTransmitter);
  });

  test('demolish clears an object with no refund', () => {
    const g = flatGame(42);
    g.buildObject('transmitter', 10, 20);
    const m0 = g.state.company.money;
    const r = g.demolish(10, 20, 10, 20);
    expect(r.ok).toBe(true);
    expect(at(g, 10, 20).object).toBeUndefined();
    expect(g.state.company.money).toBeGreaterThanOrEqual(m0 - COSTS.demolishTrack - 1);
  });

  test('towns never build on owned land (house placement and street laying)', () => {
    const g = flatGame(42);
    const s = g.state;
    expect(g.buildObject('owned', 20, 20).ok).toBe(true);
    const town = s.towns[0]; const g2rng = g.rng;
    expect(placeHouse(s, g2rng, town, 20, 20, 1)).toBe(false);
    expect(at(g, 20, 20).building).toBeNull();
    layStreet(s, [{ x: 18, y: 20 }, { x: 19, y: 20 }, { x: 20, y: 20 }, { x: 21, y: 20 }]);
    expect(at(g, 20, 20).road).toBe(0);
  });

  test('save/load round-trips objects', () => {
    const g = flatGame(42);
    g.buildObject('transmitter', 10, 20);
    g.buildObject('owned', 12, 22);
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(at(g2, 10, 20).object).toEqual({ type: 'transmitter' });
    expect(at(g2, 12, 22).object).toEqual({ type: 'owned' });
    expect(g2.serialize()).toBe(json);
  });
});
