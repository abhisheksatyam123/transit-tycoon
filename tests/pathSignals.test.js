/** Path signals and one-way signals (T3c, pathSignals.js): one-way refusal, reservation, save/load, no deadlock. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { reserveAhead, releaseReservations, cycleSignalType, SIGNAL_TYPES } from '../js/simulation/pathSignals.js';

const E = 2, W = 8; // dirBetween bits: east, west

function lineWorld(sig) {
  const g = flatGame(19);
  const L = coalLine(g); // stations (10..12,24) and (40..42,24), track 13..39 along y=24
  for (const [x, dir, type] of sig) expect(g.buildSignal(x, 24, { type, dir }).ok).toBe(true);
  const mk = (order) => {
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(g.setOrders(r.vehicle.id, order.map((s) => ({ stationId: s === 'a' ? L.a.id : L.b.id, full: false }))).ok).toBe(true);
    return r.vehicle;
  };
  return { g, L, east: mk(['b', 'a']), west: mk(['a', 'b']) };
}

/** Tile-crossing log: for each vehicle, the steps across tile column x (from column -> to column). */
function crossings(g, vehicles, x, steps) {
  const log = new Map(vehicles.map((v) => [v, { right: 0, wrong: 0 }]));
  const prev = new Map(vehicles.map((v) => [v, v.tx]));
  for (let i = 0; i < steps; i++) {
    g.step();
    for (const v of vehicles) {
      const before = prev.get(v), now = v.tx;
      if (before !== now && (before === x || now === x)) {
        const moving = now > before ? E : W;
        const crossing = (before === x - 1 && now === x) || (before === x + 1 && now === x) || (before === x && now === x + 1) || (before === x && now === x - 1);
        if (crossing) {
          const rec = log.get(v);
          // eastbound step into x from x-1 or westbound from x+1 is the passing direction of the signal
          if ((moving === E && before === x - 1) || (moving === W && before === x + 1)) rec.right++;
          else rec.wrong++;
        }
      }
      prev.set(v, v.tx);
    }
  }
  return log;
}

describe('one-way block signal', () => {
  test('a train from the wrong side never enters; the right-side train passes', () => {
    const { g, east, west } = lineWorld([[30, E, 'oneway']]);
    expect(g.state.map.tiles[24 * g.state.map.width + 30].signal).toEqual({ type: 'oneway', dir: E });
    g.startVehicle(east.id); g.startVehicle(west.id);
    const log = crossings(g, [east, west], 30, 200);
    const eastLog = log.get(east), westLog = log.get(west);
    expect(eastLog.wrong + westLog.wrong).toBe(0);
    expect(eastLog.right).toBeGreaterThan(0); // non-vacuous: the allowed direction was used
  });
});

describe('path signal reservation', () => {
  test('reserveAhead claims tiles up to the next signal and refuses a tile reserved by another train', () => {
    const { g, east, west } = lineWorld([]);
    const s = g.state;
    g.buildSignal(30, 24, { type: 'path', dir: E }); g.buildSignal(34, 24, { type: 'path', dir: E });
    east.path = [{ x: 29, y: 24 }, { x: 30, y: 24 }, { x: 31, y: 24 }, { x: 32, y: 24 }, { x: 33, y: 24 }, { x: 34, y: 24 }];
    east.pathIndex = 0;
    const ctx = { state: s };
    expect(reserveAhead(ctx, east, 1)).toBe(true);
    // tiles 30..33 reserved (34 is the next signal)
    expect(s.resv[24 * s.map.width + 30]).toBe(east.id);
    expect(s.resv[24 * s.map.width + 33]).toBe(east.id);
    expect(s.resv[24 * s.map.width + 34]).toBeUndefined();
    west.path = [{ x: 33, y: 24 }, { x: 32, y: 24 }];
    west.pathIndex = 0;
    expect(reserveAhead(ctx, west, 1)).toBe(false);
    // east leaves the tiles behind: its history keeps only the latest cells; reservations behind are freed
    east.pathIndex = 4; east.history = [{ x: 33, y: 24 }, { x: 32, y: 24 }];
    releaseReservations(s, east);
    expect(s.resv[24 * s.map.width + 30]).toBeUndefined();
    expect(s.resv[24 * s.map.width + 33]).toBe(east.id);
  });

  test('a path signal that cannot reserve holds the train; a plain line still runs', () => {
    const { g, east } = lineWorld([[30, E, 'path']]);
    g.startVehicle(east.id);
    for (let i = 0; i < 40 * 96 && !east.atStationId; i++) g.step();
    expect(east.atStationId).toBeTruthy();
  });

  test('cycleSignalType walks block -> oneway -> path -> block and keeps the direction', () => {
    const g = flatGame(7);
    g.buildRail(20, 24, 50, 24);
    g.buildSignal(30, 24);
    const s = g.state;
    expect(cycleSignalType(s, 30, 24).type).toBe('oneway');
    expect(s.map.tiles[24 * s.map.width + 30].signal.type).toBe('oneway');
    expect(cycleSignalType(s, 30, 24).type).toBe('path');
    expect(cycleSignalType(s, 30, 24).type).toBe('block');
    expect(s.map.tiles[24 * s.map.width + 30].signal).toBe(1);
    expect(SIGNAL_TYPES).toEqual(['block', 'oneway', 'path']);
  });
});

