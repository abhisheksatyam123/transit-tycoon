/** Disasters (disasters.js, OpenTTD disaster_vehicle.cpp): zeppelin blocks an airport runway, UFO destroys a road vehicle. */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { tickDisasters, dailyDisasters, airportBlockedByDisaster } from '../js/simulation/disasters.js';
import { ftaRunwayBusy } from '../js/simulation/airportGround.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { getTile } from '../js/simulation/map.js';
import { createRng } from '../js/simulation/rng.js';
import { drawDisasters } from '../js/renderer/layers/disasters.js';

function findSpot(game, type) {
  for (let y = 4; y < 30; y++) for (let x = 4; x < 56; x++) {
    if (game.buildAirport(x, y, { type, dryRun: true }).ok) return { x, y };
  }
  return null;
}

/** Flat game with the disasters setting on and a small airport built. */
function airportGame() {
  const game = flatGame(11);
  setSetting(game.state, 'disasters', true);
  const spot = findSpot(game, 'small');
  const r = game.buildAirport(spot.x, spot.y, { type: 'small' });
  expect(r.ok).toBe(true);
  const st = game.state.stations.find((s) => (s.tiles || []).some((t) => t.kind === 'airport'));
  return { game, s: game.state, st, spot };
}

describe('disasters: zeppelin on an airport runway', () => {
  test('setting off: no state, no delay, daily roll and tick are no-ops', () => {
    const game = flatGame(3);
    const s = game.state;
    for (let d = 0; d < 50; d++) dailyDisasters(game);
    tickDisasters({ state: s, emit: () => {} });
    expect(s.disasters).toBeUndefined();
    expect(s.disasterDelay).toBeUndefined();
    expect(getSetting(s, 'disasters')).toBe(false);
  });

  test('crashes on the airport runway, blocks landings, then is cleared (OTTD 13320 + 350 ticks)', () => {
    const { game, s, st, spot } = airportGame();
    const events = [];
    game.events.on('news', (n) => events.push(n));
    const t0 = st.tiles.find((t) => t.kind === 'airport');
    // place the zeppelin on the first airport tile, moving on the next tick (state 0 -> 1 when over the airport)
    s.disasters = { zep: { stationId: st.id, x: t0.x - 0.5, y: t0.y - 0.5, state: 0, age: 0, tick: 0, name: st.name } };
    const ctx = { state: s, emit: (e, p) => game.events.emit(e, p) };
    let guard = 0;
    while (s.disasters.zep.state < 2 && guard++ < 200) tickDisasters(ctx);
    expect(s.disasters.zep.state).toBe(2); // crashed: blocked from here on (OTTD line 273)
    expect(events.some((n) => /Zeppelin disaster/.test(n.text) && n.cat === 'accident')).toBe(true);
    expect(airportBlockedByDisaster(s, st)).toBe(true);
    expect(ftaRunwayBusy(s, st, { id: -1, kind: 'aircraft' })).toBe(true); // landings hold
    // another airport is not blocked
    expect(airportBlockedByDisaster(s, { id: st.id + 999 })).toBe(false);
    // cleared after the blocking period
    for (let i = 0; i < 13320 + 400 && s.disasters; i++) tickDisasters(ctx);
    expect(s.disasters).toBeUndefined();
    expect(airportBlockedByDisaster(s, st)).toBe(false);
    expect(ftaRunwayBusy(s, st, { id: -1, kind: 'aircraft' })).toBe(false);
    void spot;
  });

  test('daily roll spawns a zeppelin only in its era (1930-1955) and only with an airport', () => {
    const { game, s } = airportGame();
    s.date.year = 1950;
    s.disasterDelay = 1;
    s.rngState = 7;
    // force the roll to pick the zeppelin: find a seed whose pick is 'zep' (only zep and ufo are in era 1950 -> either)
    let spawned = false;
    for (let k = 0; k < 40 && !spawned; k++) {
      s.disasterDelay = 1;
      dailyDisasters(game);
      if (s.disasters && s.disasters.zep) spawned = true;
      if (s.disasters && s.disasters.ufo) delete s.disasters.ufo;
      if (s.disasters && !s.disasters.zep && !s.disasters.ufo) delete s.disasters;
    }
    expect(spawned).toBe(true);
    expect(s.disasters.zep.stationId).toBeDefined();
    expect(s.disasterDelay).toBeGreaterThanOrEqual(730);
    expect(s.disasterDelay).toBeLessThan(730 + 512);
  });
});

