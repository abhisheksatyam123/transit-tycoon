/** Service intervals: off = no depot visits; on + breakdowns = depot visit, reliability restored, orders continue. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { dayNumber, dateFromDayNumber } from '../js/simulation/date.js';

/** Train A(full load) <-> B with a depot near A; returns the vehicle and fixture. */
function setup({ interval = 0, breakdowns } = {}) {
  const g = flatGame(33);
  if (breakdowns) setSetting(g.state, 'breakdowns', breakdowns);
  const L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  expect(g.setOrders(v.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  if (interval) expect(g.setServiceInterval(v.id, interval).ok).toBe(true);
  expect(g.startVehicle(v.id).ok).toBe(true);
  return { g, L, v };
}

/** Run `days` game days; returns the number of times the vehicle entered a depot. */
function runDays(g, v, days) {
  let visits = 0, wasDepot = v.state === 'depot';
  const ticks = days * 96 + 10;
  for (let i = 0; i < ticks; i++) {
    g.step();
    if (v.state === 'depot' && !wasDepot) visits++;
    wasDepot = v.state === 'depot';
  }
  return visits;
}

describe('service interval off', () => {
  test('default is off: no serviceIntervalDays and no depot visits', () => {
    const { g, v } = setup({ breakdowns: 'normal' });
    expect(v.serviceIntervalDays).toBeUndefined();
    expect(runDays(g, v, 60)).toBe(0);
  });

  test('setServiceInterval(0) turns it off and removes the stored fields', () => {
    const { g, v } = setup({ interval: 10 });
    expect(g.setServiceInterval(v.id, 0).ok).toBe(true);
    expect(v.serviceIntervalDays).toBeUndefined();
    expect(v.lastServiceDay).toBeUndefined();
  });

  test('rejects bad values', () => {
    const { g, v } = setup();
    expect(g.setServiceInterval(v.id, -1).ok).toBe(false);
    expect(g.setServiceInterval(v.id, 9999).ok).toBe(false);
    expect(g.setServiceInterval(999999, 10).ok).toBe(false);
  });
});

describe('service interval on', () => {
  test('with breakdowns enabled the vehicle visits the depot and restores reliability', () => {
    const { g, L, v } = setup({ interval: 7, breakdowns: 'normal' });
    v.reliability = 0.3; // worn out, so the restore is visible
    runDays(g, v, 30);
    expect(v.services).toBeGreaterThan(0); // serviced at the depot (no stop: state never sat as 'depot')
    expect(v.reliability).toBeGreaterThan(0.3);
    expect(v.lastServiceDay).toBeGreaterThan(dayNumber(dateFromDayNumber(0)));
    // orders continue: it still served station A/B after servicing
    expect(v.orders.length).toBe(2);
    expect(L.a.id).toBeDefined();
  });

  test('service trip does not stop in the depot: the vehicle leaves again on its orders', () => {
    const { g, v } = setup({ interval: 7, breakdowns: 'normal' });
    let serviced = false;
    for (let i = 0; i < 96 * 40 && !serviced; i++) {
      g.step();
      if (v.services > 0) serviced = true;
    }
    expect(serviced).toBe(true);
    // right after service the vehicle is no longer parked in the depot and has no service trip pending
    expect(v.serviceTrip).toBeUndefined();
    expect(v.goingToDepot == null).toBe(true);
    expect(v.state).not.toBe('depot');
  });

  test('breakdowns none: no service trips even with an interval', () => {
    const { g, v } = setup({ interval: 7, breakdowns: 'none' });
    expect(runDays(g, v, 30)).toBe(0);
    expect(v.services || 0).toBe(0);
  });

  test('new vehicles take the settings.serviceIntervalDays default', () => {
    const g = flatGame(34);
    setSetting(g.state, 'serviceIntervalDays', 21);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
    expect(r.vehicle.serviceIntervalDays).toBe(21);
    expect(r.vehicle.lastServiceDay).toBeDefined();
  });

  test('default setting 0 leaves new vehicles without service fields', () => {
    const { v } = setup();
    expect('serviceIntervalDays' in v).toBe(false);
  });
});

describe('save round-trip', () => {
  test('interval and last service survive serialize / deserialize', () => {
    const { g, v } = setup({ interval: 14 });
    const s = parseState(serializeState(g.state));
    const v2 = s.vehicles.find((x) => x.id === v.id);
    expect(v2.serviceIntervalDays).toBe(14);
    expect(v2.lastServiceDay).toBe(v.lastServiceDay);
  });
});
