import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting, getSetting } from '../js/simulation/settings.js';
import { platformRun, stationMaxPlatform, wagonsFitting, trainLengthTiles, platformWarning, longestPlatform, updatePlatFit } from '../js/simulation/platformLength.js';
import { loadCargo, unload, arriveAtStation, isFull } from '../js/simulation/orders.js';
import { addWaiting, waitingAmount } from '../js/simulation/stations.js';
import { findStation } from '../js/simulation/state.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';

/** Coal line (3-tile stations) with a train of `wagons` hoppers; platformLength on when `on`. */
function setup(wagons, on = true) {
  const g = flatGame();
  const L = coalLine(g);
  if (on) setSetting(g.state, 'platformLength', true);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  return { g, L, v: r.vehicle, st: L.a };
}

/** Put the train at station `st` as if it had just arrived (head on the platform's first tile). */
function park(g, v, st) {
  const tile = st.tiles.find((p) => p.kind === 'rail');
  v.tx = tile.x; v.ty = tile.y;
  v.history = [{ x: tile.x, y: tile.y }];
  v.path = []; v.pathIndex = 0;
  v.atStationId = st.id;
  return tile;
}

describe('platform length (setting platformLength, OpenTTD LoadUnloadVehicle)', () => {
  test('setting defaults off and nothing is stored when off', () => {
    const { g, v, st } = setup(8, false);
    expect(getSetting(g.state, 'platformLength')).toBe(false);
    park(g, v, st);
    v.load.amount = 0;
    arriveAtStation({ state: g.state, emit: () => {} }, v, st);
    expect(v.platFit).toBeUndefined();
  });

  test('platform run is the contiguous same-station rail tiles along the axis', () => {
    const { g, st } = setup(1, false);
    expect(stationMaxPlatform(g.state, st)).toBe(3);
    const tile = st.tiles.find((p) => p.kind === 'rail');
    expect(platformRun(g.state, st, tile.x, tile.y)).toBe(3);
    expect(platformRun(g.state, st, 0, 0)).toBe(0);
  });

  test('wagons that fit: 2 vehicles per tile, the engine takes a slot', () => {
    expect(wagonsFitting(8, 3)).toBe(5);   // 3 tiles = 6 vehicle slots, engine + 5 wagons
    expect(wagonsFitting(8, 1)).toBe(1);
    expect(wagonsFitting(2, 6)).toBe(2);   // fits: all wagons
    expect(trainLengthTiles({ wagons: 8 })).toBe(4.5);
  });

  test('a train that fits is never marked (no platFit)', () => {
    const { g, v, st } = setup(2, true);
    park(g, v, st);
    updatePlatFit(g.state, v, st);
    expect(v.platFit).toBeUndefined();
  });

  test('a long train gets platFit on arrival; cargo outside the platform stays aboard', () => {
    const { g, v, st } = setup(8, true);
    park(g, v, st);
    v.load.amount = 0;
    addWaiting(st, 'COAL', 2000, st.x, st.y, g.state.tick, 4000);
    arriveAtStation({ state: g.state, emit: () => {} }, v, st);
    expect(v.platFit).toBe(5);
    // unload then load with the inside share only: fits 5/8 of capacity
    const cap = v.capacity;
    const inside = Math.floor(cap * 5 / 8);
    loadCargo({ state: g.state, emit: () => {} }, v, st);
    expect(v.load.amount).toBeLessThanOrEqual(inside);
    expect(v.load.amount).toBeGreaterThan(0);
    expect(v.capacity).toBe(cap); // whole capacity restored after the partial load
  });

  test('full-load check uses the inside capacity', () => {
    const { g, v, st } = setup(8, true);
    park(g, v, st);
    arriveAtStation({ state: g.state, emit: () => {} }, v, st);
    expect(v.platFit).toBe(5);
    v.load.amount = Math.floor(v.capacity * 5 / 8);
    expect(isFull(v)).toBe(true);
  });

  test('cache invalidation: a longer platform clears platFit on the next arrival', () => {
    const { g, v, st } = setup(8, true);
    park(g, v, st);
    updatePlatFit(g.state, v, st);
    expect(v.platFit).toBe(5);
    // extend the platform by building one more tile east of the station (3 -> 4 tiles)
    const last = st.tiles.filter((p) => p.kind === 'rail').sort((a, b) => a.x - b.x).pop();
    const r = g.buildRailStation(last.x + 1, last.y, 'x', 1);
    expect(r.ok).toBe(true);
    const st2 = findStation(g.state, st.id);
    expect(stationMaxPlatform(g.state, st2)).toBe(4);
    park(g, v, st2);
    updatePlatFit(g.state, v, st2);
    expect(v.platFit).toBe(7); // 4 tiles = 8 slots: engine + 7 wagons, 1 of 8 outside
  });

  test('turning the setting off drops the stored fit on next arrival', () => {
    const { g, v, st } = setup(8, true);
    park(g, v, st);
    updatePlatFit(g.state, v, st);
    expect(v.platFit).toBe(5);
    setSetting(g.state, 'platformLength', false);
    updatePlatFit(g.state, v, st);
    expect(v.platFit).toBeUndefined();
  });

  test('warning text only when the train is longer than the platform', () => {
    const { g, v, st } = setup(8, true);
    expect(platformWarning(g.state, v, st)).toBe('Train longer than platform');
    v.wagons = 1;
    expect(platformWarning(g.state, v, st)).toBeNull();
    setSetting(g.state, 'platformLength', false);
    v.wagons = 8;
    expect(platformWarning(g.state, v, st)).toBeNull();
    expect(longestPlatform(g.state)).toBe(3);
  });
});
