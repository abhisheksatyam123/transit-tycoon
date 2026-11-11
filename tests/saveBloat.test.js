import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame } from './helpers.js';

/** Flat game with a straight road and a queue of cars on it, so every tick sets `_key`/`_ahead`. */
function trafficGame(seed = 4) {
  const g = flatGame(seed);
  const s = g.state;
  g.buildRoad(10, 20, 40, 20);
  const W = s.map.width;
  const path = [];
  for (let x = 10; x <= 40; x++) path.push(20 * W + x);
  const cars = [];
  for (let k = 0; k < 24; k++) cars.push({ id: 900 + k, townId: 0, path: [...path], i: 0, t: (k % 30) / 30, speed: 0.06, wait: 0, born: 0, kind: 'car', color: 0 });
  s.traffic.cars = cars;
  s.traffic.nextCarId = 1000;
  return g;
}

/** Save-relevant state, ignoring the per-tick scratch fields on traffic cars. */
const strip = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => k[0] !== '_'));
function view(st) {
  return JSON.stringify({ vehicles: st.vehicles, stations: st.stations, towns: st.towns, cars: st.traffic.cars.map(strip) });
}

describe('classic save does not carry transient traffic fields', () => {
  test('a classic save contains no _key or _ahead keys', () => {
    const g = trafficGame();
    for (let i = 0; i < 200; i++) g.step();
    const cars = g.state.traffic.cars;
    expect(cars.length).toBeGreaterThan(0);
    expect(cars.some((c) => c._ahead !== null)).toBe(true); // non-null leader: the fields are actually populated
    const json = g.serialize();
    expect(json.includes('"_key"')).toBe(false);
    expect(json.includes('"_ahead"')).toBe(false);
    // the same save without the scratch fields is what the writer emits
    expect(json).toBe(JSON.stringify({ ...g.state, traffic: { ...g.state.traffic, cars: cars.map(strip) } }));
  });

  test('round-trip continuation matches the uninterrupted game (300 ticks)', () => {
    const g = trafficGame(5);
    for (let i = 0; i < 120; i++) g.step();
    const g2 = Game.deserialize(g.serialize());
    for (let i = 0; i < 300; i++) { g.step(); g2.step(); }
    expect(view(g2.state)).toBe(view(g.state));
    expect(g2.serialize()).toBe(g.serialize());
  }, 20000);

  test('an old save containing the scratch fields still loads and continues', () => {
    const g = trafficGame(6);
    for (let i = 0; i < 120; i++) g.step();
    // a save written before the fix: JSON.stringify(state) with _key/_ahead on every car
    const oldJson = JSON.stringify(g.state);
    expect(oldJson.includes('"_key"')).toBe(true);
    expect(oldJson.includes('"_ahead"')).toBe(true);
    const g2 = Game.deserialize(oldJson);
    for (let i = 0; i < 300; i++) g2.step();
    expect(g2.state.traffic.cars.length).toBeGreaterThan(0);
    // the loaded game continued identically to the game that was saved (same 300 ticks)
    for (let i = 0; i < 300; i++) g.step();
    expect(view(g2.state)).toBe(view(g.state));
    expect(g2.serialize()).toBe(g.serialize());
  }, 20000);
});
