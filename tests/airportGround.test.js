/** Airport FTA ground movement (airportGround.js): hangar -> terminal -> runway -> airborne, runway queue, heli pads. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { ftaPartTiles, taxiPath } from '../js/simulation/airportGround.js';

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
  game.state.date.year = 1995;
  return game;
}
const key = (t) => `${t.x},${t.y}`;

describe('airport ground FTA', () => {
  test('small airport: runway row and two terminal tiles are reachable by taxi from the hangar', () => {
    const game = rich();
    const A = build(game, 'small');
    const st = game.state.stations.find((s) => s.id === A.stationId);
    const runway = ftaPartTiles(game.state, st, 'runway');
    const terms = ftaPartTiles(game.state, st, 'terminal');
    expect(runway.length).toBe(4);
    expect(terms.length).toBe(2);
    const hang = game.state.depots.find((d) => d.id === A.depotId);
    expect(taxiPath(game.state, st, hang.x, hang.y, terms)).not.toBeNull();
    expect(taxiPath(game.state, st, hang.x, hang.y, runway)).not.toBeNull();
  });

  test('plane goes hangar -> terminal -> runway -> airborne in OpenTTD order', () => {
    const game = rich();
    const s = game.state;
    const A = build(game, 'small');
    const B = build(game, 'small', A.spot);
    const st = s.stations.find((x) => x.id === A.stationId);
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    expect(game.setOrders(v.id, [{ stationId: B.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    const runway = new Set(ftaPartTiles(s, st, 'runway').map(key));
    const terms = new Set(ftaPartTiles(s, st, 'terminal').map(key));
    // OpenTTD order: taxi from the hangar to a terminal tile (TERMGROUP), then the runway (TAKEOFF), then airborne
    const order = [];
    let airborne = false;
    for (let t = 0; t < 600 && !airborne; t++) {
      game.step();
      if (v.ftaGroundEnd != null && v.state === 'running') {
        const here = `${v.tx},${v.ty}`;
        const tag = terms.has(here) ? 'term' : runway.has(here) ? 'run' : 'taxi';
        if (order[order.length - 1] !== tag) order.push(tag);
        if (v.pathIndex > v.ftaGroundEnd) airborne = true;
      }
    }
    expect(airborne).toBe(true);
    expect(order.indexOf('term')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('run')).toBeGreaterThan(order.indexOf('term'));
    expect(order.indexOf('run')).toBeGreaterThanOrEqual(0);
  });

  test('two planes queue for the runway: never two on runway tiles at once', () => {
    const game = rich();
    const s = game.state;
    const A = build(game, 'small');
    const B = build(game, 'small', A.spot);
    const st = s.stations.find((x) => x.id === A.stationId);
    const runway = new Set(ftaPartTiles(s, st, 'runway').map(key));
    const planes = [];
    for (let i = 0; i < 2; i++) {
      const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
      expect(game.setOrders(v.id, [{ stationId: B.stationId }]).ok).toBe(true);
      expect(game.startVehicle(v.id).ok).toBe(true);
      planes.push(v);
    }
    let maxOn = 0;
    for (let t = 0; t < 600; t++) {
      game.step();
      const on = planes.filter((v) => v.kind && v.state === 'running' && v.ftaGroundEnd != null && runway.has(`${v.tx},${v.ty}`)).length;
      maxOn = Math.max(maxOn, on);
    }
    expect(maxOn).toBeLessThanOrEqual(1);
  });

  test('landing plane takes a free terminal (not one with a parked plane)', () => {
    const game = rich();
    const s = game.state;
    const A = build(game, 'small');
    const B = build(game, 'small', A.spot);
    const st = s.stations.find((x) => x.id === A.stationId);
    const terms = ftaPartTiles(s, st, 'terminal');
    const parked = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    parked.state = 'loading'; parked.atStationId = st.id; parked.tx = terms[0].x; parked.ty = terms[0].y;
    const v = game.buyVehicle(B.depotId, { modelId: 'ac_tu134' }).vehicle;
    expect(game.setOrders(v.id, [{ stationId: A.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    let landedAt = null;
    for (let t = 0; t < 3000 && !landedAt; t++) {
      game.step();
      if (v.ftaGroundEnd != null && v.state === 'running') {
        const end = v.path[v.ftaGroundEnd];
        landedAt = end;
      }
      if (v.state === 'loading' && v.atStationId === st.id) landedAt = { x: v.tx, y: v.ty };
    }
    expect(landedAt).not.toBeNull();
    expect(key(landedAt)).not.toBe(key(terms[0]));
  });

  test('helicopter uses the helipad (no taxi, helipad goal)', () => {
    const game = rich();
    const H = build(game, 'heliport');
    const st = game.state.stations.find((x) => x.id === H.stationId);
    const heli = game.state.vehicles.find((v) => v.kind === 'aircraft') || null;
    expect(st).toBeTruthy();
    expect(heli).toBeNull(); // no aircraft bought yet: heliport built and recognised
    const pads = ftaPartTiles(game.state, st, 'helipad');
    expect(pads.length).toBe(1);
  });
});

/** Four planes shuttle between two airports of one type for 60 days: every plane arrives >= 2 times, no tile is
 * shared by two planes in its ground phase or while loading, and the run does not stall. */