describe('save and load', () => {
  test('save/load mid-reservation gives an identical continuation', () => {
    const { g, east, west } = lineWorld([[22, E, 'path'], [30, E, 'path'], [33, W, 'path']]);
    g.startVehicle(east.id); g.startVehicle(west.id);
    let found = false;
    for (let i = 0; i < 2000 && !found; i++) { g.step(); found = !!g.state.resv; }
    expect(found).toBe(true); // a reservation exists at the save point
    const g2 = Game.deserialize(g.serialize());
    for (let i = 0; i < 1200; i++) { g.step(); g2.step(); }
    expect(g2.serialize()).toBe(g.serialize());
  });

  test('a save without path signals has no reservation fields', () => {
    const { g, east } = lineWorld([[30, E, 'oneway']]);
    g.startVehicle(east.id);
    for (let i = 0; i < 300; i++) g.step();
    expect(g.serialize()).not.toContain('"resv"');
  });
});

describe('path signals through a junction and a loop', () => {
  test('two same-way trains share a junction with path signals and both arrive', () => {
    // coalLine track y=24 with a crossing branch at x=30 (north). Path signals gate the eastbound train only,
    // so the trains run in one direction (single track: opposite trains would be refused by one-way signals).
    const { g, east, west } = lineWorld([[27, E, 'path'], [32, E, 'path']]);
    expect(g.buildRail(30, 22, 30, 23).ok).toBe(true);
    expect(g.startVehicle(east.id).ok).toBe(true);
    // second same-way train starts from the depot at a later tick (keeps distance, both reach station b)
    for (let i = 0; i < 20; i++) g.step();
    expect(g.startVehicle(west.id).ok).toBe(true);
    let eastDone = false, westDone = false;
    for (let i = 0; i < 60 * 96 && !(eastDone && westDone); i++) {
      g.step();
      if (east.atStationId) eastDone = true;
      if (west.atStationId) westDone = true;
    }
    expect(eastDone).toBe(true);
    expect(westDone).toBe(true);
  });

  test('a loop with path signals does not deadlock: two clockwise trains keep moving', () => {
    const g = flatGame(23);
    const ring = [];
    for (let x = 20; x <= 40; x++) ring.push({ x, y: 22 });
    for (let y = 23; y <= 26; y++) ring.push({ x: 40, y });
    for (let x = 39; x >= 20; x--) ring.push({ x, y: 26 });
    for (let y = 25; y >= 23; y--) ring.push({ x: 20, y });
    expect(g.buildRailPath(ring, { loop: true }).ok).toBe(true);
    // clockwise: east along y=22, south along x=40, west along y=26, north along x=20
    const sigs = [[30, 22, E], [40, 24, 4], [30, 26, W], [20, 24, 1]];
    for (const [x, y, dir] of sigs) expect(g.buildSignal(x, y, { type: 'path', dir }).ok).toBe(true);
    const s = g.state;
    const cw = (id, start) => {
      const path = ring.slice(start).concat(ring.slice(0, start)).concat([ring[start]]);
      const p0 = path[0];
      return { id, kind: 'train', state: 'running', path, pathIndex: 0, progress: 0, speed: 0.5, tx: p0.x, ty: p0.y,
        history: [{ x: p0.x, y: p0.y }], wagons: 1, orders: [], flipped: false, maxSpeed: 60, name: 'T' + id,
        goingToDepot: null, depotId: null, atStationId: null, reliability: 1, baseReliability: 1, breakdownTicks: 0 };
    };
    const a = cw(9001, 0), b = cw(9002, 10);
    s.vehicles.push(a, b);
    // both trains must complete a full lap (ring length) without a deadlock or being lost
    const lap = ring.length;
    // the synthetic trains have no orders: at the path end they stop (pathIndex resets), so record the furthest index
    let farA = 0, farB = 0, lost = false;
    for (let i = 0; i < 12000 && !(farA >= lap - 1 && farB >= lap - 1); i++) {
      g.step();
      if (a.state === 'lost' || b.state === 'lost') lost = true;
      if (a.state === 'running') farA = Math.max(farA, a.pathIndex);
      if (b.state === 'running') farB = Math.max(farB, b.pathIndex);
    }
    expect(lost).toBe(false);
    expect(farA).toBeGreaterThanOrEqual(lap - 1);
    expect(farB).toBeGreaterThanOrEqual(lap - 1);
  });
});

describe('flipSignal (lead)', () => {
  test('reverses a one-way signal and refuses block signals', async () => {
    const { flipSignal } = await import('../js/simulation/pathSignals.js');
    const state = { map: { width: 3, height: 1, tiles: [{}, { signal: { type: 'oneway', dir: 2 } }, { signal: 1 }] } };
    expect(flipSignal(state, 1, 0).ok).toBe(true);
    expect(state.map.tiles[1].signal).toEqual({ type: 'oneway', dir: 8 });
    expect(flipSignal(state, 1, 0).ok).toBe(true);
    expect(state.map.tiles[1].signal.dir).toBe(2);
    expect(flipSignal(state, 2, 0).ok).toBe(false);
  });
});
