/** Airport types: small airport (4x3), heliport (1x1), helicopters, plane refusal, save/load, world hash. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { AIRPORT_TYPES, airportTypeId, vehicleFitsAirport } from '../js/simulation/airportTypes.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { catchRadius } from '../js/simulation/stations.js';
import { createHash } from 'node:crypto';

/** Clear, flat, town-free game with money. */
function freshGame(seed = 5) {
  const game = Game.create({ seed, width: 96, height: 96 });
  game.state.company.money = 5_000_000;
  game.state.date.year = 1970; // helicopters (1963+) and jets buyable; Li-2 obsolete
  return game;
}

/** First spot (scanning from `from`) where a type can be built (dry run), skipping `avoid`. */
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

/** Build one airport of `type` on a generated map. */
function build(game, type, avoid = null) {
  const spot = findSpot(game, type, { x: 4, y: 4 }, avoid);
  if (!spot) throw new Error(`no spot for ${type}`);
  const r = game.buildAirport(spot.x, spot.y, { type });
  if (!r.ok) throw new Error(r.error);
  return { ...r, ...spot };
}

describe('airport types: build, footprint, cost', () => {
  test('small airport is 4x3, cheaper than city, tagged on tiles and depot', () => {
    const game = freshGame();
    const r = build(game, 'small');
    expect(r.cost).toBe(AIRPORT_TYPES.small.cost);
    expect(r.cost).toBeLessThan(AIRPORT_TYPES.city.cost);
    let n = 0;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) {
      const b = game.tile(r.x + dx, r.y + dy).building;
      expect(b.kind).toBe('airport');
      expect(b.airportType).toBe('small');
      n++;
    }
    expect(n).toBe(12);
    expect(game.tile(r.x + 4, r.y).building).toBeNull();
    const dep = game.state.depots.find((d) => d.id === r.depotId);
    expect(dep.kind).toBe('air');
    expect(dep.airportType).toBe('small');
  });

  test('heliport is 1x1 with a helipad and an air depot', () => {
    const game = freshGame();
    const r = build(game, 'heliport');
    const b = game.tile(r.x, r.y).building;
    expect(b.part).toBe('helipad');
    expect(b.airportType).toBe('heliport');
    expect(game.tile(r.x + 1, r.y).building).toBeNull();
    expect(game.state.depots.find((d) => d.id === r.depotId).x).toBe(r.x);
  });

  test('city airport keeps the 6x4 footprint and carries no type field (saves unchanged)', () => {
    const game = freshGame();
    const r = build(game, 'city');
    expect(r.cost).toBe(AIRPORT_TYPES.city.cost);
    const b = game.tile(r.x + 5, r.y + 3).building;
    expect(b.kind).toBe('airport');
    expect('airportType' in b).toBe(false);
    expect(airportTypeId(b)).toBe('city');
    expect(game.tile(r.x + 6, r.y).building).toBeNull();
  });

  test('heliport is a single tile, so a height step does not block it', () => {
    const game = freshGame();
    const spot = findSpot(game, 'heliport');
    const t = game.tile(spot.x, spot.y);
    t.height = t.height + 3;
    const r = game.buildAirport(spot.x, spot.y, { type: 'heliport', dryRun: true });
    expect(r.ok).toBe(true); // single tile: no height difference to compare
  });

  test('demolishing a small airport removes its whole footprint and depot', () => {
    const game = freshGame();
    const r = build(game, 'small');
    const before = game.state.depots.length;
    const res = game.demolish(r.x, r.y + 1, r.x, r.y + 1);
    expect(res.ok).toBe(true);
    expect(game.state.depots.length).toBe(before - 1);
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) expect(game.tile(r.x + dx, r.y + dy).building).toBeNull();
  });
});

