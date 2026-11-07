/** Helicopter helipad ground phase (airportGround.js heli*): one pad, holding; helistation with 2 pads. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { AIRPORT_CAPACITY } from '../js/simulation/airportFsa.js';
import { ftaPartTiles } from '../js/simulation/airportGround.js';

function findSpot(game, type, from = { x: 4, y: 4 }, avoid = null) {
  const t = AIRPORT_TYPES[type];
  for (let y = from.y; y < game.state.map.height - t.h; y++) {
    for (let x = from.x; x < game.state.map.width - t.w; x++) {
      if (avoid && Math.abs(avoid.x - x) + Math.abs(avoid.y - y) < 30) continue;
      if (game.buildAirport(x, y, { type, dryRun: true }).ok) return { x, y };
    }
  }
  return null;
}
function build(game, type, avoid = null) {
  const spot = findSpot(game, type, { x: 4, y: 4 }, avoid);
  if (!spot) throw new Error(`no spot for ${type}`);
  const r = game.buildAirport(spot.x, spot.y, { type });
  if (!r.ok) throw new Error(r.error);
  return { ...r, spot };
}
function game1985(seed = 5) {
  const game = Game.create({ seed, width: 96, height: 96 });
  game.state.company.money = 20_000_000;
  game.state.date.year = 1985; // Tricario (1963-1995) buyable; helistation (1980+) open
  return game;
}

/** Helicopters shuttle between two stations of one type for 60 days; returns arrivals, max loading, pad sharing. */
function shuttle(type, n, seed) {
  const game = game1985(seed);
  const s = game.state;
  const A = build(game, type);
  const B = build(game, type, A.spot);
  const st = s.stations.find((x) => x.id === A.stationId);
  const helis = [];
  for (let i = 0; i < n; i++) {
    const r = game.buyVehicle(A.depotId, { modelId: 'ac_tricario' });
    expect(r.ok).toBe(true);
    expect(game.setOrders(r.vehicle.id, [{ stationId: A.stationId }, { stationId: B.stationId }]).ok).toBe(true);
    expect(game.startVehicle(r.vehicle.id).ok).toBe(true);
    helis.push(r.vehicle);
  }
  const arrivals = new Map(helis.map((v) => [v.id, 0]));
  const prev = new Map(helis.map((v) => [v.id, v.state]));
  let maxLoading = 0, sawHold = false, sharedPad = null;
  const end = s.tick + 60 * TICKS_PER_DAY;
  while (s.tick < end) {
    game.step();
    const loading = helis.filter((v) => v.state === 'loading' && v.atStationId === st.id);
    maxLoading = Math.max(maxLoading, loading.length);
    if (helis.some((v) => v.hold && v.state === 'running')) sawHold = true;
    // two helicopters in the ground phase on one pad tile, or loading on the same tile
    const tiles = new Map();
    for (const v of helis) {
      const onPad = (v.ftaGroundEnd != null && v.pathIndex <= v.ftaGroundEnd) || v.state === 'loading';
      if (!onPad) continue;
      const k = `${v.tx},${v.ty}`;
      const b = s.map.tiles[v.ty * s.map.width + v.tx].building;
      if (b && b.part === 'helipad') {
        if (tiles.has(k) && !sharedPad) sharedPad = { tick: s.tick, tile: k };
        tiles.set(k, v.id);
      }
    }
    for (const v of helis) {
      if (prev.get(v.id) !== 'loading' && v.state === 'loading') arrivals.set(v.id, arrivals.get(v.id) + 1);
      prev.set(v.id, v.state);
    }
  }
  return { st, helis, arrivals, maxLoading, sawHold, sharedPad, A, B };
}

describe('helicopter helipads: one heliport, three helicopters', () => {
  test('never two helicopters on the pad; every helicopter completes >= 2 trips in 60 days; waiting ones hold in the air', () => {
    const r = shuttle('heliport', 3, 5);
    expect(r.maxLoading).toBeLessThanOrEqual(AIRPORT_CAPACITY.heliport.helipads);
    expect(r.maxLoading).toBeGreaterThanOrEqual(1);
    expect(r.sharedPad).toBeNull();
    expect(r.sawHold).toBe(true);
    for (const v of r.helis) expect(r.arrivals.get(v.id)).toBeGreaterThanOrEqual(2);
  }, 60_000);
});

describe('helicopter helipads: helistation with two pads', () => {
  test('helistation layout has two helipads and capacity 2', () => {
    const game = game1985(7);
    const A = build(game, 'helistation');
    const st = game.state.stations.find((x) => x.id === A.stationId);
    expect(ftaPartTiles(game.state, st, 'helipad').length).toBe(2);
    expect(AIRPORT_CAPACITY.helistation.helipads).toBe(2);
  });

  test('three helicopters, 60 days: at most 2 loading at once, each completes >= 2 trips, no pad shared', () => {
    const r = shuttle('helistation', 3, 9);
    expect(r.maxLoading).toBeLessThanOrEqual(2);
    expect(r.maxLoading).toBeGreaterThanOrEqual(2);
    expect(r.sharedPad).toBeNull();
    for (const v of r.helis) expect(r.arrivals.get(v.id)).toBeGreaterThanOrEqual(2);
  }, 60_000);
});
