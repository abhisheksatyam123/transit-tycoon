/** Cargo distribution (cargodist setting): link graph, destinations, load filter, transfer, save round-trip. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { cargodistMode, rebuildGraph, nextHop, splitByDest, noteLeg, loadFilter, CD_CARGOS } from '../js/simulation/cargodist.js';
import { addWaiting, takeWaiting, waitingAmount } from '../js/simulation/stations.js';
import { loadCargo, unload, vehicleNextStop } from '../js/simulation/orders.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { setSetting } from '../js/simulation/settings.js';

/** Line A(10,24) - B(25,24) - C(40,24) of rail stations (the orderStops geometry); rail 13..39, depot (20,25). */
function threeStations(mode) {
  const g = flatGame(5);
  setSetting(g.state, 'cargodistDemandParity', false);
  if (mode) setSetting(g.state, 'cargodist', mode);
  const s = g.state;
  for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(25, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
    g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
  const depotId = s.depots[s.depots.length - 1].id;
  const [A, B, C] = s.stations.slice(-3);
  return { g, s, A, B, C, depotId };
}

describe('cargodist: link graph and demand', () => {
  test('setting off: no graph state, no destinations', () => {
    const { s, A, B } = threeStations(null);
    expect(cargodistMode(s)).toBe('off');
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    expect(s.cargoDist).toBeUndefined();
    expect(addWaiting(A, 'PASS', 10, 0, 0, 0, 4000, 0, null)).toBe(10);
    expect(A.cargo.PASS[0].dest).toBeUndefined();
  });

  test('legs build edges; demand splits over reachable destinations by supply', () => {
    const { s, A, B, C } = threeStations('symmetric');
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, A.id, [{ cargoId: 'PASS', capacity: 40 }]);
    expect(s.cargoDist.PASS.edges[`${A.id}>${B.id}`].used).toBe(40);
    // B and C have supply; A has none yet: A's demand goes to B and C weighted by supply
    B.cdSupply = { PASS: 300 }; C.cdSupply = { PASS: 100 }; A.cdSupply = { PASS: 200 };
    rebuildGraph(s, 'PASS', 'symmetric');
    const row = s.cargoDist.PASS.dem[A.id];
    expect(row.map(([d]) => d).sort()).toEqual([B.id, C.id].sort());
    const share = Object.fromEntries(row);
    // symmetric: both directions averaged, B (more supply) gets the larger share
    expect(share[B.id]).toBeGreaterThan(share[C.id]);
    expect(share[B.id] + share[C.id]).toBeCloseTo(1, 6);
    // next hop from A to C goes via B
    expect(nextHop(s, 'PASS', A.id, C.id)).toBe(B.id);
    expect(nextHop(s, 'PASS', A.id, B.id)).toBe(B.id);
  });

  test('passengers generated at A get destinations B or C in proportion to supply', () => {
    const { s, A, B, C } = threeStations('asymmetric');
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
    B.cdSupply = { PASS: 300 }; C.cdSupply = { PASS: 100 }; A.cdSupply = { PASS: 200 };
    rebuildGraph(s, 'PASS', 'asymmetric');
    const parts = splitByDest(s, A, 'PASS', 1000);
    const byDest = Object.fromEntries(parts.map((p) => [p.dest, p.amount]));
    expect(byDest[B.id] + byDest[C.id]).toBe(1000);
    expect(byDest[B.id]).toBeGreaterThan(byDest[C.id] * 2);
  });
});

describe('cargodist: loading, transfer and delivery', () => {
  test('a vehicle loads only parcels whose next hop is its next stop', () => {
    const { s, A, B, C } = threeStations('symmetric');
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
    rebuildGraph(s, 'PASS', 'symmetric');
    // parcels for B (next hop B) and for C (also next hop B from A); a fake destination D with no route
    addWaiting(A, 'PASS', 30, A.x, A.y, 0, 4000, 0, B.id);
    addWaiting(A, 'PASS', 20, A.x, A.y, 0, 4000, 0, C.id);
    const pred = loadFilter(s, A, 'PASS', C.id); // a vehicle going to C: C's parcels route via B, so they don't load here
    expect(pred({ dest: C.id })).toBe(false);
    const toB = loadFilter(s, A, 'PASS', B.id);
    expect(toB({ dest: B.id })).toBe(true);
    expect(toB({ dest: C.id })).toBe(true); // next hop from A toward C is B
    expect(waitingAmount(A, 'PASS')).toBe(50);
    expect(takeWaiting(A, 'PASS', 50, toB).amount).toBe(50);
  });

  test('a train A->B loads A passengers; C passengers ride to B and transfer there', () => {
    const { g, s, A, B, C, depotId } = threeStations('symmetric');
    const r1 = g.buyVehicle(depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_coach', wagons: 2, cargoId: 'PASS' });
    expect(r1.ok).toBe(true);
    const v = r1.vehicle;
    expect(g.setOrders(v.id, [{ stationId: A.id, full: false }, { stationId: B.id, full: false }]).ok).toBe(true);
    // the graph of this train's legs: A->B and B->A
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
    rebuildGraph(s, 'PASS', 'symmetric');
    const ctx = { state: s, emit() {} };
    // passengers at A destined for C (via B), 20 units, and at B destined for C
    addWaiting(A, 'PASS', 20, A.x, A.y, 0, 4000, 0, C.id);
    v.cargoId = 'PASS';
    v.atStationId = A.id;
    expect(vehicleNextStop(v)).toBe(B.id);
    loadCargo(ctx, v, A);
    expect(v.load.amount).toBe(20);
    expect(v.load.dests).toEqual({ [C.id]: 20 });
    // arrive at B: C is not accepted at B (no houses); transfer keeps the parcel waiting at B for a C-bound vehicle
    v.atStationId = B.id;
    unload(ctx, v, B);
    // the train's next stop is A, but the packet's next hop from B is C: it transfers to B as waiting cargo
    expect(v.load.amount).toBe(0);
    expect(waitingAmount(B, 'PASS')).toBe(20);
    expect(B.cargo.PASS[0].dest).toBe(C.id);
  });
});

describe('cargodist: save and load', () => {
  test('link graph and parcel destinations survive a save round-trip', () => {
    const { s, A, B, C } = threeStations('symmetric');
    noteLeg(s, A, B.id, [{ cargoId: 'PASS', capacity: 40 }]);
    noteLeg(s, B, C.id, [{ cargoId: 'PASS', capacity: 40 }]);
    rebuildGraph(s, 'PASS', 'symmetric');
    addWaiting(A, 'PASS', 15, A.x, A.y, 0, 4000, 0, C.id);
    addWaiting(A, 'PASS', 7, A.x, A.y, 3, 4000, 0, null);
    const before = JSON.stringify([s.cargoDist, A.cargo.PASS]);
    s.scenario = s.scenario || null;
    const json = serializeState(s);
    const back = parseState(json);
    const B2 = back.stations.find((x) => x.id === A.id);
    expect(JSON.stringify([back.cargoDist, B2.cargo.PASS])).toBe(before);
    expect(CD_CARGOS).toEqual(['PASS', 'MAIL']);
  });
});