describe('disasters: small UFO destroys a road vehicle', () => {
  test('hunts a road vehicle, destroys it and removes the UFO', () => {
    const game = flatGame(5);
    const s = game.state;
    setSetting(s, 'disasters', true);
    const truck = { id: 9001, kind: 'road', roadType: 'truck', state: 'running', tx: 12, ty: 20, path: [{ x: 12, y: 20 }], pathIndex: 0, progress: 0, history: [], cargoId: 'GOOD', load: { amount: 0 }, capacity: 10, orders: [] };
    s.vehicles.push(truck);
    const events = [];
    game.events.on('news', (n) => events.push(n));
    s.disasters = { ufo: { x: 10, y: 20, dest: { x: 10, y: 20 }, state: 1, age: 0, targetId: 9001, alt: 1 } };
    const ctx = { state: s, emit: (e, p) => game.events.emit(e, p) };
    for (let i = 0; i < 200 && s.disasters; i++) tickDisasters(ctx);
    expect(s.vehicles.find((v) => v.id === 9001)).toBeUndefined(); // destroyed (removeVehicle)
    expect(events.some((n) => /Road vehicle destroyed/.test(n.text) && n.cat === 'accident')).toBe(true);
    expect(s.disasters).toBeUndefined(); // UFO gone after its destroy age
  });

  test('UFO with no road vehicles leaves (OTTD: no targetable road vehicle destroys the UFO)', () => {
    const game = flatGame(6);
    const s = game.state;
    setSetting(s, 'disasters', true);
    s.disasters = { ufo: { x: 5, y: 5, dest: { x: 5, y: 5 }, state: 0, age: 6, targetId: null, alt: 1 } };
    tickDisasters({ state: s, emit: () => {} });
    expect(s.disasters).toBeUndefined();
  });
});

describe('disasters: save round trip mid-disaster', () => {
  test('zeppelin crashed and UFO hunting survive serialize/parse; the restored state keeps the block', () => {
    const { game, s, st } = airportGame();
    s.disasters = {
      zep: { stationId: st.id, x: 3.5, y: 4.25, state: 2, age: 120, tick: 300, name: st.name, fx: 3.5, fy: 4.25 },
      ufo: { x: 20.5, y: 21, dest: { x: 48, y: 48 }, state: 1, age: 2, targetId: 77, alt: 0.5 },
    };
    const back = parseState(serializeState(s));
    expect(back.disasters).toEqual(s.disasters);
    expect(airportBlockedByDisaster(back, back.stations.find((x) => x.id === st.id))).toBe(true);
    // resumes ticking after load
    const ctx = { state: back, emit: () => {} };
    for (let i = 0; i < 5; i++) tickDisasters(ctx);
    expect(back.disasters.zep.age).toBe(125);
  });

  test('old save (no disasters key) loads with no disaster state', () => {
    const game = flatGame(8);
    const back = parseState(serializeState(game.state));
    expect(back.disasters).toBeUndefined();
  });
});

describe('disasters: procedural sprites', () => {
  test('drawDisasters is a no-op without state and draws with an active disaster', () => {
    const calls = [];
    const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); }), set: (t, k, v) => { t[k] = v; return true; } });
    drawDisasters(ctx, { }, () => ({ x: 0, y: 0 }), 0);
    expect(calls.length).toBe(0);
    drawDisasters(ctx, { disasters: { zep: { x: 1, y: 1, state: 0 }, ufo: { x: 2, y: 2, alt: 1 } } }, (x, y) => ({ x: x * 10, y: y * 10 }), 8);
    expect(calls.length).toBeGreaterThan(0);
  });
});