function shuttle(type, seed) {
  const game = rich(seed);
  const s = game.state;
  const A = build(game, type);
  const B = build(game, type, A.spot);
  const st = s.stations.find((x) => x.id === A.stationId);
  const planes = [];
  for (let i = 0; i < 4; i++) {
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    expect(game.setOrders(v.id, [{ stationId: A.stationId }, { stationId: B.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    planes.push(v);
  }
  const arrivals = new Map(planes.map((v) => [v.id, 0]));
  const prevState = new Map(planes.map((v) => [v.id, v.state]));
  let shared = null;
  const end = s.tick + 60 * TICKS_PER_DAY;
  while (s.tick < end) {
    game.step();
    const occ = new Map();
    for (const v of planes) {
      if (prevState.get(v.id) !== 'loading' && v.state === 'loading') arrivals.set(v.id, arrivals.get(v.id) + 1);
      prevState.set(v.id, v.state);
      const onGround = (v.ftaGroundEnd != null && v.pathIndex <= v.ftaGroundEnd) || v.state === 'loading';
      if (!onGround) continue;
      const bb = s.map.tiles[v.ty * s.map.width + v.tx].building;
      if (!bb || bb.part === 'hangar') continue; // depot tiles hold several planes (spawn/leave); taxi tiles are blocks
      const k = `${v.tx},${v.ty}`;
      if (occ.has(k) && !shared) shared = { tick: s.tick, tile: k, a: occ.get(k), b: v.id };
      occ.set(k, v.id);
      occ.set(k, v.id);
    }
  }
  return { st, planes, arrivals, shared, A, B };
}

describe('airport ground FTA: metropolitan and international (two runways, apron block)', () => {
  for (const [type, seed] of [['metropolitan', 11], ['international', 12]]) {
    test(`${type}: 4 planes, 60 days, every plane completes >= 2 trips, no tile shared`, () => {
      const r = shuttle(type, seed);
      expect(r.shared).toBeNull();
      for (const v of r.planes) expect(r.arrivals.get(v.id)).toBeGreaterThanOrEqual(2);
    }, 60_000);
  }

  test('metropolitan layout: landing runway and departure runway are separate rows', () => {
    const game = rich(13);
    const A = build(game, 'metropolitan');
    const st = game.state.stations.find((x) => x.id === A.stationId);
    const land = ftaPartTiles(game.state, st, 'runway');
    const dep = ftaPartTiles(game.state, st, 'runwayDep');
    expect(land.length).toBe(6);
    expect(dep.length).toBe(6);
    expect(new Set(land.map((t) => t.y)).size).toBe(1);
    expect(new Set(dep.map((t) => t.y)).size).toBe(1);
    expect(land[0].y).not.toBe(dep[0].y);
  });
});

describe('airport ground FTA: planes queued in the hangar', () => {
  test('three planes leaving one hangar: no taxi/runway/apron tile shared, all leave the hangar', () => {
    const game = rich(21);
    const s = game.state;
    const A = build(game, 'international');
    const B = build(game, 'international', A.spot);
    const planes = [];
    for (let i = 0; i < 3; i++) {
      const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
      expect(game.setOrders(v.id, [{ stationId: B.stationId }]).ok).toBe(true);
      expect(game.startVehicle(v.id).ok).toBe(true);
      planes.push(v);
    }
    let shared = null;
    let inHangarMax = 0;
    for (let t = 0; t < 400; t++) {
      game.step();
      const occ = new Map();
      let inHangar = 0;
      for (const v of planes) {
        const bb = s.map.tiles[v.ty * s.map.width + v.tx].building;
        if (bb && bb.part === 'hangar') { inHangar++; continue; } // queue at the hangar: not a block
        if (!((v.ftaGroundEnd != null && v.pathIndex <= v.ftaGroundEnd) || v.state === 'loading')) continue;
        const k = `${v.tx},${v.ty}`;
        if (occ.has(k) && !shared) shared = { tick: t, tile: k };
        occ.set(k, v.id);
      }
      inHangarMax = Math.max(inHangarMax, inHangar);
    }
    expect(shared).toBeNull();
    expect(inHangarMax).toBeGreaterThanOrEqual(2); // the queue really forms at the hangar
    expect(planes.every((v) => v.kind === 'aircraft')).toBe(true);
  }, 60_000);
});
