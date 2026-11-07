/** OpenLoco VehicleHead.cpp:3466-3478 + Station.cpp:795-809: station rating uses the last carrier's speed/age, averaged. */
import { describe, test, expect } from 'bun:test';
import { recordCarrier } from '../js/simulation/stations.js';
import { calculateCargoRating, stationCargoRatingDetail } from '../js/simulation/loco/station.js';

describe('recordCarrier (OL pickup averaging)', () => {
  test('first pickup sets speed and age', () => {
    const st = {};
    recordCarrier(st, 'PASS', 120, 600);
    expect(st.carrier.PASS).toEqual({ speed: 120, age: 2 });
  });
  test('later pickups average with (old+new)>>1', () => {
    const st = {};
    recordCarrier(st, 'PASS', 120, 0);
    recordCarrier(st, 'PASS', 60, 1024);
    expect(st.carrier.PASS).toEqual({ speed: 90, age: 2 });
    recordCarrier(st, 'PASS', 61, 0);
    expect(st.carrier.PASS.speed).toBe(75);
    expect(st.carrier.PASS.age).toBe(1);
  });
  test('integer floor on odd sums and age clamps to 255', () => {
    const st = {};
    recordCarrier(st, 'COAL', 5, 0);
    recordCarrier(st, 'COAL', 4, 0);
    expect(st.carrier.COAL.speed).toBe(4);
    recordCarrier(st, 'COAL', 0, 1e9);
    expect(st.carrier.COAL.age).toBe(Math.floor((0 + 255) / 2));
  });
  test('cargo records are independent', () => {
    const st = {};
    recordCarrier(st, 'PASS', 100, 0);
    recordCarrier(st, 'MAIL', 50, 0);
    expect(st.carrier.PASS.speed).toBe(100);
    expect(st.carrier.MAIL.speed).toBe(50);
  });
});

describe('station rating uses carrier stats', () => {
  const base = (st) => stationCargoRatingDetail({ vehicles: [] }, st, 'PASS');
  test('no carrier record (old save) falls back to last pickup speed, age 0', () => {
    const st = { id: 1, lastPickup: { PASS: 0 }, lastSpeed: 100, cargo: {}, rating: {}, tiles: [] };
    const d = base(st);
    expect(d.steps.find((s) => s.key === 'speed').delta).toBe(Math.trunc((100 * 0.621371 - 35) / 4));
  });
  test('rating reads averaged carrier speed/age, not fleet average', () => {
    const st = { id: 2, lastPickup: { PASS: 0 }, lastSpeed: 10, cargo: {}, rating: {}, tiles: [] };
    recordCarrier(st, 'PASS', 200, 0);
    recordCarrier(st, 'PASS', 0, 0);
    const d = base(st);
    expect(d.steps.find((s) => s.key === 'vehicleAge').delta).toBe(33);
    expect(d.steps.find((s) => s.key === 'speed').label).toMatch(/last vehicle/);
    expect(d.steps.find((s) => s.key === 'speed').delta).toBe(Math.trunc((100 * 0.621371 - 35) / 4));
  });
  test('calculateCargoRating vehicleAge terms', () => {
    const c = { age: 0, quantity: 0, vehicleSpeed: 0, vehicleAge: 0 };
    expect(calculateCargoRating(c)).toBe(calculateCargoRating({ ...c, vehicleAge: 0 }));
    expect(calculateCargoRating({ ...c, vehicleAge: 1 }) - calculateCargoRating({ ...c, vehicleAge: 0 })).toBe(-13);
  });
});

import { deliverCargoToStations } from '../js/simulation/loco/industry.js';
import { updateCargo } from '../js/simulation/loco/station.js';

describe('industry delivery uses the 0..200 station rating (OL StationManager::deliverCargoToStation)', () => {
  test('rating200 is used raw: >66 bonus at rating200 67', () => {
    const st = { id: 7, rating: { PASS: 33.5 }, rating200: { PASS: 67 }, tiles: [], kinds: {}, lastPickup: {}, cargo: {} };
    const state = { stations: [st], tick: 0, vehicles: [] };
    const got = deliverCargoToStations(state, [7], 'PASS', 100, 0, 0);
    // single station: default = 67*67*100/(67*67)=100 capped by alternate 67*100/256=26, +1 bonus (67>66) = 27
    expect(got).toBe(27);
  });
  test('legacy save (no rating200) falls back to rating*2', () => {
    const st = { id: 8, rating: { PASS: 50 }, tiles: [], kinds: {}, lastPickup: {}, cargo: {} };
    const state = { stations: [st], tick: 0, vehicles: [] };
    // 50 -> 100 on 0..200: alternate = 100*100/256 = 39, then +1 because 100 > 66
    expect(deliverCargoToStations(state, [8], 'PASS', 100, 0, 0)).toBe(40);
  });
});

describe('vehicle age reset table (VehicleHead.cpp typeAgeMap)', () => {
  test('tram stops reset cargo age to 2', () => {
    const st = { id: 9, kinds: { tram: true }, rating: {}, rating200: {}, cargoAge: { PASS: 40 }, lastPickup: { PASS: 5 }, pickupSeen: {}, cargo: {}, tiles: [], lastSpeed: 0 };
    const game = { state: { stations: [st], tick: 0, vehicles: [] }, rng: { int: () => 0 } };
    updateCargo(game, st);
    expect(st.cargoAge.PASS).toBe(3); // reset to 2, then +1 for the day
  });
});
