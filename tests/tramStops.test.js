/** Tram stops and overhead wires (gap #27): tram-only stop placement, tram vs bus stop rules, save roundtrip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { orderGoals, stopKindOk, stopKindFor } from '../js/simulation/routing.js';
import { findStation } from '../js/simulation/state.js';

const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

/** Tram track y=24 x 20..30, a road depot on the west end, one electric tram; returns the tram and a tram stop at x=24. */
function tramSetup(seed = 7) {
  const g = flatGame(seed);
  expect(g.buildTram(20, 24, 30, 24).ok).toBe(true);
  const dep = g.buildDepot(19, 24, 'road', 2); // exit east onto the tram track at x=20
  expect(dep.ok).toBe(true);
  const stop = g.buildRoadStop(24, 24, 'tram', { player: true });
  expect(stop.ok).toBe(true);
  return { g, stop, depotId: dep.depotId };
}

describe('tram stop placement', () => {
  test('builds on straight tram track, keeps the tram bits, adds no road bits', () => {
    const { g, stop } = tramSetup();
    const t = tileAt(g, 24, 24);
    expect(t.building).toMatchObject({ type: 'station', kind: 'tram', axis: 'x' });
    expect(t.tram).toBeTruthy();
    expect(t.road | 0).toBe(0);
    expect(findStation(g.state, stop.stationId).kinds.tram).toBe(true);
  });

  test('refused on bare land and on corners or junctions of tram track', () => {
    const g = flatGame(7);
    expect(g.buildRoadStop(24, 24, 'tram').ok).toBe(false); // no tram track
    g.buildTram(20, 24, 24, 24);
    g.buildTram(24, 24, 24, 28); // T-junction at 24,24
    expect(g.buildRoadStop(24, 24, 'tram').ok).toBe(false);
  });

  test('dry run prices the stop without building it', () => {
    const g = flatGame(7);
    g.buildTram(20, 24, 26, 24);
    const r = g.buildRoadStop(22, 24, 'tram', { dryRun: true });
    expect(r.ok).toBe(true);
    expect(tileAt(g, 22, 24).building).toBeFalsy();
  });

  test('bus stops keep their old behaviour (a bus stop on tram track still adds road)', () => {
    const g = flatGame(7);
    g.buildTram(20, 24, 26, 24);
    expect(g.buildRoadStop(22, 24, 'bus').ok).toBe(true);
    expect(tileAt(g, 22, 24).road).toBeTruthy();
    expect(tileAt(g, 22, 24).tram).toBeTruthy();
  });

  test('a station kinds flag stays absent until a tram stop exists (old saves unchanged)', () => {
    const g = flatGame(7);
    g.buildRoad(20, 24, 26, 24);
    const st = g.buildRoadStop(22, 24, 'bus').stationId;
    expect('tram' in findStation(g.state, st).kinds).toBe(false);
  });
});

describe('tram stop routing rules', () => {
  test('trams stop at tram stops and at bus stops; buses stop only at bus stops', () => {
    const tram = { kind: 'road', roadType: 'tram', cargoId: 'PASS' };
    const bus = { kind: 'road', roadType: 'bus', cargoId: 'PASS' };
    expect(stopKindFor(tram)).toBe('tram');
    expect(stopKindOk(tram, 'tram')).toBe(true);
    expect(stopKindOk(tram, 'bus')).toBe(true);
    expect(stopKindOk(tram, 'truck')).toBe(false);
    expect(stopKindOk(bus, 'bus')).toBe(true);
    expect(stopKindOk(bus, 'tram')).toBe(false);
  });

  test('orderGoals: a tram order targets tram stop tiles, a bus order does not', () => {
    const { g, stop } = tramSetup();
    // a tram-only station: only the tram stop tile is a goal for trams
    const tramV = { kind: 'road', roadType: 'tram', cargoId: 'PASS', orders: [{ stationId: stop.stationId }], orderIndex: 0 };
    expect(orderGoals(g.state, tramV)).toEqual([{ x: 24, y: 24 }]);
    // a bus-only station: buses find it, a tram-only station gives buses no goals
    const busV = { kind: 'road', roadType: 'bus', cargoId: 'PASS', orders: [{ stationId: stop.stationId }], orderIndex: 0 };
    expect(orderGoals(g.state, busV)).toEqual([]);
  });

  test('bus orders cannot target a tram-only station; tram orders can target it', () => {
    const { g, stop, depotId } = tramSetup();
    const tram = g.buyVehicle(depotId, { modelId: 'tram_electric' });
    expect(tram.ok).toBe(true);
    expect(g.setOrders(tram.vehicle.id, [{ stationId: stop.stationId, full: false }]).ok).toBe(true);
    const bus = g.buyVehicle(depotId, { modelId: 'bus_city' });
    expect(bus.ok).toBe(true);
    expect(g.setOrders(bus.vehicle.id, [{ stationId: stop.stationId, full: false }]).ok).toBe(false);
  });
});

describe('tram stop save', () => {
  test('tram stop tile, station kinds and tram track round-trip', () => {
    const { g, stop } = tramSetup();
    const st = parseState(serializeState(g.state));
    const W = st.map.width;
    expect(st.map.tiles[24 * W + 24].building).toMatchObject({ type: 'station', kind: 'tram', stationId: stop.stationId });
    expect(st.map.tiles[24 * W + 24].tram).toBe(tileAt(g, 24, 24).tram);
    expect(findStation(st, stop.stationId).kinds.tram).toBe(true);
  });

  test('a save without any tram stop has no tram station kind (old saves load unchanged)', () => {
    const g = flatGame(7);
    g.buildRoad(20, 24, 26, 24);
    g.buildRoadStop(22, 24, 'bus');
    const st = parseState(serializeState(g.state));
    const s = st.stations[0];
    expect(s.kinds.tram).toBeUndefined();
    expect(s.kinds.bus).toBe(true);
  });
});
