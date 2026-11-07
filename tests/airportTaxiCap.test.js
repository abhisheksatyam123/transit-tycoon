/** Aircraft taxi speed cap (OpenLoco VehicleHead.cpp:2074/2098 taxiing target 20 mph): on taxi tiles of the
 * ground phase (apron / terminal / helipad) the plane is capped; the runway roll keeps accelerating and lifts off. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { ftaPartTiles, ftaNextIsTaxi } from '../js/simulation/airportGround.js';
import { AIR_MPH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';

const TAXI_TILES = 20 * AIR_MPH_TO_TILES_PER_TICK;
const key = (t) => `${t.x},${t.y}`;

function findSpot(game, type, avoid = null) {
  const t = AIRPORT_TYPES[type];
  for (let y = 4; y < game.state.map.height - t.h; y++) {
    for (let x = 4; x < game.state.map.width - t.w; x++) {
      if (avoid && Math.abs(avoid.x - x) + Math.abs(avoid.y - y) < 30) continue;
      if (game.buildAirport(x, y, { type, dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}
function build(game, type, avoid = null) {
  const spot = findSpot(game, type, avoid);
  if (!spot) throw new Error(`no spot for ${type}`);
  const r = game.buildAirport(spot.x, spot.y, { type });
  if (!r.ok) throw new Error(r.error);
  return { ...r, spot };
}
function rich(seed = 5) {
  const game = Game.create({ seed, width: 96, height: 96 });
  game.state.company.money = 20_000_000;
  game.state.date.year = 1995;
  return game;
}

/** Fly one plane A -> B and record the speed each tick, split by the tile class it moved on. */
function flight(seed) {
  const game = rich(seed);
  const s = game.state;
  const A = build(game, 'small');
  const B = build(game, 'small', A.spot);
  const st = s.stations.find((x) => x.id === A.stationId);
  const runway = new Set(ftaPartTiles(s, st, 'runway').map(key));
  const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
  expect(game.setOrders(v.id, [{ stationId: B.stationId }]).ok).toBe(true);
  expect(game.startVehicle(v.id).ok).toBe(true);
  const taxiMax = { speed: 0, n: 0 };
  const runMax = { speed: 0, n: 0 };
  let airborne = false;
  for (let t = 0; t < 1200 && !airborne; t++) {
    const before = v.state === 'running' && v.ftaGroundEnd != null && v.pathIndex < v.ftaGroundEnd;
    // taxi tile: the step decides the speed from the next tile (ftaNextIsTaxi), so classify before the step
    const taxiNext = before && ftaNextIsTaxi(s, v);
    const runNext = before && runway.has(`${v.path[v.pathIndex + 1]?.x},${v.path[v.pathIndex + 1]?.y}`);
    game.step();
    if (taxiNext) { taxiMax.speed = Math.max(taxiMax.speed, v.speed); taxiMax.n++; }
    if (runNext) { runMax.speed = Math.max(runMax.speed, v.speed); runMax.n++; }
    if (v.ftaGroundEnd != null && v.pathIndex > v.ftaGroundEnd) airborne = true;
  }
  return { taxiMax, runMax, airborne, maxSpeed: v.maxSpeed };
}

describe('aircraft taxi speed cap (OL 20 mph taxi target)', () => {
  test('taxi tiles of the ground phase are capped at 20 mph', () => {
    const r = flight(5);
    expect(r.taxiMax.n).toBeGreaterThan(0);
    expect(r.taxiMax.speed).toBeLessThanOrEqual(TAXI_TILES + 1e-12);
  });

  test('runway roll is not capped: the plane accelerates past 20 mph and lifts off', () => {
    const r = flight(5);
    expect(r.maxSpeed).toBeGreaterThan(TAXI_TILES);
    expect(r.runMax.n).toBeGreaterThan(0);
    expect(r.runMax.speed).toBeGreaterThan(TAXI_TILES);
    expect(r.airborne).toBe(true);
  });

  test('ftaNextIsTaxi: false off the ground phase path end and on runway tiles', () => {
    const game = rich(5);
    const s = game.state;
    const A = build(game, 'small');
    const st = s.stations.find((x) => x.id === A.stationId);
    const runway = ftaPartTiles(s, st, 'runway');
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    expect(ftaNextIsTaxi(s, { ...v, path: [], pathIndex: 0 })).toBe(false);
    const r0 = runway[0];
    expect(ftaNextIsTaxi(s, { path: [{ x: r0.x - 1, y: r0.y }, r0], pathIndex: 0 })).toBe(false);
  });
});