describe('helicopters and plane refusal', () => {
  test('planes are refused at a heliport, helicopters are not', () => {
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_tu134, 'heliport')).toBe(false);
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_tricario, 'heliport')).toBe(true);
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_tricario, 'city')).toBe(true);
  });

  test('small airports take small planes only', () => {
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_tu134, 'small')).toBe(true);   // 80 seats
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_il86, 'small')).toBe(false);   // 300 seats
  });

  test('a plane cannot be ordered to a heliport-only station', () => {
    const game = freshGame();
    const h = build(game, 'heliport');
    const city = build(game, 'city', h);
    const plane = game.buyVehicle(city.depotId, { modelId: 'ac_tu134' });
    expect(plane.ok).toBe(true);
    const hSt = game.state.stations.find((s) => s.id === h.stationId);
    const r = game.setOrders(plane.vehicle.id, [{ stationId: hSt.id }]);
    expect(r.ok).toBe(false);
  });

  test('a plane cannot be bought at a heliport hangar', () => {
    const game = freshGame();
    const h = build(game, 'heliport');
    expect(game.buyVehicle(h.depotId, { modelId: 'ac_tu134' }).ok).toBe(false);
    expect(game.buyVehicle(h.depotId, { modelId: 'ac_tricario' }).ok).toBe(true);
  });

  test('helicopter round trip heliport -> airport earns money', () => {
    const game = freshGame();
    const h = build(game, 'heliport');
    const city = build(game, 'city', h);
    const hSt = game.state.stations.find((s) => s.id === h.stationId);
    const cSt = game.state.stations.find((s) => s.id === city.stationId);
    cSt.cargo.PASS = [{ amount: 200, sourceX: cSt.x, sourceY: cSt.y, sinceTick: 0 }];
    cSt.accepts = { PASS: true, MAIL: true };
    hSt.cargo.PASS = [{ amount: 200, sourceX: hSt.x, sourceY: hSt.y, sinceTick: 0 }];
    hSt.accepts = { PASS: true, MAIL: true };
    const heli = game.buyVehicle(h.depotId, { modelId: 'ac_tricario' }).vehicle;
    game.setOrders(heli.id, [{ stationId: hSt.id }, { stationId: cSt.id }]);
    game.startVehicle(heli.id);
    const money0 = game.state.company.money;
    let flew = false, maxAlt = 0;
    for (let t = 0; t < 4000 && game.state.company.money <= money0; t++) {
      game.step();
      if (heli.alt > 0 && heli.state === 'running') flew = true;
      maxAlt = Math.max(maxAlt, heli.alt || 0);
    }
    expect(flew).toBe(true);
    expect(maxAlt).toBeGreaterThan(0.9);
    expect(game.state.company.money).toBeGreaterThan(money0);
  });
});

describe('save/load and world hash', () => {
  test('airport types survive save/load', () => {
    const game = freshGame();
    const s = build(game, 'small');
    const h = build(game, 'heliport', s);
    const game2 = Game.deserialize(game.serialize());
    expect(game2.tile(s.x, s.y).building.airportType).toBe('small');
    expect(game2.tile(h.x, h.y).building.airportType).toBe('heliport');
    expect(game2.state.depots.find((d) => d.id === h.depotId).airportType).toBe('heliport');
  });

  test('old saves without an airportType field load as city', () => {
    const game = freshGame();
    const city = build(game, 'city');
    const obj = JSON.parse(game.serialize());
    for (const st of obj.stations || []) for (const t of st.tiles || []) delete t.airportType;
    for (const d of obj.depots || []) delete d.airportType;
    const g2 = Game.deserialize(JSON.stringify(obj));
    const b = g2.tile(city.x, city.y).building;
    expect(b.kind).toBe('airport');
    expect(airportTypeId(b)).toBe('city');
  });

  test('a random world without airports hashes as pinned (see MP note) (seed 1, 60 days)', () => {
    const g = Game.create({ seed: 1 });
    g.stepDays(60);
    // Raw state, not the save encoding: a save-format change (e.g. dropping per-tick traffic scratch)
    // must not move the pin.
    const h = createHash('sha256').update(JSON.stringify(g.state)).digest('hex').slice(0, 16);
    // MP: ind.hist (monthly industry production history, saved) changed the serialized state; the
    // simulation itself is unchanged (the hash with hist stripped is still 211ce1138012979d).
    expect(h).toBe('e66b684174510b6b');
  });
});

