// N5 phase 0/1 prep: engineList(v) routing and engine weight/multihead defaults. Single-engine output must
// be byte-identical to the pre-refactor motion (golden values captured from main before the refactor).
import { test, expect, describe } from 'bun:test';
import { engineList } from '../js/simulation/consist.js';
import { engineList as engineListDirect, engineWeight, engineWeightById, isMultihead, DEFAULT_ENGINE_WEIGHT } from '../js/simulation/consistEngines.js';
import { MODEL_BY_ID } from '../js/config/vehicles.js';
import { totalWeight, totalPower } from '../js/simulation/loco/vehicleMotion.js';
import { realisticTrainSpeedStep, consistMotion, ENGINE_TONNES } from '../js/simulation/loco/trainRealistic.js';
import { KMH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { vehicleSpecs, modelTractiveKn } from '../js/simulation/vehicleSpec.js';

describe('engineList', () => {
  test('re-exported from consist.js and the leaf module is the same function', () => {
    expect(engineList).toBe(engineListDirect);
  });
  test('uniform train: [modelId]', () => {
    expect(engineList({ kind: 'train', modelId: 'eng_thunder', wagons: 3, wagonModelId: 'wag_coach' })).toEqual(['eng_thunder']);
  });
  test('mixed-consist train: still one engine, [modelId] (wagons do not add engines)', () => {
    const v = { kind: 'train', modelId: 'eng_puffer', wagons: 2, consist: [{ modelId: 'wag_hopper', cargoId: 'COAL' }, { modelId: 'wag_coach' }] };
    expect(engineList(v)).toEqual(['eng_puffer']);
  });
  test('train with no wagons: [modelId]', () => {
    expect(engineList({ kind: 'train', modelId: 'eng_comet', wagons: 0 })).toEqual(['eng_comet']);
  });
  test('non-train vehicles have no engine list', () => {
    expect(engineList({ kind: 'road', modelId: 'bus_city' })).toEqual([]);
    expect(engineList({ kind: 'aircraft', modelId: 'air_x' })).toEqual([]);
    expect(engineList({ kind: 'ship', modelId: 'ship_x' })).toEqual([]);
    expect(engineList(null)).toEqual([]);
    expect(engineList(undefined)).toEqual([]);
  });
  test('lists are frozen and shared (no per-call allocation)', () => {
    const a = engineList({ kind: 'train', modelId: 'eng_bolt' });
    const b = engineList({ kind: 'train', modelId: 'eng_bolt', wagons: 9 });
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(engineList({ kind: 'road' }))).toBe(true);
  });
});

describe('engine weight / multihead defaults (phase 1, no data change)', () => {
  test('absent weight = 60 (the historical constant); ENGINE_TONNES kept', () => {
    expect(DEFAULT_ENGINE_WEIGHT).toBe(60);
    expect(ENGINE_TONNES).toBe(60);
    expect(engineWeight({ id: 'x' })).toBe(60);
    expect(engineWeight(undefined)).toBe(60);
    expect(engineWeight({ weight: 75 })).toBe(75);
  });
  test('every train engine model carries weight 60 (data equals the default)', () => {
    // D17: multihead pairs are the one exception (a pair weighs two halves; see multiheadPairs.test.js)
    const engines = Object.values(MODEL_BY_ID).filter((m) => m.kind === 'engine' && !m.multihead);
    expect(engines.length).toBeGreaterThan(0);
    for (const m of engines) expect(engineWeightById(m.id)).toBe(60);
  });
  test('unknown engine id uses the default weight', () => {
    expect(engineWeightById('no_such_engine')).toBe(60);
  });
  test('engines are singlehead by default', () => {
    expect(isMultihead(MODEL_BY_ID.eng_thunder)).toBe(false);
    expect(isMultihead({ multihead: true })).toBe(true);
    expect(isMultihead(undefined)).toBe(false);
  });
  test('TE display formula unchanged (60 t engine)', () => {
    expect(modelTractiveKn(MODEL_BY_ID.eng_thunder)).toBe(174.6);
    expect(modelTractiveKn(MODEL_BY_ID.eng_puffer)).toBe(174.6);
  });
});

describe('golden single-engine motion (captured from main before the refactor)', () => {
  test('weights and power are unchanged', () => {
    const m = MODEL_BY_ID.eng_bolt;
    const v = { kind: 'train', modelId: 'eng_bolt', wagons: 7, speed: 0, load: { amount: 120 } };
    expect(totalWeight(v)).toBe(355);
    expect(totalPower(v, m)).toBe(3800);
    const c = consistMotion(v, m);
    expect(c.mass).toBe(355);
    expect(c.power).toBe(2834800);
    expect(c.te).toBe(174562.5);
    expect(c.axle).toBe(3550);
    expect(c.airCoef).toBe(0.308);
    expect(c.engines).toBe(0);
    expect(c.modelId).toBe('eng_bolt');
  });
  test('acceleration trace is bit-identical to main', () => {
    const m = MODEL_BY_ID.eng_bolt;
    const v = { kind: 'train', modelId: 'eng_bolt', wagons: 7, speed: 0, load: { amount: 120 } };
    const target = m.speed * KMH_TO_TILES_PER_TICK;
    let at40 = 0, at500 = 0, at3000 = 0;
    for (let t = 1; t <= 3000; t++) {
      v.speed = realisticTrainSpeedStep(v, m, target, 0);
      if (t === 40) at40 = v.speed;
      if (t === 500) at500 = v.speed;
    }
    at3000 = v.speed;
    expect(at40).toBe(0.020779667809887322);
    expect(at500).toBe(0.1656642256884626);
    expect(at3000).toBe(0.2281263784491862);
  });
  test('motion cache is rebuilt when the model changes and reused when it does not', () => {
    const v = { kind: 'train', modelId: 'eng_puffer', wagons: 1, speed: 0 };
    const a = consistMotion(v, MODEL_BY_ID.eng_puffer);
    expect(consistMotion(v, MODEL_BY_ID.eng_puffer)).toBe(a);
    v.modelId = 'eng_thunder';
    const b = consistMotion(v, MODEL_BY_ID.eng_thunder);
    expect(b).not.toBe(a);
    expect(b.modelId).toBe('eng_thunder');
    expect(b.power).toBe(MODEL_BY_ID.eng_thunder.power * 746);
  });
  test('spec weight of a 2-wagon loaded thunder is unchanged', () => {
    const eng = MODEL_BY_ID.eng_thunder;
    const s = vehicleSpecs({ kind: 'train', modelId: eng.id, wagons: 2, load: { amount: 30 } }, eng);
    expect(s.weightLoaded).toBe(60 + 50 + 30);
    expect(s.weightEmpty).toBe(110);
  });
});
