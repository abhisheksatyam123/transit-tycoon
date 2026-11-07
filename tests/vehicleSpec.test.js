import { test, expect, describe } from 'bun:test';
import { vehicleSpecs, consistRows } from '../js/simulation/vehicleSpec.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { ENGINE_TONNES, GROUND_ACCELERATION, TRACTIVE_EFFORT } from '../js/simulation/loco/trainRealistic.js';

describe('vehicle detail specs', () => {
  test('train weight: engine + wagons, loaded vs empty; power from model; TE from formula', () => {
    const eng = MODEL_BY_ID.eng_thunder;
    const v = { kind: 'train', modelId: eng.id, wagons: 2, load: { amount: 30 } };
    const s = vehicleSpecs(v, eng);
    expect(s.weightEmpty).toBe(ENGINE_TONNES + 2 * 25);
    expect(s.weightLoaded).toBe(ENGINE_TONNES + 2 * 25 + 30);
    expect(s.power).toBe(eng.power);
    expect(s.tractiveKn).toBe(Math.round(ENGINE_TONNES * GROUND_ACCELERATION * TRACTIVE_EFFORT / 256 / 100) / 10);
  });
  test('no load: loaded equals empty', () => {
    const v = { kind: 'train', modelId: 'eng_puffer', wagons: 0 };
    const s = vehicleSpecs(v, MODEL_BY_ID.eng_puffer);
    expect(s.weightLoaded).toBe(s.weightEmpty);
  });
  test('road vehicle has no stored power or traction effort', () => {
    const m = MODEL_BY_ID.bus_city;
    const s = vehicleSpecs({ kind: 'road', modelId: m.id, load: { amount: 5 } }, m);
    expect(s.power).toBeNull();
    expect(s.tractiveKn).toBeNull();
  });
  test('consist rows: engine first, then each wagon with cargo and capacity', () => {
    const v = { kind: 'train', modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' };
    const rows = consistRows(v);
    expect(rows.length).toBe(3);
    expect(rows[0].cargoId).toBeNull();
    expect(rows[1]).toEqual({ name: MODEL_BY_ID.wag_hopper.name, cargoId: 'COAL', capacity: MODEL_BY_ID.wag_hopper.capacity });
  });
});