describe('new airport types (OpenTTD sizes, years, catchment, aircraft)', () => {
  /** 1995: all new types (commuter 1983 .. international 1990) are open; Tu-134 still buyable. */
  const newGame = () => { const g = freshGame(); g.state.date.year = 1995; return g; };
  const NEW = ['commuter', 'metropolitan', 'international', 'helidepot', 'helistation'];
  test('OpenTTD footprints, years and catchments', () => {
    expect([AIRPORT_TYPES.commuter.w, AIRPORT_TYPES.commuter.h, AIRPORT_TYPES.commuter.introYear, AIRPORT_TYPES.commuter.catchment]).toEqual([5, 4, 1983, 4]);
    expect([AIRPORT_TYPES.metropolitan.w, AIRPORT_TYPES.metropolitan.h, AIRPORT_TYPES.metropolitan.introYear, AIRPORT_TYPES.metropolitan.catchment]).toEqual([6, 6, 1980, 6]);
    expect([AIRPORT_TYPES.international.w, AIRPORT_TYPES.international.h, AIRPORT_TYPES.international.introYear, AIRPORT_TYPES.international.catchment]).toEqual([7, 7, 1990, 8]);
    expect([AIRPORT_TYPES.helidepot.w, AIRPORT_TYPES.helidepot.h, AIRPORT_TYPES.helidepot.introYear, AIRPORT_TYPES.helidepot.catchment]).toEqual([2, 2, 1976, 4]);
    expect([AIRPORT_TYPES.helistation.w, AIRPORT_TYPES.helistation.h, AIRPORT_TYPES.helistation.introYear, AIRPORT_TYPES.helistation.catchment]).toEqual([4, 2, 1980, 4]);
  });

  test('each new type builds its full footprint, tagged, with an air depot, and costs more for more tiles', () => {
    for (const type of NEW) {
      const game = newGame(); // one airport per game: neighbours would join the station
      const t = AIRPORT_TYPES[type];
      const r = build(game, type);
      expect(r.cost).toBe(t.cost);
      let n = 0;
      for (let dy = 0; dy < t.h; dy++) for (let dx = 0; dx < t.w; dx++) {
        const b = game.tile(r.x + dx, r.y + dy).building;
        expect(b.kind).toBe('airport');
        expect(b.airportType).toBe(type);
        n++;
      }
      expect(n).toBe(t.w * t.h);
      expect(game.tile(r.x + t.w, r.y).building).toBeNull();
      expect(game.state.depots.find((d) => d.id === r.depotId).kind).toBe('air');
    }
    expect(AIRPORT_TYPES.helidepot.cost).toBeLessThan(AIRPORT_TYPES.commuter.cost);
    expect(AIRPORT_TYPES.international.cost).toBeGreaterThan(AIRPORT_TYPES.metropolitan.cost);
  });

  test('a build before the intro year is refused, and allowed from it', () => {
    const game = newGame();
    const spot = findSpot(game, 'commuter'); // 1995: open
    game.state.date.year = 1975;
    expect(game.buildAirport(spot.x, spot.y, { type: 'commuter' }).ok).toBe(false);
    expect(game.buildAirport(spot.x, spot.y, { type: 'commuter', dryRun: true }).ok).toBe(false);
    game.state.date.year = 1983;
    expect(game.buildAirport(spot.x, spot.y, { type: 'commuter', dryRun: true }).ok).toBe(true);
    expect(game.buildAirport(spot.x, spot.y, { type: 'helidepot', dryRun: true }).ok).toBe(true);
  });

  test('helidepot and helistation take helicopters only; commuter refuses large planes', () => {
    for (const type of ['helidepot', 'helistation']) {
      expect(vehicleFitsAirport(MODEL_BY_ID.ac_tu134, type)).toBe(false);
      expect(vehicleFitsAirport(MODEL_BY_ID.ac_li2, type)).toBe(false);
      expect(vehicleFitsAirport(MODEL_BY_ID.ac_tricario, type)).toBe(true);
    }
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_tu134, 'commuter')).toBe(true);   // 80 seats
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_il86, 'commuter')).toBe(false);   // 300 seats
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_tricario, 'commuter')).toBe(true);
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_il86, 'metropolitan')).toBe(true);
    expect(vehicleFitsAirport(MODEL_BY_ID.ac_il86, 'international')).toBe(true);
  });

  test('a plane cannot be ordered to a helidepot', () => {
    const game = newGame();
    const hd = build(game, 'helidepot');
    const city = build(game, 'city', hd);
    const plane = game.buyVehicle(city.depotId, { modelId: 'ac_tu134' });
    expect(plane.ok).toBe(true);
    const st = game.state.stations.find((s) => s.id === hd.stationId);
    expect(game.setOrders(plane.vehicle.id, [{ stationId: st.id }]).ok).toBe(false);
  });

  test('catchment radius follows the type (commuter 4, metropolitan 6, international 8)', () => {
    for (const [type, radius] of [['commuter', 4], ['metropolitan', 6], ['international', 8]]) {
      const game = newGame();
      const r = build(game, type);
      expect(catchRadius(game.state, { kind: 'airport', x: r.x, y: r.y })).toBe(radius);
    }
  });

  test('aircraft fly between a metropolitan and a commuter airport and earn money', () => {
    const game = newGame();
    const metro = build(game, 'metropolitan');
    const commuter = build(game, 'commuter', metro);
    const mSt = game.state.stations.find((s) => s.id === metro.stationId);
    const cSt = game.state.stations.find((s) => s.id === commuter.stationId);
    expect(mSt.id).not.toBe(cSt.id);
    mSt.cargo.PASS = [{ amount: 400, sourceX: mSt.x, sourceY: mSt.y, sinceTick: 0 }];
    mSt.accepts = { PASS: true, MAIL: true };
    cSt.accepts = { PASS: true, MAIL: true };
    const v = game.buyVehicle(metro.depotId, { modelId: 'ac_tu134' }).vehicle; // 80 seats: the commuter limit
    expect(game.setOrders(v.id, [{ stationId: mSt.id }, { stationId: cSt.id }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    const money0 = game.state.company.money;
    let flew = false;
    for (let t = 0; t < 3000 && game.state.company.money <= money0; t++) {
      game.step();
      // monthly town/industry passes recompute acceptance from houses in the catchment (none here): hold it
      cSt.accepts = { PASS: true, MAIL: true };
      if (v.alt > 0 && v.state === 'running') flew = true;
    }
    expect(flew).toBe(true);
    expect(game.state.company.money).toBeGreaterThan(money0);
  });
});
