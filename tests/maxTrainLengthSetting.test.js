import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { Game } from '../js/simulation/game.js';
import { addWagons } from '../js/simulation/cmdVehicle.js';
import { maxTrainLengthTiles, trainLengthTiles } from '../js/simulation/platformLength.js';

describe('maxTrainLength setting (OpenTTD vehicle.max_train_length)', () => {
  test('default maxTrainLength is 7 tiles in DEFAULT_SETTINGS and getSetting(g.state, "maxTrainLength")', () => {
    expect(DEFAULT_SETTINGS.maxTrainLength).toBe(7);
    const g = flatGame();
    expect(getSetting(g.state, 'maxTrainLength')).toBe(7);
    expect(maxTrainLengthTiles(g.state)).toBe(7);
  });

  test('train length check: setting maxTrainLength to 3 tiles restricts train to 5 wagons ((1+5)*0.5 = 3.0 ok, 6 wagons = 3.5 fails)', () => {
    const g = flatGame();
    setSetting(g.state, 'maxTrainLength', 3);
    const L = coalLine(g);

    // 5 wagons: (5 + 1) * 0.5 = 3.0 tiles -> OK
    const ok = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 5, cargoId: 'COAL' });
    expect(ok.ok).toBe(true);
    expect(ok.vehicle.wagons).toBe(5);
    expect(trainLengthTiles(ok.vehicle)).toBe(3.0);

    // 6 wagons: (6 + 1) * 0.5 = 3.5 tiles -> Fails
    const fails = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 6, cargoId: 'COAL' });
    expect(fails.ok).toBe(false);
    expect(fails.error).toBe('Train is too long');
  });

  test('addWagons enforces maxTrainLength', () => {
    const g = flatGame();
    setSetting(g.state, 'maxTrainLength', 3);
    const L = coalLine(g);

    // Buy with 3 wagons: (3 + 1) * 0.5 = 2.0 tiles
    const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 3, cargoId: 'COAL' });
    expect(r.ok).toBe(true);

    // Adding 2 wagons brings it to 5 wagons (3.0 tiles) -> OK
    const add2 = addWagons(g.ctx, r.vehicle.id, 2);
    expect(add2.ok).toBe(true);
    expect(r.vehicle.wagons).toBe(5);

    // Adding 1 more wagon would make 6 wagons (3.5 tiles) -> Refused with 'Train is too long'
    const add1 = addWagons(g.ctx, r.vehicle.id, 1);
    expect(add1.ok).toBe(false);
    expect(add1.error).toBe('Train is too long');
  });

  test('increasing maxTrainLength allows longer trains', () => {
    const g = flatGame();
    setSetting(g.state, 'maxTrainLength', 3);
    const L = coalLine(g);

    const r1 = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 6, cargoId: 'COAL' });
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe('Train is too long');

    // Increase maxTrainLength to 4 tiles: allows up to (4/0.5)-1 = 7 wagons
    setSetting(g.state, 'maxTrainLength', 4);
    const r2 = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 6, cargoId: 'COAL' });
    expect(r2.ok).toBe(true);
    expect(r2.vehicle.wagons).toBe(6);
  });

  test('SETTING_META has key maxTrainLength in vehicles group', () => {
    const entry = SETTING_META.find((item) => item.key === 'maxTrainLength');
    expect(entry).toBeDefined();
    expect(entry.group).toBe('vehicles');
    expect(entry.label).toBe('Max train length (tiles)');
    expect(entry.type).toBe('select');
    expect(entry.options).toEqual([
      ['1', '1 tile'],
      ['2', '2 tiles'],
      ['3', '3 tiles'],
      ['4', '4 tiles'],
      ['5', '5 tiles'],
      ['7', '7 tiles (default)'],
      ['10', '10 tiles'],
      ['16', '16 tiles'],
      ['32', '32 tiles'],
      ['64', '64 tiles'],
    ]);
  });

  test('save/load serialization preserves maxTrainLength', () => {
    const g = flatGame();
    setSetting(g.state, 'maxTrainLength', 16);
    const back = Game.deserialize(g.serialize());
    expect(getSetting(back.state, 'maxTrainLength')).toBe(16);
    expect(maxTrainLengthTiles(back.state)).toBe(16);
  });
});
