import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { STATION_SPREAD } from '../js/simulation/stations.js';
import { MAX_WAGONS } from '../js/simulation/constants.js';
import { Game } from '../js/simulation/game.js';
import { addWagons } from '../js/simulation/cmdVehicle.js';

describe('stationSpread and maxTrainWagons settings', () => {
  test('defaults keep current behaviour', () => {
    expect(DEFAULT_SETTINGS.stationSpread).toBe(12);
    expect(DEFAULT_SETTINGS.maxTrainWagons).toBe(12);
    expect(STATION_SPREAD).toBe(12);
    expect(MAX_WAGONS).toBe(12);
    const g = flatGame();
    expect(getSetting(g.state, 'stationSpread')).toBe(12);
    expect(getSetting(g.state, 'maxTrainWagons')).toBe(12);
  });

  test('spread 16 allows a join refused at the default 12', () => {
    const refused = flatGame();
    const a1 = refused.buildRailStation(4, 24, 'x', 1);
    const f1 = refused.buildRailStation(4 + 13, 24, 'x', 1, { player: true, joinStationId: a1.stationId });
    expect(f1.ok).toBe(false);
    expect(f1.error).toMatch(/spread/);

    const g = flatGame();
    setSetting(g.state, 'stationSpread', 16);
    const a = g.buildRailStation(4, 24, 'x', 1);
    const far = g.buildRailStation(4 + 13, 24, 'x', 1, { player: true, joinStationId: a.stationId });
    expect(far.ok).toBe(true);
    expect(far.stationId).toBe(a.stationId);
  });

  test('maxTrainWagons 20 allows 20 wagons, refused at the default', () => {
    const d = flatGame();
    const dl = coalLine(d);
    const refused = d.buyVehicle(dl.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 20, cargoId: 'COAL' });
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/Wagons must be 0\.\.12/);

    const g = flatGame();
    setSetting(g.state, 'maxTrainWagons', 20);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 20, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(r.vehicle.wagons).toBe(20);
    const over = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 21, cargoId: 'COAL' });
    expect(over.ok).toBe(false);
  });

  test('addWagons extends a train to 20 with the setting, refused beyond it', () => {
    const g = flatGame();
    setSetting(g.state, 'maxTrainWagons', 20);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    const ok = addWagons(g.ctx, r.vehicle.id, 18);
    expect(ok.ok).toBe(true);
    expect(r.vehicle.wagons).toBe(20);
    expect(addWagons(g.ctx, r.vehicle.id, 1).ok).toBe(false);
  });

  test('24 wagons: a 20-wagon train steps without error', () => {
    const g = flatGame();
    setSetting(g.state, 'maxTrainWagons', 24);
    const L = coalLine(g);
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 20, cargoId: 'COAL' });
    expect(r.ok).toBe(true);
    expect(() => g.stepDays(5)).not.toThrow();
    expect(r.vehicle.wagons).toBe(20);
  });

  test('save/load keeps both settings', () => {
    const g = flatGame();
    setSetting(g.state, 'stationSpread', 24);
    setSetting(g.state, 'maxTrainWagons', 32);
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'stationSpread')).toBe(24);
    expect(getSetting(back.state, 'maxTrainWagons')).toBe(32);
  });
});
