/** order.gradual_loading, unloading: the stop unloads per cycle (allowance per part), paid per slice. */
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { setSetting } from '../js/simulation/settings.js';
import { arriveAtStation, loadingTick, unloadCargoCycle, LOAD_TICKS } from '../js/simulation/orders.js';
import { addWagonModel } from '../js/simulation/cmdVehicle.js';

/**
 * Coal train of `wagons` hoppers, loaded full at station A (or at B when `loadedAtB`), arriving at station
 * `at` ('B' = the power station side, which accepts coal; 'A' = the mine side, which does not).
 */
function arrival(wagons, on, { at = 'B', loadedAtB = false } = {}) {
  const g = flatGame(51);
  const L = coalLine(g);
  if (on) setSetting(g.state, 'gradualLoading', true);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  const v = r.vehicle;
  v.load.amount = v.capacity;
  const from = loadedAtB ? L.b : L.a;
  v.load.sourceX = from.x; v.load.sourceY = from.y; v.load.sinceTick = g.state.tick;
  v.load.fromStationId = from.id;
  const incomes = [];
  const ctx = { state: g.state, emit(name, d) { if (name === 'income') incomes.push(d.units); } };
  const st = at === 'A' ? L.a : L.b;
  arriveAtStation(ctx, v, st);
  return { g, L, v, st, ctx, incomes };
}

/** Run loadingTick until the vehicle is ready to leave. */
function stop(ctx, v, maxTicks = 5000) {
  for (let t = 0; t < maxTicks; t++) if (loadingTick(ctx, v)) return true;
  return false;
}

describe('gradual unloading', () => {
  test('arrival: cargo stays aboard, the stop unloads it in cycles of 20 (4 wagons x 5)', () => {
    const { v, ctx, incomes } = arrival(4, true);
    expect(v.unloadPending).toBe(true);
    expect(v.load.amount).toBe(v.capacity);       // nothing delivered at the arrival tick
    expect(incomes.length).toBe(0);
    expect(stop(ctx, v)).toBe(true);
    expect(v.load.amount).toBe(0);
    expect(v.unloadPending).toBeUndefined();
    // every full slice is 20 units; the last one is what was left
    const full = incomes.slice(0, -1);
    expect(full.length).toBeGreaterThan(1);
    for (const u of full) expect(u).toBe(20);
  });

  test('the delivered total equals the load (slices add up)', () => {
    const { v, ctx, incomes } = arrival(4, true);
    const cap = v.capacity;
    stop(ctx, v);
    expect(incomes.reduce((a, b) => a + b, 0)).toBe(cap);
  });

  test('default off: one step delivers the whole load on arrival (unchanged)', () => {
    const { v, incomes } = arrival(4, false);
    expect(v.load.amount).toBe(0);
    expect(v.unloadPending).toBeUndefined();
    expect(incomes.length).toBe(1);
  });

  test('cargo the station does not accept stays aboard; the vehicle departs with it', () => {
    // station A (the mine end) does not accept coal: loaded at B, arriving at A, nothing is unloaded
    const { v, ctx } = arrival(4, true, { at: 'A', loadedAtB: true });
    expect(stop(ctx, v)).toBe(true);
    expect(v.load.amount).toBe(v.capacity);
    expect(v.unloadPending).toBeUndefined();
  });

  test('a cycle with nothing to unload reports not filled', () => {
    const { v, st, ctx } = arrival(4, true);
    v.load.amount = 0;
    expect(unloadCargoCycle(ctx, v, st)).toEqual({ took: 0, filled: false });
  });

  test('the first unloading waits the normal stop time (LOAD_TICKS) before cycle 1', () => {
    const { v, ctx } = arrival(4, true);
    for (let t = 0; t < LOAD_TICKS - 1; t++) loadingTick(ctx, v);
    expect(v.load.amount).toBe(v.capacity);
    loadingTick(ctx, v);
    expect(v.load.amount).toBe(v.capacity - 20);
  });

  test('mixed consist: each cargo slice unloads at its own wagons\' allowance (3 hoppers -> 15 coal per cycle)', () => {
    const g = flatGame(52);
    const L = coalLine(g);
    setSetting(g.state, 'gradualLoading', true);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 3, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const v = r.vehicle;
    expect(addWagonModel(g.ctx, v.id, 'wag_coach').ok).toBe(true); // 3 hoppers + a coach, before the stop
    // 90 coal in the hoppers, 40 passengers in the coach
    v.loads = {
      COAL: { amount: 90, sourceX: L.mine.x, sourceY: L.mine.y, sinceTick: g.state.tick, fromStationId: L.a.id },
      PASS: { amount: 40, sourceX: L.a.x, sourceY: L.a.y, sinceTick: g.state.tick, fromStationId: L.a.id },
    };
    v.load.amount = 130;
    const incomes = [];
    const ctx = { state: g.state, emit(name, d) { if (name === 'income') incomes.push({ cargo: d.cargoId, units: d.units }); } };
    arriveAtStation(ctx, v, L.b);
    expect(v.unloadPending).toBe(true);
    expect(stop(ctx, v)).toBe(true);
    const coal = incomes.filter((i) => i.cargo === 'COAL');
    expect(coal.reduce((a, i) => a + i.units, 0)).toBe(90);
    for (const i of coal.slice(0, -1)) expect(i.units).toBe(15);
    expect(v.loads.COAL ? v.loads.COAL.amount || 0 : 0).toBe(0);
  });

  test('cargodist: a destination-less packet is cut in step with the cycle and delivered whole', () => {
    const { v, ctx, incomes } = arrival(4, true);
    v.load.dests = { u: v.load.amount };
    expect(stop(ctx, v)).toBe(true);
    expect(v.load.amount).toBe(0);
    expect(v.load.dests).toBeUndefined();
    expect(incomes.reduce((a, b) => a + b, 0)).toBe(v.capacity);
  });
});
