/** Disasters (disasters.js, OpenTTD disaster_vehicle.cpp): zeppelin blocks an airport runway, UFO destroys a road vehicle. */
import { describe, expect, test } from 'bun:test';
import { flatGame } from './helpers.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { tickDisasters, dailyDisasters, airportBlockedByDisaster, disasterKindsForYear } from '../js/simulation/disasters.js';
import { placeIndustry } from '../js/simulation/industries.js';
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

describe('disasters: OTTD era windows', () => {
  test('each kind is available only in its _disasters era', () => {
    expect(disasterKindsForYear(1935)).toEqual(['zep']);
    expect(disasterKindsForYear(1962)).toEqual(['ufo', 'bomber', 'sub']);
    expect(disasterKindsForYear(1980)).toEqual(['bomber', 'heli', 'sub']);
    expect(disasterKindsForYear(2005)).toEqual(['bigufo', 'sub']);
    expect(disasterKindsForYear(1900)).toEqual([]);
  });
});

/** Flat game with the disasters setting on and an industry of the given type placed in the open area. */
function industryGame(typeId) {
  const game = flatGame(21);
  setSetting(game.state, 'disasters', true);
  const ind = placeIndustry(game.state, typeId, 30, 20);
  return { game, s: game.state, ind, ctx: { state: game.state, emit: (e, p) => game.events.emit(e, p) } };
}

