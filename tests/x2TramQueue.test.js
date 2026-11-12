/** X2 tram queue opt-in (`tramQueue`): trams join the road occupancy layer so they queue and use stop bays like buses. */
import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { beginOccupancy, blockerOn, occupancyLayer, vehicleDir } from '../js/simulation/blocking.js';
import { dirBetween } from '../js/simulation/constants.js';

const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

/** Straight road+track y=24 x=20..50 with a road depot at (24,25) and stops at the given x. */
function lineWorld(seed, stopXs, kinds) {
  const g = flatGame(seed);
  expect(g.buildRoad(20, 24, 50, 24).ok).toBe(true);
  expect(g.buildTram(20, 24, 50, 24).ok).toBe(true);
  for (let i = 0; i < stopXs.length; i++) expect(g.buildRoadStop(stopXs[i], 24, kinds[i]).ok).toBe(true);
  expect(g.buildDepot(24, 25, 'road', 1).ok).toBe(true);
  const depotId = g.state.depots[g.state.depots.length - 1].id;
  const models = g.listModels('road');
  return { g, depotId, bus: models.find((m) => m.kind === 'bus'), tram: models.find((m) => m.kind === 'tram') };
}

function stationAt(g, x) {
  return g.state.stations.find((s) => s.tiles.some((t) => t.x === x && t.y === 24));
}

function addVehicle(g, depotId, model, stopXs) {
  const r = g.buyVehicle(depotId, { modelId: model.id });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, stopXs.map((x) => ({ stationId: stationAt(g, x).id, full: false }))).ok).toBe(true);
  expect(g.startVehicle(r.vehicle.id).ok).toBe(true);
  return r.vehicle;
}

/** Same-direction head overlaps (kind 'road' only): [a.id, b.id] pairs sharing a tile and direction. */
function roadOverlaps(g) {
  const seen = new Map();
  const out = [];
  for (const v of g.state.vehicles) {
    if (v.kind !== 'road' || v.state === 'depot') continue;
    if (v.pathIndex === 0 && v.state === 'running' && g.state.depots.some((d) => d.x === v.tx && d.y === v.ty)) continue;
    const k = `${v.tx},${v.ty},${vehicleDir(v)}`;
    if (seen.has(k)) out.push([seen.get(k).id, v.id]);
    else seen.set(k, v);
  }
  return out;
}

describe('tramQueue setting', () => {
  test('defaults to off and has exactly one Vehicles-group SETTING_META entry', () => {
    expect(DEFAULT_SETTINGS.tramQueue).toBe(false);
    const m = SETTING_META.filter((x) => x.key === 'tramQueue');
    expect(m.length).toBe(1);
    expect(m[0].group).toBe('vehicles');
    expect(m[0].type).toBe('check');
    expect(m[0].help.length).toBeGreaterThan(20);
  });
});

/** Minimal state for the occupancy layer: no pathing, just a tram and a bus on the same tile. */
function occState(settings) {
  const W = 12;
  const tiles = [];
  for (let i = 0; i < W * W; i++) tiles.push({ height: 0 });
  const st = { map: { width: W, height: W, tiles }, settings, vehicles: [], tick: 0, date: { day: 1, month: 0, year: 1950 } };
  const tram = { id: 1, kind: 'road', roadType: 'tram', state: 'running', tx: 5, ty: 5,
    history: [{ x: 5, y: 5 }, { x: 4, y: 5 }] };
  const bus = { id: 2, kind: 'road', roadType: 'bus', state: 'running', tx: 5, ty: 5,
    history: [{ x: 5, y: 5 }, { x: 4, y: 5 }] };
  return { st, tram, bus };
}

describe('tramQueue occupancy layer', () => {
  test('off keeps trams unindexed and on their own layer', () => {
    const { st, tram, bus } = occState({ tramQueue: false });
    expect(occupancyLayer(tram, st)).toBeNull();
    expect(occupancyLayer(bus, st)).toBe('road');
    st.vehicles = [tram, bus];
    const occ = beginOccupancy(st);
    expect(occ.keys.has(tram)).toBe(false);
    expect(occ.road.get(5 * st.map.width + 5)).toEqual([bus]);
  });

  test('on indexes trams on the road layer (no allocation: two body tiles)', () => {
    const { st, tram, bus } = occState({ tramQueue: true });
    expect(occupancyLayer(tram, st)).toBe('road');
    expect(occupancyLayer(bus, st)).toBe('road');
    st.vehicles = [tram, bus];
    const occ = beginOccupancy(st);
    expect(occ.keys.get(tram).length).toBe(2);
    expect(occ.road.get(5 * st.map.width + 5)).toEqual([tram, bus]);
  });
});

