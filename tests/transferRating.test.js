/** #99: transfer-only cargo (no lastPickup at the station) is rated and decays daily, like OpenLoco Station::updateCargo. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { updateCargo } from '../js/simulation/loco/station.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';

function setup() {
  const g = flatGame(11);
  const L = coalLine(g);
  return { g, L, st: L.b };
}

describe('transfer-only cargo rating', () => {
  test('station with transfer cargo and no pickup gets a rating entry on the daily update', () => {
    const { g, st } = setup();
    expect(st.lastPickup.COAL).toBeUndefined();
    addWaiting(st, 'COAL', 20, st.x, st.y, g.state.tick, 9999, 0, null, undefined, true);
    expect(st.rating200?.COAL).toBeUndefined();
    updateCargo(g, st);
    expect(st.rating200.COAL).toBeDefined();
    expect(st.cargoAge.COAL).toBe(1);
    expect(st.rating.COAL).toBe(Math.round(st.rating200.COAL / 2));
  });

  test('transfer-only cargo ages each day', () => {
    const { g, st } = setup();
    addWaiting(st, 'COAL', 20, st.x, st.y, g.state.tick, 9999, 0, null, undefined, true);
    for (let d = 0; d < 5; d++) updateCargo(g, st);
    expect(st.cargoAge.COAL).toBe(5);
  });

  test('no waiting units and no pickup: nothing is created', () => {
    const { g, st } = setup();
    updateCargo(g, st);
    expect(st.rating200?.COAL).toBeUndefined();
    expect(st.cargoAge?.COAL).toBeUndefined();
  });

  test('transfer does not make the station a production destination (no lastPickup set)', () => {
    const { g, st } = setup();
    addWaiting(st, 'COAL', 20, st.x, st.y, g.state.tick, 9999, 0, null, undefined, true);
    updateCargo(g, st);
    expect(st.lastPickup.COAL).toBeUndefined();
    expect(waitingAmount(st, 'COAL')).toBeGreaterThan(0);
  });
});
