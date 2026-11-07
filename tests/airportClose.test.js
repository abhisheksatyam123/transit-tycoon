/** Open/close airport (OpenTTD CmdOpenCloseAirport, station_cmd.cpp:2834; AirportClosed in aircraft_cmd.cpp:1674):
 * a closed airport refuses landings (aircraft hold and land once reopened); rivals are refused; save/load keeps it. */
import { describe, expect, test } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { AIRPORT_TYPES } from '../js/simulation/airportTypes.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { ftaRunwayBusy } from '../js/simulation/airportGround.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

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
const stOf = (game, id) => game.state.stations.find((s) => s.id === id);

describe('open/close airport', () => {
  test('command: owner-checked, only airports, lazy flag (absent = open)', () => {
    const game = rich();
    const A = build(game, 'small');
    const st = stOf(game, A.stationId);
    expect('airportClosed' in st).toBe(false);
    expect(game.setAirportClosed(A.stationId, true).ok).toBe(true);
    expect(st.airportClosed).toBe(true);
    expect(game.setAirportClosed(A.stationId, false).ok).toBe(true);
    expect('airportClosed' in st).toBe(false);
    // rival-owned airport: refused for the player
    st.ownerId = 'rival1';
    expect(game.setAirportClosed(A.stationId, true).ok).toBe(false);
    expect('airportClosed' in st).toBe(false);
    delete st.ownerId;
    // a plain rail station is not an airport
    const r = game.buildRailStation(30, 60, 'x', 2);
    if (r.ok) expect(game.setAirportClosed(r.stationId, true).ok).toBe(false);
    expect(game.setAirportClosed(9999, true).ok).toBe(false);
  });

  test('closed airport: no landing, aircraft holds; reopened: lands', () => {
    const game = rich();
    const A = build(game, 'small');
    const B = build(game, 'small', A.spot);
    const st = stOf(game, B.stationId);
    expect(game.setAirportClosed(B.stationId, true).ok).toBe(true);
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    expect(game.setOrders(v.id, [{ stationId: B.stationId }]).ok).toBe(true);
    expect(game.startVehicle(v.id).ok).toBe(true);
    const arrived = () => v.state === 'loading' && v.tx >= st.tiles[0].x && v.ty >= st.tiles[0].y
      && st.tiles.some((t) => t.x === v.tx && t.y === v.ty);
    let landedWhileClosed = false, holding = 0;
    for (let t = 0; t < TICKS(60); t++) {
      game.step();
      if (arrived()) landedWhileClosed = true;
      if (v.hold) holding++;
      if (landedWhileClosed) break;
    }
    expect(landedWhileClosed).toBe(false);
    expect(holding).toBeGreaterThan(0);
    expect(v.kind).toBe('aircraft');
    expect(game.setAirportClosed(B.stationId, false).ok).toBe(true);
    let landed = false;
    for (let t = 0; t < TICKS(60) && !landed; t++) {
      game.step();
      landed = arrived();
    }
    expect(landed).toBe(true);
  });

  test('closed airport: runway reports busy (landings refused); open airport: runway free', () => {
    const game = rich();
    const A = build(game, 'small');
    const st = stOf(game, A.stationId);
    const v = game.buyVehicle(A.depotId, { modelId: 'ac_tu134' }).vehicle;
    expect(ftaRunwayBusy(game.state, st, v)).toBe(false);
    expect(game.setAirportClosed(A.stationId, true).ok).toBe(true);
    expect(ftaRunwayBusy(game.state, st, v)).toBe(true);
    expect(game.setAirportClosed(A.stationId, false).ok).toBe(true);
    expect(ftaRunwayBusy(game.state, st, v)).toBe(false);
  });

  test('save/load keeps the closed flag; old saves (no flag) load open', () => {
    const game = rich();
    const A = build(game, 'small');
    game.setAirportClosed(A.stationId, true);
    const loaded = parseState(serializeState(game.state));
    const st = loaded.stations.find((x) => x.id === A.stationId);
    expect(st.airportClosed).toBe(true);
    const open = rich();
    const B = build(open, 'small');
    const loaded2 = parseState(serializeState(open.state));
    expect('airportClosed' in loaded2.stations.find((x) => x.id === B.stationId)).toBe(false);
  });
});

const TICKS = (days) => days * TICKS_PER_DAY;
