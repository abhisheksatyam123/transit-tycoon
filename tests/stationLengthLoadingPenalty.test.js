/** order.station_length_loading_penalty: a train longer than its platform takes longer to load (off by default). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting, getSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { loadingTicksFor } from '../js/simulation/platformLength.js';
import { arriveAtStation, LOAD_TICKS } from '../js/simulation/orders.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

/** Coal line with a train of `wagons` hoppers, parked on the first rail tile of station A. */
function setup(wagons, on) {
  const g = flatGame(31);
  const L = coalLine(g);
  if (on) setSetting(g.state, 'stationLengthLoadingPenalty', true);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  const tile = L.a.tiles.find((p) => p.kind === 'rail');
  v.tx = tile.x; v.ty = tile.y;
  v.history = [{ x: tile.x, y: tile.y }];
  v.path = []; v.pathIndex = 0;
  return { g, L, v, st: L.a };
}

describe('station length loading penalty', () => {
  test('default off in TT; OpenTTD default on is not adopted', () => {
    expect(DEFAULT_SETTINGS.stationLengthLoadingPenalty).toBe(false);
  });

  test('off: a long train keeps the base stop time', () => {
    const { g, v, st } = setup(8, false);
    expect(getSetting(g.state, 'stationLengthLoadingPenalty')).toBe(false);
    expect(loadingTicksFor(g.state, v, st, LOAD_TICKS)).toBe(LOAD_TICKS);
    arriveAtStation({ state: g.state, emit: () => {} }, v, st);
    expect(v.loadingTicks).toBe(LOAD_TICKS);
  });

  test('on: 8 wagons (4.5 tiles) on a 3-tile platform: 1.5 tiles overhang = 24 units -> 320 ticks', () => {
    // t = 40; t <<= 1 -> 80; t += floor(24 * 80 / 8) = 240 -> 320 (OpenTTD UpdateLoadUnloadTicks)
    const { g, v, st } = setup(8, true);
    expect(loadingTicksFor(g.state, v, st, LOAD_TICKS)).toBe(320);
    arriveAtStation({ state: g.state, emit: () => {} }, v, st);
    expect(v.loadingTicks).toBe(320);
  });

  test('on: a train that fits the platform keeps the base stop time', () => {
    const { g, v, st } = setup(1, true); // 2 vehicles = 1 tile, platform 3 tiles
    expect(loadingTicksFor(g.state, v, st, LOAD_TICKS)).toBe(LOAD_TICKS);
  });

  test('on: buses and trucks are not affected; result is at least 1', () => {
    const { g, v, st } = setup(8, true);
    const bus = { ...v, kind: 'bus' };
    expect(loadingTicksFor(g.state, bus, st, LOAD_TICKS)).toBe(LOAD_TICKS);
    expect(loadingTicksFor(g.state, v, st, 0)).toBe(1);
  });

  test('settings UI entry exists (one)', () => {
    expect(SETTING_META.filter((m) => m.key === 'stationLengthLoadingPenalty').length).toBe(1);
  });
});
