/**
 * Scripted play test: a player builds a coal line, runs it for months, reads the income, and
 * saves and loads the game. The loaded game must match the original and continue identically.
 */
import { describe, expect, test, beforeAll } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { flatGame, coalLine } from './helpers.js';
import { TICKS_PER_DAY } from '../js/simulation/constants.js';

const RUN_DAYS = 100;
const SLOW = 120_000;

let g, L, vehicleId, moneyBefore, startTick;

beforeAll(() => {
  g = flatGame(11);
  L = coalLine(g);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  vehicleId = r.vehicle.id;
  expect(g.setOrders(vehicleId, [{ stationId: L.a.id, loadMode: 'full' }, { stationId: L.b.id }]).ok).toBe(true);
  expect(g.startVehicle(vehicleId).ok).toBe(true);
  moneyBefore = g.state.company.money;
  startTick = g.state.tick;
  g.stepDays(RUN_DAYS);
}, SLOW);

/** The fields a save must carry unchanged: time, money, cargo history, and where each vehicle is. */
function snapshot(game) {
  const s = game.state;
  return {
    tick: s.tick,
    date: { ...s.date },
    money: s.company.money,
    history: [...(s.company.cargoUnitsDeliveredHistory || [])],
    vehicles: s.vehicles.map((v) => [v.id, v.state, v.tx, v.ty, v.cargoId ?? null, v.load?.amount ?? 0]),
  };
}

describe('scripted play: coal line', () => {
  test('the line is built: two rail stations, a depot, and one running train', () => {
    expect(g.state.stations.some((s) => s.id === L.a.id)).toBe(true);
    expect(g.state.stations.some((s) => s.id === L.b.id)).toBe(true);
    const v = g.state.vehicles.find((x) => x.id === vehicleId);
    expect(v).toBeDefined();
    expect(v.state).toBe('running');
  }, SLOW);

  test('the run takes time: the clock advanced by the run length', () => {
    expect(g.state.tick - startTick).toBeGreaterThanOrEqual(RUN_DAYS * TICKS_PER_DAY);
  }, SLOW);

  test('coal is delivered: the monthly delivery history records units', () => {
    const delivered = (g.state.company.cargoUnitsDeliveredHistory || []).reduce((a, b) => a + b, 0);
    expect(delivered).toBeGreaterThan(0);
  }, SLOW);

  test('income: the company ends the run with more money than it started', () => {
    expect(g.state.company.money).toBeGreaterThan(moneyBefore);
  }, SLOW);

  test('save/load round trip: the loaded game matches the saved one', () => {
    const json = g.serialize();
    const h = Game.deserialize(json);
    expect(snapshot(h)).toEqual(snapshot(g));
    // serialising the loaded game gives back the same string (the save is stable)
    expect(h.serialize()).toBe(json);
  }, SLOW);

  test('save/load round trip: the loaded game continues exactly like the original', () => {
    const h = Game.deserialize(g.serialize());
    g.stepDays(20);
    h.stepDays(20);
    expect(snapshot(h)).toEqual(snapshot(g));
  }, SLOW);
});
