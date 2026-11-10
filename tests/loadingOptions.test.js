/** Loading options: selectGoods (station selection by producers) and improvedLoad (arrival-order loading). */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { loadCargo } from '../js/simulation/orders.js';
import { addWaiting, waitingAmount, markPickup, acceptsFromSource } from '../js/simulation/stations.js';
import { servingStations } from '../js/simulation/cargo.js';

describe('loading options: defaults and UI', () => {
  test('defaults: selectGoods on, improvedLoad off (old behaviour)', () => {
    expect(DEFAULT_SETTINGS.selectGoods).toBe(true);
    expect(DEFAULT_SETTINGS.improvedLoad).toBe(false);
  });

  test('both keys have a settings UI entry', () => {
    for (const key of ['selectGoods', 'improvedLoad']) {
      expect(SETTING_META.filter((m) => m.key === key).length).toBe(1);
    }
  });
});

describe('selectGoods', () => {
  test('default: a station is only served after a vehicle tried to load there', () => {
    const g = flatGame(21);
    const L = coalLine(g);
    const st = L.a;
    const tile = st.x + st.y * g.state.map.width;
    const coverage = new Map([[tile, [st.id]]]);
    expect(acceptsFromSource(g.state, st, 'COAL')).toBe(false);
    expect(servingStations(g.state, coverage, [tile], 'COAL', st.x, st.y)).toEqual([]);
    markPickup(g.state, st, 'COAL', 0);
    expect(servingStations(g.state, coverage, [tile], 'COAL', st.x, st.y)).toEqual([st]);
  });

  test('off: every station in range takes the cargo', () => {
    const g = flatGame(22);
    const L = coalLine(g);
    const st = L.a;
    const tile = st.x + st.y * g.state.map.width;
    const coverage = new Map([[tile, [st.id]]]);
    setSetting(g.state, 'selectGoods', false);
    expect(acceptsFromSource(g.state, st, 'COAL')).toBe(true);
    expect(servingStations(g.state, coverage, [tile], 'COAL', st.x, st.y)).toEqual([st]);
  });
});

describe('improvedLoad', () => {
  /** Two coal wagons-trains parked at station A's stop (B arrived later than A). */
  function twoAtStation(on) {
    const g = flatGame(23);
    const L = coalLine(g);
    setSetting(g.state, 'improvedLoad', on);
    const a = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
    const b = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 1, cargoId: 'COAL' });
    expect(a.ok && b.ok).toBe(true);
    const st = L.a;
    for (const [v, since] of [[a.vehicle, 1], [b.vehicle, 2]]) {
      v.state = 'loading';
      v.atStationId = st.id;
      v.atStationSince = since;
      v.speed = 0;
    }
    addWaiting(st, 'COAL', 40, 10, 20, g.state.tick, 1000);
    markPickup(g.state, st, 'COAL', 0);
    return { g, st, first: a.vehicle, second: b.vehicle, ctx: { state: g.state, emit() {} } };
  }

  test('off (default): the later vehicle loads alongside the earlier one', () => {
    const { st, second, ctx } = twoAtStation(false);
    expect(loadCargo(ctx, second, st)).toBeGreaterThan(0);
  });

  test('on: the later arrival yields while an earlier one still wants the cargo', () => {
    const { st, second, ctx } = twoAtStation(true);
    const before = waitingAmount(st, 'COAL');
    expect(loadCargo(ctx, second, st)).toBe(0);
    expect(waitingAmount(st, 'COAL')).toBe(before);
  });

  test('on: the earlier arrival loads', () => {
    const { st, first, ctx } = twoAtStation(true);
    expect(loadCargo(ctx, first, st)).toBeGreaterThan(0);
  });

  test('on: a full earlier vehicle does not block the later one', () => {
    const { st, first, second, ctx } = twoAtStation(true);
    first.load.amount = first.capacity;
    expect(loadCargo(ctx, second, st)).toBeGreaterThan(0);
  });
});
