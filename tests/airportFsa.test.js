/** Airport FTA: terminal/runway occupancy, holding pattern, international second hangar, save/load. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { AIRPORT_CAPACITY, airOccupancy } from '../js/simulation/airportFsa.js';
import { startServiceTrip } from '../js/simulation/movement.js';

/** First top-left corner where a dry-run build of `type` succeeds. */
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

function rich(seed = 5) {
  const game = Game.create({ seed, width: 96, height: 96 });
  game.state.company.money = 20_000_000;
  game.state.date.year = 1995; // every type open; planes buyable
  return game;
}

describe('FTA: occupancy constants', () => {
  test('terminals and helipads follow OpenTTD counts (small 2 terminals, international 6 + 2 helipads)', () => {
    expect(AIRPORT_CAPACITY.small.terminals).toBe(2);
    expect(AIRPORT_CAPACITY.international.terminals).toBe(6);
    expect(AIRPORT_CAPACITY.international.helipads).toBe(2);
    expect(AIRPORT_CAPACITY.heliport.helipads).toBe(1);
  });
});

describe('FTA: small airport holds the third plane', () => {
  test('three planes to a 2-terminal airport: never more than 2 loading, the third circles then lands later', () => {
    const game = rich();
    const s = game.state;
    const A = build(game, 'small');
    const B = build(game, 'small', A.spot); // a second small airport: planes shuttle A <-> B so slots turn over
    const planes = [];
    for (let i = 0; i < 3; i++) {
      const r = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' });
      expect(r.ok).toBe(true);
      planes.push(r.vehicle);
    }
    for (const v of planes) {
      expect(game.setOrders(v.id, [{ stationId: A.stationId }, { stationId: B.stationId }]).ok).toBe(true);
      expect(game.startVehicle(v.id).ok).toBe(true);
    }
    const firstLoad = new Map(); // plane -> first tick it loads at A
    let maxLoading = 0, sawHold = false;
    for (let t = 0; t < 6000 && firstLoad.size < 3; t++) {
      game.step();
      const loading = planes.filter((v) => v.state === 'loading' && v.atStationId === A.stationId);
      maxLoading = Math.max(maxLoading, loading.length);
      if (loading.length > AIRPORT_CAPACITY.small.terminals) throw new Error(`overlap at tick ${s.tick}`);
      if (planes.some((v) => v.hold)) sawHold = true;
      for (const v of loading) if (!firstLoad.has(v)) firstLoad.set(v, s.tick);
    }
    expect(maxLoading).toBeLessThanOrEqual(2); // never more than the 2 OTTD terminals at once
    expect(maxLoading).toBeGreaterThanOrEqual(1);
    expect(sawHold).toBe(true);       // a plane circled
    expect(firstLoad.size).toBe(3);   // every plane got a terminal eventually
  });

  test('airOccupancy counts only loading aircraft of the same pool', () => {
    const game = rich();
    const A = build(game, 'small');
    const st = game.state.stations.find((x) => x.id === A.stationId);
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    v.state = 'loading'; v.atStationId = st.id;
    expect(airOccupancy(game.state, st, 'small', false)).toBe(1);
    expect(airOccupancy(game.state, st, 'small', false, v)).toBe(0);
  });
});

describe('FTA: international second hangar', () => {
  test('international has two air depots, one per hangar tile; demolish removes both', () => {
    const game = rich();
    const I = build(game, 'international');
    const hangars = game.state.depots.filter((d) => d.kind === 'air' && d.x >= I.spot.x && d.x < I.spot.x + 7 && d.y >= I.spot.y && d.y < I.spot.y + 7);
    expect(hangars.length).toBe(2);
    expect(new Set(hangars.map((d) => d.id)).size).toBe(2);
    const r = game.demolish(I.spot.x + 3, I.spot.y + 3, I.spot.x + 3, I.spot.y + 3);
    expect(r.ok).toBe(true);
    expect(game.state.depots.filter((d) => d.kind === 'air').length).toBe(0);
  });

  test('a service trip from the second hangar goes to that hangar (the nearer one)', () => {
    const game = rich();
    const I = build(game, 'international');
    const hangars = game.state.depots.filter((d) => d.kind === 'air' && d.x >= I.spot.x && d.x < I.spot.x + 7 && d.y >= I.spot.y && d.y < I.spot.y + 7);
    const far = hangars.reduce((a, b) => (a.x + a.y < b.x + b.y ? a : b));
    const near = hangars.find((d) => d !== far);
    const v = game.buyVehicle(near.id, { modelId: 'ac_tu134' }).vehicle;
    v.tx = near.x; v.ty = near.y; v.state = 'running';
    v.serviceDue = true;
    const ctx = game.ctx;
    expect(startServiceTrip(ctx, v)).toBe(true);
    expect(v.goingToDepot).toBe(near.id);
    v.goingToDepot = null; v.serviceTrip = false;
    v.tx = far.x; v.ty = far.y;
    v.serviceDue = true;
    expect(startServiceTrip(ctx, v)).toBe(true);
    expect(v.goingToDepot).toBe(far.id);
  });
});

describe('FTA: save/load keeps occupancy', () => {
  test('mid-hold save/load: occupancy rebuilt from vehicle state, no overlap afterwards', () => {
    const game = rich();
    const A = build(game, 'small');
    const planes = [];
    for (let i = 0; i < 3; i++) planes.push(game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle);
    for (const v of planes) { game.setOrders(v.id, [{ stationId: A.stationId, load: 'none', unload: 'none' }]); game.startVehicle(v.id); }
    for (let t = 0; t < 400 && !planes.some((v) => v.hold); t++) game.step();
    expect(planes.some((v) => v.hold)).toBe(true);
    const g2 = Game.deserialize(game.serialize());
    const st2 = g2.state.stations.find((x) => x.id === A.stationId);
    expect(airOccupancy(g2.state, st2, 'small', false)).toBe(airOccupancy(game.state, game.state.stations.find((x) => x.id === A.stationId), 'small', false));
    for (let t = 0; t < 800; t++) {
      g2.step();
      const n = g2.state.vehicles.filter((v) => v.kind === 'aircraft' && v.state === 'loading' && v.atStationId === A.stationId).length;
      expect(n).toBeLessThanOrEqual(2);
    }
  });
});
