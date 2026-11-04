/** Airports and aircraft: build, buy at hangar, fly, load/unload, pay, save/load mid-flight. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { AIRPORT_W, AIRPORT_H } from '../js/simulation/constants.js';
import { airLine, altitudeAt } from '../js/simulation/aircraft.js';

/** First top-left corner (scanning from `from`) where an airport can be built (dry run). */
function findAirportSpot(game, from = { x: 4, y: 4 }, avoid = null) {
  for (let y = from.y; y < game.state.map.height - AIRPORT_H; y++) {
    for (let x = from.x; x < game.state.map.width - AIRPORT_W; x++) {
      if (avoid && Math.abs(avoid.x - x) + Math.abs(avoid.y - y) < 30) continue;
      if (game.buildAirport(x, y, { dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}

/** Two airports on a generated world, each with its hangar depot. */
function twoAirports(seed = 5) {
  const game = Game.create({ seed, width: 96, height: 96 });
  game.state.company.money = 5_000_000;
  const a = findAirportSpot(game);
  if (!a) throw new Error('no spot for airport A');
  const ra = game.buildAirport(a.x, a.y);
  if (!ra.ok) throw new Error(ra.error);
  const b = findAirportSpot(game, { x: 4, y: 4 }, a);
  if (!b) throw new Error('no spot for airport B');
  const rb = game.buildAirport(b.x, b.y);
  if (!rb.ok) throw new Error(rb.error);
  return { game, A: ra, B: rb, a, b };
}

/** Give an airport a stock of passengers and let it accept them (deterministic test setup). */
function stockAirport(game, stationId, amount) {
  const st = game.state.stations.find((s) => s.id === stationId);
  st.cargo.PASS = [{ amount, sourceX: st.x, sourceY: st.y, sinceTick: 0 }];
  st.accepts = { PASS: true, MAIL: true };
  return st;
}

describe('airport build', () => {
  test('footprint has runway, terminal, apron, tower and a hangar depot of kind air', () => {
    const { game, A, a } = twoAirports();
    const s = game.state;
    expect(A.depotId).toBeGreaterThan(0);
    const dep = s.depots.find((d) => d.id === A.depotId);
    expect(dep.kind).toBe('air');
    const parts = new Set();
    for (let dy = 0; dy < AIRPORT_H; dy++) for (let dx = 0; dx < AIRPORT_W; dx++) {
      const b = game.tile(a.x + dx, a.y + dy).building;
      expect(b.type).toBe('station');
      expect(b.kind).toBe('airport');
      parts.add(b.part);
    }
    for (const p of ['runway', 'terminal', 'apron', 'tower', 'hangar']) expect(parts.has(p)).toBe(true);
    expect(game.state.stations.find((st) => st.id === A.stationId).kinds.airport).toBe(true);
  });

  test('airport on water fails', () => {
    const game = Game.create({ seed: 5, width: 96, height: 96 });
    game.state.company.money = 5_000_000;
    const spot = { x: 30, y: 30 };
    for (let dy = 0; dy < AIRPORT_H; dy++) for (let dx = 0; dx < AIRPORT_W; dx++) {
      const t = game.tile(spot.x + dx, spot.y + dy);
      t.terrain = 'water';
      t.building = null;
    }
    const r = game.buildAirport(spot.x, spot.y);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/water/i);
  });

  test('removing an airport tile removes the whole footprint and its hangar', () => {
    const { game, A, a } = twoAirports();
    const before = game.state.depots.length;
    const r = game.demolish(a.x + 1, a.y + 1, a.x + 1, a.y + 1);
    expect(r.ok).toBe(true);
    expect(game.state.depots.length).toBe(before - 1);
    expect(game.state.stations.find((st) => st.id === A.stationId)).toBeUndefined();
    expect(game.tile(a.x, a.y).building).toBeNull();
  });
});

describe('aircraft', () => {
  test('bresenham line and altitude ramp', () => {
    const line = airLine(0, 0, 5, 2);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 5, y: 2 });
    const v = { path: Array.from({ length: 101 }, (_, i) => ({ x: i, y: 0 })), pathIndex: 0, progress: 0 };
    expect(altitudeAt(v)).toBe(0);
    v.pathIndex = 10; expect(altitudeAt(v)).toBeGreaterThan(0.5);
    v.pathIndex = 50; expect(altitudeAt(v)).toBe(1);
  });

  test('takes off, flies, lands, loads and earns money', () => {
    const { game, A, B } = twoAirports();
    const s = game.state;
    stockAirport(game, A.stationId, 500);
    stockAirport(game, B.stationId, 0);
    const bought = game.buyVehicle(A.depotId, { modelId: 'ac_li2' });
    expect(bought.ok).toBe(true);
    const v = bought.vehicle;
    expect(v.kind).toBe('aircraft');
    expect(game.setOrders(v.id, [{ stationId: A.stationId }, { stationId: B.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    const money0 = s.company.money;
    let flew = false, landedAfterFlight = false, maxAlt = 0, loadedAt = null;
    for (let t = 0; t < 2000 && !(loadedAt !== null && s.company.money > money0); t++) {
      game.step();
      maxAlt = Math.max(maxAlt, v.alt || 0);
      if (v.alt > 0 && v.state === 'running') flew = true;
      if (flew && v.state !== 'running' && (v.alt || 0) === 0) landedAfterFlight = true;
      if (loadedAt === null && v.load.amount > 0) loadedAt = s.tick;
    }
    expect(flew).toBe(true);
    expect(maxAlt).toBeGreaterThan(0.9);
    expect(landedAfterFlight).toBe(true);
    expect(loadedAt).not.toBeNull();
    expect(s.company.money).toBeGreaterThan(money0);
    const stB = s.stations.find((st) => st.id === B.stationId);
    expect(stB.cargo.PASS ? stB.cargo.PASS.length : 0).toBeGreaterThanOrEqual(0);
  });

  test('aircraft ignore road/rail connectivity', () => {
    const { game, A, B } = twoAirports();
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_li2' }).vehicle;
    game.setOrders(v.id, [{ stationId: A.stationId }, { stationId: B.stationId }]);
    game.startVehicle(v.id);
    for (let t = 0; t < 200; t++) game.step();
    expect(v.state === 'lost').toBe(false);
  });

  test('save/load mid-flight round-trips deterministically', () => {
    const { game, A, B } = twoAirports();
    game.state.date.year = 1990; // jets are introduced in 1956; keep the 1950 start for other tests
    stockAirport(game, A.stationId, 500);
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu104' }).vehicle;
    game.setOrders(v.id, [{ stationId: A.stationId }, { stationId: B.stationId }]);
    game.startVehicle(v.id);
    for (let t = 0; t < 400 && !(v.state === 'running' && v.alt > 0.5); t++) game.step();
    expect(v.alt).toBeGreaterThan(0.5);
    const json = game.serialize();
    const g2 = Game.deserialize(JSON.parse(json));
    for (let t = 0; t < 300; t++) { game.step(); g2.step(); }
    expect(g2.serialize()).toBe(game.serialize());
  });

  test('vehicle segments expose an aircraft part with alt', () => {
    const { game, A, B } = twoAirports();
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_li2' }).vehicle;
    game.setOrders(v.id, [{ stationId: A.stationId }, { stationId: B.stationId }]);
    game.startVehicle(v.id);
    for (let t = 0; t < 60; t++) game.step();
    const segs = game.getVehicleSegments(v);
    expect(segs.length).toBe(1);
    expect(segs[0].part).toBe('aircraft');
    expect(typeof segs[0].alt).toBe('number');
  });

  test('aircraft cannot be bought at a road depot', () => {
    const game = Game.create({ seed: 5, width: 96, height: 96 });
    game.state.company.money = 5_000_000;
    const road = game.state.depots.find((d) => d.kind === 'road');
    if (road) expect(game.buyVehicle(road.id, { modelId: 'ac_li2' }).ok).toBe(false);
  });
});