/** Front vehicle on (5,5), follower at (4,5) about to step onto it (both default: moving east). */
const east = dirBetween(4, 5, 5, 5);
function queueState(settings, frontType, backType, opts = {}) {
  const { st } = occState(settings);
  st.map.tiles[5 * st.map.width + 5].building = { type: 'station', kind: frontType === 'tram' ? 'tram' : 'bus' };
  const mk = (id, roadType, x) => ({ id, kind: 'road', roadType, state: 'running', tx: x, ty: 5,
    path: [{ x, y: 5 }, { x: x + 1, y: 5 }], pathIndex: 0,
    history: [{ x: x + 1, y: 5 }, { x, y: 5 }] });
  const front = mk(1, frontType, 5);
  const back = mk(2, backType, 4);
  if (opts.loading) front.state = 'loading';
  if (opts.opposite) { front.path = [{ x: 5, y: 5 }, { x: 4, y: 5 }]; delete st.map.tiles[5 * st.map.width + 5].building; } // front moves west on plain track
  st.vehicles = [front, back];
  return { st, front, back, ctx: { state: st, occupancy: beginOccupancy(st) } };
}

describe('tramQueue blocking', () => {
  test('on: a tram is held behind a loading tram in the same lane', () => {
    const { ctx, st, front, back } = queueState({ tramQueue: true }, 'tram', 'tram', { loading: true });
    expect(blockerOn(ctx, back, occupancyLayer(back, st), 5, 5, east)).toBe(front);
  });

  test('off: the same tram is not indexed at all, so it is never held', () => {
    const { st, back } = queueState({ tramQueue: false }, 'tram', 'tram', { loading: true });
    expect(occupancyLayer(back, st)).toBeNull();
    expect(beginOccupancy(st).keys.has(back)).toBe(false);
  });

  test('on: a bus is held behind a loading tram', () => {
    const { ctx, st, front, back } = queueState({ tramQueue: true }, 'tram', 'bus', { loading: true });
    expect(blockerOn(ctx, back, occupancyLayer(back, st), 5, 5, east)).toBe(front);
  });

  test('on: a tram is held behind a loading bus', () => {
    const { ctx, st, front, back } = queueState({ tramQueue: true }, 'bus', 'tram', { loading: true });
    expect(blockerOn(ctx, back, occupancyLayer(back, st), 5, 5, east)).toBe(front);
  });

  test('on: opposite-direction trams pass each other', () => {
    const { ctx, st, back } = queueState({ tramQueue: true }, 'tram', 'tram', { opposite: true });
    expect(occupancyLayer(back, st)).toBe('road');
    expect(blockerOn(ctx, back, 'road', 5, 5, east)).toBeNull();
  });
});

describe('tramQueue in the sim', () => {
  test('on: two trams queue for one tram bay without sharing a tile, and both are served', () => {
    const { g, depotId, tram } = lineWorld(33, [30, 46], ['tram', 'tram']);
    setSetting(g.state, 'tramQueue', true);
    const a = addVehicle(g, depotId, tram, [30, 46]);
    const b = addVehicle(g, depotId, tram, [30, 46]);
    let sharedLoading = false, seenA = false, seenB = false, bad = [];
    for (let i = 0; i < 60 * 96 && !(seenA && seenB); i++) {
      g.step();
      bad.push(...roadOverlaps(g));
      if (a.state === 'loading' && b.state === 'loading' && a.tx === b.tx && a.ty === b.ty) sharedLoading = true;
      if (a.state === 'loading' && a.tx === 30 && a.ty === 24) seenA = true;
      if (b.state === 'loading' && b.tx === 30 && b.ty === 24) seenB = true;
    }
    expect(sharedLoading).toBe(false);
    expect(bad).toEqual([]);
    expect(seenA && seenB).toBe(true);
  });

  test('on: a tram and a bus queue behind each other, in both orders, and both are served', () => {
    for (const first of ['tram', 'bus']) {
      const { g, depotId, bus, tram } = lineWorld(34 + (first === 'bus' ? 1 : 0), [30, 46], ['bus', 'bus']);
      setSetting(g.state, 'tramQueue', true);
      const a = addVehicle(g, depotId, first === 'tram' ? tram : bus, [30, 46]);
      const b = addVehicle(g, depotId, first === 'tram' ? bus : tram, [30, 46]);
      let seenA = false, seenB = false, bad = [];
      for (let i = 0; i < 60 * 96 && !(seenA && seenB); i++) {
        g.step();
        bad.push(...roadOverlaps(g));
        if (a.state === 'loading' && a.tx === 30 && a.ty === 24) seenA = true;
        if (b.state === 'loading' && b.tx === 30 && b.ty === 24) seenB = true;
      }
      expect(bad).toEqual([]);
      expect(seenA && seenB).toBe(true);
    }
  });

  test('on: opposite-direction trams pass each other and both arrive', () => {
    const { g, depotId, tram } = lineWorld(41, [22, 46], ['tram', 'tram']);
    setSetting(g.state, 'tramQueue', true);
    const east = addVehicle(g, depotId, tram, [46]);
    const west = addVehicle(g, depotId, tram, [22]);
    let eastDone = false, westDone = false;
    for (let i = 0; i < 40 * 96 && !(eastDone && westDone); i++) {
      g.step();
      if (east.atStationId === stationAt(g, 46).id) eastDone = true;
      if (west.atStationId === stationAt(g, 22).id) westDone = true;
    }
    expect(eastDone && westDone).toBe(true);
  });
});

// keep a tile helper import used (tileAt is handy when debugging a scenario)
void tileAt;
