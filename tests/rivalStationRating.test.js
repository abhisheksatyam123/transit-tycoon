/** OpenLoco Station.cpp:790: a non-player station is forced to cargo rating 120 only while it has neither
 * StationFlags::flag_7 (pickup, VehicleHead.cpp:3464) nor flag_8 (delivery, VehicleHead.cpp:3134). */
import { describe, test, expect } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { createStation } from '../js/simulation/stations.js';
import { updateCargo, rivalRatingOverride, stationCargoRatingDetail } from '../js/simulation/loco/station.js';
import { serializeState, parseState } from '../js/simulation/save.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

function setup() {
  const g = Game.create(small);
  const st = createStation(g.state, 5, 5);
  st.lastPickup = st.lastPickup || {};
  st.rating = st.rating || {};
  return { g, st };
}

describe('rival station rating override (Station.cpp:790, lazy flags)', () => {
  test('override is active before any service (old saves: flags absent)', () => {
    const { g, st } = setup();
    st.ownerId = 7;
    expect(rivalRatingOverride(st)).toBe(true);
    expect(stationCargoRatingDetail(g.state, st, 'PASS').steps.some((s) => s.key === 'npc')).toBe(true);
  });

  test('pickup lifts the override; no-flag rival stays forced', () => {
    const { st } = setup();
    st.ownerId = 7;
    expect(rivalRatingOverride(st)).toBe(true);
    st.pickedUp = 1;
    expect(rivalRatingOverride(st)).toBe(false);
  });

  test('delivery alone lifts the override', () => {
    const { st } = setup();
    st.ownerId = 7;
    st.delivered = 1;
    expect(rivalRatingOverride(st)).toBe(false);
  });

  test('player stations are never overridden', () => {
    const { st } = setup();
    expect(st.ownerId).toBeUndefined();
    expect(rivalRatingOverride(st)).toBe(false);
    st.ownerId = null;
    expect(rivalRatingOverride(st)).toBe(false);
  });

  test('updateCargo: rival without flags is pinned to 120 target, with pickup it follows normal rating', () => {
    const { g, st } = setup();
    st.ownerId = 7;
    st.lastPickup.PASS = 0;
    st.rating200 = { PASS: 150 };
    st.cargoAge = { PASS: 0 };
    updateCargo(g, st);
    // forced target 120 (+33 vehicle age 0) = 153 -> moves 150 toward 153 by at most 2
    expect(st.rating200.PASS).toBe(152);
    st.pickedUp = 1;
    st.rating200 = { PASS: 0 };
    st.cargoAge = { PASS: 0 };
    updateCargo(g, st);
    // normal rating: quantity 0 and age 1 -> not forced to 120, moves at most +2 per day from 0
    expect(st.rating200.PASS).toBe(2);
  });

  test('save/load keeps the flags (and the override stays off after load)', () => {
    const { g, st } = setup();
    st.ownerId = 7;
    st.pickedUp = 1;
    st.delivered = 1;
    const back = parseState(serializeState(g.state));
    const rec = back.stations.find((s) => s.id === st.id);
    expect(rec.pickedUp).toBe(1);
    expect(rec.delivered).toBe(1);
    expect(rivalRatingOverride(rec)).toBe(false);
  });

  test('save of a never-served rival writes no flag keys (lazy)', () => {
    const { g, st } = setup();
    st.ownerId = 7;
    const back = parseState(serializeState(g.state));
    const rec = back.stations.find((s) => s.id === st.id);
    expect('pickedUp' in rec).toBe(false);
    expect('delivered' in rec).toBe(false);
    expect(rivalRatingOverride(rec)).toBe(true);
  });
});
