/**
 * TileManager.tick parity: 4,096 ticks over a deterministic dense house/station fixture must produce a
 * pinned hash of station cargo and town monthly counters. Guards the servingStations/coverage index
 * refactor (selection, order, catalogue amounts and RNG draw order) end to end.
 */
import { test, expect, describe } from 'bun:test';
import { tick } from '../js/simulation/loco/tileManager.js';

function lcg(seed) {
  let s = seed >>> 0;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return {
    next,
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    range: (a, b) => a + next() * (b - a),
    chance: (p) => next() < p,
  };
}

/** 48x48 map with 40 house tiles, 6 overlapping stations and one town; deterministic RNG. */
function fixture() {
  const W = 48, H = 48;
  const tiles = new Array(W * H).fill(null).map(() => ({ height: 1 }));
  const houses = [];
  let k = 0;
  for (let y = 12; y < 20; y++) {
    for (let x = 12; x < 17; x++) {
      const b = { type: 'house', level: 2 + (k % 3), townId: 1, ageTick: k % 8, age: k % 5, variant: k % 16 };
      tiles[y * W + x] = { height: 1, building: b };
      houses.push({ x, y });
      k++;
    }
  }
  const stations = [];
  for (let j = 0; j < 6; j++) {
    const x = 10 + j * 2, y = 10 + (j % 3) * 3;
    stations.push({
      id: 21 + j, x, y,
      tiles: [{ x, y, radius: 5 + (j % 2), kind: 'rail' }],
      rating: { PASS: 40 + j * 9, MAIL: 30 + j * 7 },
      lastPickup: { PASS: 1, MAIL: 1 },
      cargo: {},
    });
  }
  const state = {
    tick: 0,
    tileUpdateStart: 0,
    date: { year: 1, month: 0, day: 0 },
    map: { width: W, height: H, tiles },
    towns: [{ id: 1, houses, passengersThisMonth: 0, mailThisMonth: 0, transportedThisMonth: 0 }],
    stations,
    settings: {},
  };
  return { state, game: { state, rng: lcg(20261113) } };
}

describe('TileManager.tick parity', () => {
  test('4,096 ticks pin station cargo + town counters', () => {
    const { state, game } = fixture();
    for (let i = 0; i < 4096; i++) {
      state.tick = i;
      tick(game, false);
    }
    const snapshot = JSON.stringify({
      stations: state.stations.map((s) => ({ id: s.id, cargo: s.cargo })),
      towns: state.towns.map((t) => ({
        id: t.id,
        passengersThisMonth: t.passengersThisMonth,
        mailThisMonth: t.mailThisMonth,
        transportedThisMonth: t.transportedThisMonth,
      })),
    });
    const hash = new Bun.CryptoHasher('sha256').update(snapshot).digest('hex').slice(0, 16);
    expect(snapshot.length).toBeGreaterThan(1000); // cargo actually moved
    expect(hash).toBe('85c080aa67c657a9');
    expect(state.tileUpdateStart).toBe((4096 * 9) & 0xff);
  });
});
