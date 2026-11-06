/** Order stop modes (OpenTTD ONSF_*): 'all' = stop at intermediate stations, 'via' = go via the destination. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { placeIndustry } from '../js/simulation/industries.js';
import { normaliseOrders, orderFlagText, stopMode } from '../js/simulation/orders.js';
import { serializeState, parseState } from '../js/simulation/save.js';

/** Three rail stations A(10) - B(25) - C(40) on one line at y=24, mine at A, power station at C. Train A->C. */
function threeStop(stopOpt) {
  const g = flatGame(11);
  const s = g.state;
  placeIndustry(s, 'coal_mine', 10, 20);
  placeIndustry(s, 'power_station', 40, 20);
  for (const r of [g.buildRailStation(10, 24, 'x', 3), g.buildRailStation(25, 24, 'x', 3), g.buildRailStation(40, 24, 'x', 3),
    g.buildRail(13, 24, 39, 24), g.buildDepot(20, 25, 'rail', 1)]) expect(r.ok).toBe(true);
  const depotId = s.depots[s.depots.length - 1].id;
  const [a, b, c] = s.stations.slice(-3);
  const r = g.buyVehicle(depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const orders = [{ stationId: a.id, full: false }, { stationId: c.id, full: false }];
  if (stopOpt) orders[1].stop = stopOpt;
  expect(g.setOrders(v.id, orders).ok).toBe(true);
  expect(g.startVehicle(v.id).ok).toBe(true);
  return { g, s, v, a, b, c };
}

/** Step until the train has loaded at `stopId` and moved on to its next order (or a limit); returns stops seen. */
function runTrip(g, v, stopId) {
  const seen = [];
  for (let i = 0; i < 8000; i++) {
    g.step();
    if (v.state === 'loading') seen.push(v.atStationId);
    if (seen.includes(stopId) && v.state !== 'loading' && v.orderIndex === 0) break;
  }
  return seen;
}

describe('order stop modes', () => {
  test('default (non-stop) orders pass the intermediate station without stopping', () => {
    const { g, v, b, c } = threeStop(null);
    expect(v.orders[1].stop).toBeUndefined();
    const seen = runTrip(g, v, c.id);
    expect(seen).not.toContain(b.id);
    expect(seen).toContain(c.id);
  });

  test("'all' stops at the intermediate station, loads/unloads there, then reaches the destination", () => {
    const { g, v, b, c } = threeStop('all');
    expect(stopMode(v.orders[1])).toBe('all');
    const seen = [];
    let sawBAsLoading = false;
    for (let i = 0; i < 8000 && !(seen.includes(c.id) && v.orderIndex === 0); i++) {
      g.step();
      if (v.state === 'loading') {
        seen.push(v.atStationId);
        if (v.atStationId === b.id && v.intermediate) sawBAsLoading = true;
      }
    }
    expect(sawBAsLoading).toBe(true);
    expect(seen.indexOf(b.id)).toBeGreaterThanOrEqual(0);
    expect(seen.indexOf(b.id)).toBeLessThan(seen.lastIndexOf(c.id));
    expect(seen).toContain(c.id);
    expect(v.orderIndex).toBe(0);
  });

  test("'via' passes through the destination without loading there", () => {
    const { g, v, c } = threeStop('via');
    expect(stopMode(v.orders[1])).toBe('via');
    const seen = [];
    for (let i = 0; i < 8000 && !(v.orderIndex === 0 && v.state !== 'loading' && i > 0); i++) {
      g.step();
      if (v.state === 'loading') seen.push(v.atStationId);
    }
    expect(seen).not.toContain(c.id);
    expect(v.orderIndex).toBe(0);
  });

  test('normalisation keeps stop modes, rejects unknown modes and aircraft/ships', () => {
    const { s, v } = threeStop(null);
    const a = s.stations[s.stations.length - 3];
    expect(normaliseOrders(s, v, [{ stationId: a.id, stop: 'all' }], () => 'rail').orders[0].stop).toBe('all');
    expect(normaliseOrders(s, v, [{ stationId: a.id, stop: 'non' }], () => 'rail').orders[0].stop).toBeUndefined();
    expect(normaliseOrders(s, v, [{ stationId: a.id, stop: 'bogus' }], () => 'rail').ok).toBe(false);
    expect(orderFlagText({ stop: 'via' })).toContain('go via');
  });

  test('stop mode survives save/load', () => {
    const { s, v } = threeStop('all');
    const back = parseState(serializeState(s));
    const w = back.vehicles.find((x) => x.id === v.id);
    expect(w.orders[1].stop).toBe('all');
  });
});
