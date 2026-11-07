/** Typed player bridges (config/bridges.js): availability, span limits, cost scaling, speed cap, untyped unchanged, save/load. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { BRIDGE_TYPES, bridgeType, bridgeTypesAvailable, bridgeCostMult, bridgeSpanLimits } from '../js/config/bridges.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { createVehicle } from '../js/simulation/vehicles.js';
import { vehicleTick } from '../js/simulation/movement.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { COSTS } from '../js/config/costs.js';

/** Flat map with a valley at x 30..34 on row 20 (heights 3 outside, 1 in the valley): heads at 29 and 35 (7 tiles). */
function valley(year = 1990, span = 5) {
  const g = flatGame();
  for (let x = 0; x < g.state.map.width; x++) for (let y = 0; y < g.state.map.height; y++) g.tile(x, y).height = 3;
  for (let x = 30; x < 29 + span - 1; x++) g.tile(x, 20).height = 1; // deck only: heads 29 and 29+span-1 stay at 3
  g.state.date.year = year;
  return g;
}
/** Head x positions for a bridge of `span` deck-plus-heads tiles starting at x=29. */
const endX = (span) => 29 + span - 1;

describe('bridge type table', () => {
  test('OTTD originals: 13 types, speeds from bridge_land.h', () => {
    expect(BRIDGE_TYPES.length).toBe(13);
    expect(bridgeType('wooden').speed).toBe(32);
    expect(bridgeType('concrete').speed).toBe(48);
    expect(bridgeType('girder_steel').speed).toBe(64);
    expect(bridgeType('cantilever_steel_3').speed).toBe(240);
    expect(bridgeType('tubular_silicon').speed).toBe(608);
    expect(bridgeType('nope')).toBeNull();
  });

  test('availability by intro year', () => {
    const ids = (y) => bridgeTypesAvailable(y).map((t) => t.id);
    expect(ids(1900)).not.toContain('girder_steel');
    expect(ids(1900)).toContain('wooden');
    expect(ids(1930)).toContain('girder_steel');
    expect(ids(1990)).not.toContain('tubular_steel');
    expect(ids(2010)).toContain('tubular_silicon');
  });

  test('cost multiplier relative to the wooden (standard) bridge', () => {
    expect(bridgeCostMult(bridgeType('wooden'))).toBe(1);
    expect(bridgeCostMult(bridgeType('tubular_silicon'))).toBeCloseTo(510 / 80);
  });

  test('span limits include the heads', () => {
    expect(bridgeSpanLimits(bridgeType('concrete'))).toEqual([2, 4]);
    expect(bridgeSpanLimits(bridgeType('wooden'))[1]).toBe(Infinity);
  });
});

describe('building a typed bridge', () => {
  test('availability: refused before the intro year, accepted after', () => {
    const early = valley(1900);
    const r1 = early.buildLandBridge(29, 20, endX(5), 20, { bridgeType: 'girder_steel' });
    expect(r1.ok).toBe(false);
    expect(r1.error).toMatch(/not yet available/);
    const late = valley(1950);
    expect(late.buildLandBridge(29, 20, endX(5), 20, { bridgeType: 'girder_steel' }).ok).toBe(true);
  });

  test('max length refusal: concrete (max 2 tiles between heads) rejects a longer span', () => {
    const g = valley(1990);
    const r = g.buildLandBridge(29, 20, endX(5), 20, { bridgeType: 'concrete' }); // 5 deck + 2 heads = 7 > 4
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too long/);
    // 4 tiles total (2 deck + 2 heads) is within limit
    expect(valley(1990, 4).buildLandBridge(29, 20, endX(4), 20, { bridgeType: 'concrete' }).ok).toBe(true);
  });

  test('unknown type refused', () => {
    expect(valley().buildLandBridge(29, 20, endX(5), 20, { bridgeType: 'hovercraft' }).ok).toBe(false);
  });

  test('cost scales by the type multiplier on the deck', () => {
    const base = valley(1990).buildLandBridge(29, 20, endX(5), 20, { dryRun: true });
    const typed = valley(1990).buildLandBridge(29, 20, endX(5), 20, { dryRun: true, bridgeType: 'suspension_concrete' });
    expect(base.ok && typed.ok).toBe(true);
    const deckCost = Math.round(COSTS.bridgeRail * bridgeCostMult(bridgeType('suspension_concrete')));
    expect(typed.cost - base.cost).toBe(3 * (deckCost - COSTS.bridgeRail)); // 5 tiles = 2 heads + 3 deck
  });

  test('tiles store bridgeType on heads and deck; demolish clears it', () => {
    const g = valley(1990);
    expect(g.buildLandBridge(29, 20, endX(5), 20, { bridgeType: 'cantilever_steel' }).ok).toBe(true);
    for (let x = 29; x <= endX(5); x++) expect(g.tile(x, 20).bridgeType).toBe('cantilever_steel');
    expect(g.tile(29, 19).bridgeType).toBeUndefined();
  });
});

