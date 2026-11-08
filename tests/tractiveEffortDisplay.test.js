/** F4: Tractive effort stat display (OpenTTD vehicle_gui.cpp / audit r26 #5). */
import { test, expect, describe } from 'bun:test';
import { vehicleSpecs, modelTractiveKn } from '../js/simulation/vehicleSpec.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { ENGINE_TONNES, GROUND_ACCELERATION, TRACTIVE_EFFORT } from '../js/simulation/loco/trainRealistic.js';

const expectedKn = () => Math.round(ENGINE_TONNES * GROUND_ACCELERATION * TRACTIVE_EFFORT / 256 / 100) / 10;

describe('modelTractiveKn', () => {
  test('returns kN for powered engines (formula)', () => {
    expect(modelTractiveKn(MODEL_BY_ID.eng_puffer)).toBe(expectedKn());
    expect(modelTractiveKn(MODEL_BY_ID.eng_comet)).toBe(expectedKn());
    expect(modelTractiveKn(MODEL_BY_ID.eng_thunder)).toBe(expectedKn());
    expect(modelTractiveKn(MODEL_BY_ID.eng_arrow)).toBe(expectedKn());
    expect(modelTractiveKn(MODEL_BY_ID.eng_bolt)).toBe(expectedKn());
  });
  test('returns null for wagons and road vehicles', () => {
    expect(modelTractiveKn(MODEL_BY_ID.wag_hopper)).toBeNull();
    expect(modelTractiveKn(MODEL_BY_ID.wag_coach)).toBeNull();
    expect(modelTractiveKn(MODEL_BY_ID.bus_city)).toBeNull();
    expect(modelTractiveKn(MODEL_BY_ID.trk_bulk)).toBeNull();
  });
  test('returns null for missing/empty model', () => {
    expect(modelTractiveKn(null)).toBeNull();
    expect(modelTractiveKn({})).toBeNull();
  });
});

describe('vehicleSpecs tractiveKn', () => {
  test('returns tractiveKn (number) for train engines with power', () => {
    for (const id of ['eng_puffer', 'eng_comet', 'eng_thunder']) {
      const eng = MODEL_BY_ID[id];
      const s = vehicleSpecs({ kind: 'train', modelId: id, wagons: 1 }, eng);
      expect(typeof s.tractiveKn).toBe('number');
      expect(s.tractiveKn).toBe(expectedKn());
    }
  });
  test('returns null for road vehicles', () => {
    const m = MODEL_BY_ID.bus_city;
    expect(vehicleSpecs({ kind: 'road', modelId: m.id }, m).tractiveKn).toBeNull();
  });
  test('returns null for non-train kinds even if model has power-like fields absent', () => {
    const eng = MODEL_BY_ID.eng_thunder;
    // a wagon-as-model case: vehicle kind train but using wagon? wagons have no power
    expect(vehicleSpecs({ kind: 'train', modelId: 'wag_hopper', wagons: 0 }, MODEL_BY_ID.wag_hopper).tractiveKn).toBeNull();
    expect(vehicleSpecs({ kind: 'road', modelId: eng.id }, eng).tractiveKn).toBeNull();
  });
});

describe('vehicle detail formatting', () => {
  test('formats tractive effort as "N kN" or em dash', () => {
    const fmt = (kn) => kn != null ? `${kn} kN` : '—';
    expect(fmt(expectedKn())).toBe(`${expectedKn()} kN`);
    expect(fmt(null)).toBe('—');
    // train engine shows value
    const eng = MODEL_BY_ID.eng_comet;
    expect(fmt(vehicleSpecs({ kind: 'train', modelId: eng.id }, eng).tractiveKn)).toMatch(/ kN$/);
    // road shows dash
    const bus = MODEL_BY_ID.bus_city;
    expect(fmt(vehicleSpecs({ kind: 'road', modelId: bus.id }, bus).tractiveKn)).toBe('—');
  });
});