describe('disasters: big UFO lands on a train', () => {
  test('destroys the target train, breaks down trains near the landing, then the destroyer ends it', () => {
    const game = flatGame(31);
    const s = game.state;
    setSetting(s, 'disasters', true);
    const target = { id: 7001, kind: 'train', ownerId: undefined, state: 'running', tx: 20, ty: 20, path: [{ x: 20, y: 20 }], pathIndex: 0, progress: 0, history: [], breakdownTicks: 0, load: { amount: 0 } };
    const near = { ...target, id: 7002, tx: 25, ty: 20, path: [{ x: 25, y: 20 }] };
    s.vehicles.push(target, near);
    const events = [];
    game.events.on('news', (n) => events.push(n));
    s.disasters = { bigUfo: { x: 20, y: 20, dest: { x: 20, y: 20 }, state: 1, age: 0, targetId: 7001 } };
    const ctx = { state: s, emit: (e, p) => game.events.emit(e, p) };
    tickDisasters(ctx); // within a tile: lands on the target
    expect(s.vehicles.find((v) => v.id === 7001)).toBeUndefined();
    expect(s.disasters.bigUfo.state).toBe(2);
    expect(events.some((n) => /Train destroyed/.test(n.text) && n.cat === 'accident')).toBe(true);
    expect(events.some((n) => /UFO' lands near/.test(n.text))).toBe(true);
    tickDisasters(ctx);
    expect(s.vehicles.find((v) => v.id === 7002).state).toBe('broken'); // within 12 tiles
    for (let i = 0; i < 400 && s.disasters; i++) tickDisasters(ctx);
    expect(s.disasters).toBeUndefined(); // shot down
    expect(events.some((n) => /shot down/.test(n.text))).toBe(true);
  });

  test('big UFO is only rolled in its era (2000+)', () => {
    expect(disasterKindsForYear(1999)).not.toContain('bigufo');
    expect(disasterKindsForYear(2000)).toContain('bigufo');
  });
});

describe('disasters: refinery bomber closes production', () => {
  test('flies in, strikes the refinery (production 0), then restores it after the explosion phase', () => {
    const { game, s, ind, ctx } = industryGame('refinery');
    expect(ind).toBeTruthy();
    const before = ind.productionRate;
    s.disasters = { bomber: { kind: 'bomber', indId: ind.id, x: ind.x + 1.5, y: ind.y + 1.5, dest: { x: ind.x + 1.5, y: ind.y + 1.5 }, state: 0, age: 0, prev: null } };
    const events = [];
    game.events.on('news', (n) => events.push(n));
    tickDisasters(ctx); // at target: fires
    for (let i = 0; i < 200 && s.disasters.bomber.state < 2; i++) tickDisasters(ctx);
    expect(s.disasters.bomber.state).toBe(2);
    expect(ind.productionRate).toBe(0);
    expect(events.some((n) => /Oil refinery explosion/.test(n.text) && n.cat === 'accident')).toBe(true);
    for (let i = 0; i < 1000 && s.disasters && s.disasters.bomber; i++) tickDisasters(ctx);
    expect(ind.productionRate).toBe(before); // reopened after the explosions
    expect(s.disasters).toBeUndefined();
  });

  test('bomber only targets refineries (no factory is attacked)', () => {
    const { s, ind } = industryGame('factory');
    expect(ind).toBeTruthy();
    dailyDisasters({ state: s, events: { emit() {} } }); // no crash without a refinery
    expect(s.disasters && s.disasters.bomber).toBeFalsy();
  });
});

describe('disasters: factory helicopter', () => {
  test('attacks a factory and closes its production (1970-2000 era)', () => {
    const { game, s, ind, ctx } = industryGame('factory');
    expect(ind).toBeTruthy();
    const before = ind.productionRate;
    s.disasters = { heli: { kind: 'heli', indId: ind.id, x: ind.x + 1.5, y: ind.y + 1.5, dest: { x: ind.x + 1.5, y: ind.y + 1.5 }, state: 0, age: 0, prev: null } };
    const events = [];
    game.events.on('news', (n) => events.push(n));
    for (let i = 0; i < 200 && s.disasters.heli.state < 2; i++) tickDisasters(ctx);
    expect(ind.productionRate).toBe(0);
    expect(events.some((n) => /Factory destroyed/.test(n.text))).toBe(true);
    for (let i = 0; i < 100 && s.disasters && s.disasters.heli; i++) tickDisasters(ctx);
    expect(ind.productionRate).toBe(before);
  });
});

describe('disasters: submarine (cosmetic)', () => {
  test('drifts through water, never touches vehicles or industries, and is removed after its age', () => {
    const game = flatGame(41);
    const s = game.state;
    setSetting(s, 'disasters', true);
    // a sea strip of water at the top: make row 0..3 water
    for (let x = 0; x < 40; x++) for (let y = 0; y < 4; y++) { const t = s.map.tiles[y * s.map.width + x]; t.terrain = 'water'; }
    s.disasters = { sub: { x: 10, y: 0, dx: 0, dy: 1, age: 0, tick: 0, big: false } };
    const v = { id: 8001, kind: 'road', roadType: 'truck', state: 'running', tx: 20, ty: 20, path: [{ x: 20, y: 20 }], pathIndex: 0, progress: 0, history: [], load: { amount: 0 } };
    s.vehicles.push(v);
    const before = JSON.stringify(s.vehicles);
    for (let i = 0; i < 40; i++) tickDisasters({ state: s, emit: () => {} });
    expect(JSON.stringify(s.vehicles)).toBe(before); // cosmetic: no effect on vehicles
    expect(s.disasters.sub.y).toBeGreaterThan(0); // it moved
    for (let i = 0; i < 9000 && s.disasters; i++) tickDisasters({ state: s, emit: () => {} });
    expect(s.disasters).toBeUndefined();
  });
});

describe('disasters: save round trip mid-disaster (new kinds)', () => {
  test('bomber mid-strike and a landed big UFO survive serialize/parse and resume', () => {
    const game = flatGame(51);
    const s = game.state;
    const ind = placeIndustry(s, 'refinery', 30, 20);
    setSetting(s, 'disasters', true);
    s.disasters = {
      bomber: { kind: 'bomber', indId: ind.id, x: 31.5, y: 21.5, dest: { x: 31.5, y: 21.5 }, state: 2, age: 10, prev: 255 },
      bigUfo: { x: 12, y: 12, dest: { x: 12, y: 12 }, state: 2, age: 5, targetId: null, lx: 12, ly: 12 },
      sub: { x: 3, y: 1, dx: 0, dy: 1, age: 100, tick: 4, big: false },
    };
    ind.productionRate = 0;
    const back = parseState(serializeState(s));
    expect(back.disasters).toEqual(s.disasters);
    const ctx = { state: back, emit: () => {} };
    tickDisasters(ctx);
    expect(back.disasters.bomber.age).toBe(11);
    expect(back.disasters.bigUfo.age).toBe(6);
  });
});