describe('untyped bridge unchanged', () => {
  test('default bridge has no bridgeType field and the same cost as before', () => {
    const g = valley(1990);
    const r = g.buildLandBridge(29, 20, endX(5), 20, { dryRun: true });
    expect(r.ok).toBe(true);
    expect(g.tile(31, 20).bridgeType).toBeUndefined();
    const k = valley(1990).buildLandBridge(29, 20, endX(5), 20, { dryRun: true, bridgeType: 'wooden' });
    expect(k.cost).toBe(r.cost); // wooden = multiplier 1
  });
});

describe('speed cap on a typed bridge', () => {
  /** Road bus on the approach to the bridge; the next tile is the first deck tile. Returns the speed once settled. */
  function speedOnDeck(bridgeTypeId) {
    const g = valley(1990, 4); // 4-tile span (2 deck + 2 heads): within concrete's limit
    const opts = bridgeTypeId ? { bridgeType: bridgeTypeId } : {};
    expect(g.buildRoad(26, 20, 28, 20).ok).toBe(true); // road approach west of the head at 29
    expect(g.buildRoadBridge(29, 20, endX(4), 20, opts).ok).toBe(true);
    const model = MODEL_BY_ID.bus_express;
    const depot = { kind: 'road', id: 1, x: 27, y: 20, dir: 2 };
    const v = createVehicle(g.state, depot, { model, wagons: 0, cargoId: 'PASS', capacity: model.capacity, running: model.running }, 0);
    v.state = 'running';
    v.path = Array.from({ length: 6 }, (_, k) => ({ x: 27 + k, y: 20 })); // x 27..32: road, then the bridge (ends at the far head)
    v.pathIndex = 2;                  // head tile x=29; next step enters the deck
    v.progress = 0;
    v.speed = v.maxSpeed;            // start at the bus's own top speed
    v.orders = [];
    v.history = [];
    // peak speed over a few ticks while the vehicle is on the deck approach (re-pinned to the same tile each time)
    // settled speed after 40 ticks on the approach: braking/accel converge to the cap
    for (let i = 0; i < 40; i++) {
      v.pathIndex = 2; v.progress = 0;
      vehicleTick({ state: g.state, emit() {}, collide: false }, v);
    }
    return v.speed;
  }

  test('a typed bridge caps the vehicle at its speed (concrete 48 km/h)', () => {
    const cap = 48 * KMH_TO_TILES_PER_TICK;
    expect(speedOnDeck("concrete")).toBeLessThanOrEqual(cap + 1e-12);
    expect(speedOnDeck(null)).toBeGreaterThan(cap); // untyped bridge: the bus runs at its own speed
  });
});

describe('save / load', () => {
  test('bridgeType survives a save and load', () => {
    const g = valley(1990);
    expect(g.buildLandBridge(29, 20, endX(5), 20, { bridgeType: 'girder_steel' }).ok).toBe(true);
    const loaded = parseState(serializeState(g.state));
    const t = loaded.map.tiles[20 * loaded.map.width + 31];
    expect(t.bridgeType).toBe('girder_steel');
    expect(loaded.map.tiles[19 * loaded.map.width + 31].bridgeType).toBeUndefined();
  });
});

import { autoBridgeType } from '../js/config/bridges.js';
test('auto bridge type: fastest available type that fits the span', () => {
  expect(autoBridgeType(1950, 4).id).toBe('girder_steel_2'); // 2 deck tiles: girder steel 2 (256 km/h)
  expect(autoBridgeType(1920, 4).id).toBe('suspension_concrete'); // pre-1930: concrete 48 / suspension concrete 80
  expect(autoBridgeType(1920, 20).id).toBe('wooden'); // long span before 1930: only wooden is unlimited
});
