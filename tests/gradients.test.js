import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting, DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';
import { gradeMph, landSpeedStep, targetSpeedTiles, totalWeight, PITCH_EBP_PER_GRADE, MPH_TO_TILES_PER_TICK } from '../js/simulation/loco/vehicleMotion.js';
import { serializeState, parseState } from '../js/simulation/save.js';
import { flatGame } from './helpers.js';

const small = { seed: 3, width: 64, height: 64, townCount: 3, industryCount: 4 };

function slopeState(kind, heightAt) {
  const W = 40, H = 4;
  const tiles = [];
  for (let i = 0; i < W * H; i++) tiles.push({ height: heightAt(i % W) });
  return { map: { width: W, height: H, tiles } };
}

describe('gradients', () => {
  test('default off', () => {
    expect(DEFAULT_SETTINGS.gradients).toBe(false);
  });

  test('uphill train is slower than flat; downhill never above maxSpeed', () => {
    const model = { speed: 120, kind: 'train', power: 300 };
    const target = targetSpeedTiles(model);
    const mk = (wagons) => ({ kind: 'train', wagons, load: null, speed: 0, maxSpeed: target,
      path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathIndex: 0, progress: 0,
      history: [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] });
    // flat
    const flat = slopeState('train', () => 5);
    const up = slopeState('train', (x) => 5 + x);
    const down = slopeState('train', (x) => 50 - x);
    const v = mk(4);
    expect(gradeMph(flat, v)).toBe(0);
    const gUp = gradeMph(up, v);
    expect(gUp).toBeGreaterThan(0);
    expect(gradeMph(down, v)).toBeLessThan(0);
    // run 200 ticks uphill vs flat: uphill slower
    let sFlat = 0, sUp = 0;
    for (let t = 0; t < 200; t++) {
      sFlat = landSpeedStep({ ...v, speed: sFlat }, model, target, 0);
      sUp = landSpeedStep({ ...v, speed: sUp }, model, target, gUp);
    }
    expect(sUp).toBeLessThan(sFlat);
    expect(sUp).toBeGreaterThan(0);
    // downhill bonus never exceeds maxSpeed
    let sDown = 0;
    for (let t = 0; t < 2000; t++) {
      sDown = landSpeedStep({ ...v, speed: sDown }, model, target, gradeMph(down, v));
      expect(sDown).toBeLessThanOrEqual(target + 1e-12);
    }
  });

  test('road vehicle on uphill is slower; heavier load loses more', () => {
    const model = { speed: 80, kind: 'road', power: 60 };
    const target = targetSpeedTiles(model);
    const st = slopeState('road', (x) => 3 + x);
    const rv = { kind: 'road', load: null, speed: 0, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathIndex: 0, progress: 0, history: [] };
    expect(gradeMph(st, rv)).toBeGreaterThan(0);
    const heavy = { ...rv, load: { amount: 200 } }; // 212 t
    expect(totalWeight(heavy)).toBeGreaterThan(totalWeight(rv));
    const run = (veh) => { let s = 0; for (let t = 0; t < 2000; t++) s = landSpeedStep({ ...veh, speed: s }, model, target, gradeMph(st, veh)); return s; };
    const sLight = run(rv), sHeavy = run(heavy);
    expect(sHeavy).toBeLessThan(sLight);
    expect(sLight).toBeLessThanOrEqual(target + 1e-12);
    // OL pitch term: a 212 t road vehicle on 7 % stalls; a 12 t one holds speed
    expect(sHeavy).toBe(0);
    expect(sLight).toBeCloseTo(target, 9);
  });

  test('OL pitch force: heavy train stalls on 3% grade, light train holds flat speed', () => {
    const model = { speed: 64, kind: 'train', power: 600 }; // Puffer 2-4-0
    const target = targetSpeedTiles(model);
    // wide grid: 16 wagons need 35 history cells; 1 level per tile => grade 0.3 (3 %)
    const wide = (hf) => { const W = 80, H = 4, tiles = []; for (let i = 0; i < W * H; i++) tiles.push({ height: hf(i % W) }); return { map: { width: W, height: H, tiles } }; };
    const up = wide((x) => 5 + x);
    const flatSt = wide(() => 5);
    // history: newest cell at the high end of the slope (train moves b -> a, a higher), all uphill
    const mk = (wagons) => {
      const history = [];
      for (let i = 0; i < wagons * 2 + 3; i++) history.push({ x: 60 - i, y: 0 });
      return { kind: 'train', wagons, load: null, speed: 0, maxSpeed: target,
        path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathIndex: 0, progress: 0, history };
    };
    const run = (v, st) => { let s = 0; for (let t = 0; t < 3000; t++) s = landSpeedStep({ ...v, speed: s }, model, target, gradeMph(st, v)); return s; };
    const heavy = mk(16), light = mk(2); // 460 t vs 110 t
    expect(gradeMph(up, heavy)).toBeCloseTo(0.3, 9);
    // heavy: pitch 460*0.3*25.6 = 3533 ebp > tractive ~2671: stalls on 3 % (flat it holds the same speed)
    expect(run(heavy, flatSt)).toBeCloseTo(target, 9);
    expect(run(heavy, up)).toBe(0);
    // light: 110 t: pitch ~844 ebp < tractive, holds target; never above target on the grade
    expect(run(light, up)).toBeCloseTo(run(light, flatSt), 9);
    expect(run(light, up)).toBeGreaterThan(0);
  });

  test('OL minSpeed floor: a moving heavy train on 3% crawls at 5 mph; from standstill it cannot start', () => {
    const model = { speed: 64, kind: 'train', power: 600 };
    const target = targetSpeedTiles(model);
    const heavy = { kind: 'train', wagons: 16, load: null, speed: target, maxSpeed: target };
    let s = target;
    for (let t = 0; t < 3000; t++) s = landSpeedStep({ ...heavy, speed: s }, model, target, 0.3);
    expect(s / MPH_TO_TILES_PER_TICK).toBeCloseTo(5, 6); // mph
    expect(landSpeedStep({ ...heavy, speed: 0 }, model, target, 0.3)).toBe(0);
  });

  test('OL pitch force is signed and weight-scaled (uncapped regime, below the 0.5 mph/tick cap)', () => {
    const model = { speed: 64, kind: 'train', power: 600 };
    const target = targetSpeedTiles(model);
    // 16 wagons (460 t) at low speed: pitch term (uphill) is large enough that the 0.5 mph cap does not bind
    const v = { kind: 'train', wagons: 16, load: null, speed: targetSpeedTiles(model) * 0.25 };
    const up = landSpeedStep(v, model, target, 0.3), flat = landSpeedStep(v, model, target, 0);
    const down = landSpeedStep(v, model, target, -0.3);
    expect(up).toBeLessThan(flat);
    expect(down).toBeGreaterThanOrEqual(flat);
    // Input grade 0.3 is the 10x form of a 3% slope ratio (0.03), so pitch per ton is 0.03 * 256.
    expect(PITCH_EBP_PER_GRADE * 0.3).toBeCloseTo(7.68, 9);
    expect(PITCH_EBP_PER_GRADE * 0.3 / 10).toBeCloseTo(0.768, 9);
  });

  test('off by default: game speeds identical with and without gradients key', () => {
    const a = Game.create(small);
    const b = Game.create(small);
    setSetting(b.state, 'gradients', false);
    for (let i = 0; i < 50; i++) { a.tick?.(); b.tick?.(); }
    expect(JSON.stringify(a.state.vehicles ?? [])).toBe(JSON.stringify(b.state.vehicles ?? []));
  });

  test('setting survives save/load', () => {
    const g = Game.create(small);
    setSetting(g.state, 'gradients', true);
    const back = parseState(serializeState(g.state));
    expect(getSetting(back, 'gradients')).toBe(true);
  });
});

describe('slope steepness settings', () => {
  const mkTrain = (wagons) => ({ kind: 'train', wagons, load: null, speed: 0, maxSpeed: 1,
    path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathIndex: 0, progress: 0,
    history: [{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] });
  const mkRoad = () => ({ kind: 'road', wagons: 0, load: null, speed: 0, maxSpeed: 1,
    path: [{ x: 1, y: 0 }, { x: 2, y: 0 }], pathIndex: 0, progress: 0, history: [] });
  const up = slopeState('train', (x) => 5 + x);

  test('defaults: 3 train / 7 road, both in DEFAULT_SETTINGS', () => {
    expect(DEFAULT_SETTINGS.trainSlopeSteepness).toBe(3);
    expect(DEFAULT_SETTINGS.roadSlopeSteepness).toBe(7);
  });

  test('defaults reproduce the historical grade numbers exactly', () => {
    // train: avg sign over 4 history segments = 2/4 -> (3/100)*10*0.5
    expect(gradeMph({ ...up, settings: undefined }, mkTrain(4))).toBe((3 / 100) * 10 * (2 / 4));
    // road: head segment uphill, sign +1 -> (7/100)*10*1
    expect(gradeMph(up, mkRoad())).toBe((7 / 100) * 10 * 1);
    // explicit default values give identical numbers
    const explicit = { ...up, settings: { trainSlopeSteepness: 3, roadSlopeSteepness: 7 } };
    expect(gradeMph(explicit, mkTrain(4))).toBe(gradeMph(up, mkTrain(4)));
    expect(gradeMph(explicit, mkRoad())).toBe(gradeMph(up, mkRoad()));
  });

  test('trainSlopeSteepness 0 makes the train grade term zero', () => {
    const st = { ...up, settings: { trainSlopeSteepness: 0 } };
    expect(gradeMph(st, mkTrain(4))).toBe(0);
    // road unaffected
    expect(gradeMph(st, mkRoad())).toBe((7 / 100) * 10 * 1);
  });

  test('roadSlopeSteepness scales the road grade term; trains unaffected', () => {
    const st = { ...up, settings: { roadSlopeSteepness: 10 } };
    expect(gradeMph(st, mkRoad())).toBe((10 / 100) * 10 * 1);
    expect(gradeMph(st, mkTrain(4))).toBe(gradeMph(up, mkTrain(4)));
  });

  test('gradients off: gate in movement ignores both steepness settings (grade is 0)', () => {
    const g = Game.create(small);
    setSetting(g.state, 'gradients', false);
    setSetting(g.state, 'trainSlopeSteepness', 10);
    setSetting(g.state, 'roadSlopeSteepness', 10);
    expect(getSetting(g.state, 'gradients')).toBe(false);
    // movement.js uses getSetting('gradients') ? gradeMph : 0; with it off the grade is 0 regardless
    const grade = getSetting(g.state, 'gradients') ? gradeMph(g.state, mkTrain(4)) : 0;
    expect(grade).toBe(0);
  });

  test('settings invariant: every new key has exactly one SETTING_META entry', () => {
    for (const k of ['trainSlopeSteepness', 'roadSlopeSteepness']) {
      expect(SETTING_META.filter((m) => m.key === k).length).toBe(1);
      expect(Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k)).toBe(true);
    }
    const meta = SETTING_META.find((m) => m.key === 'trainSlopeSteepness');
    expect(meta.type).toBe('number');
    expect(meta.min).toBe(0);
    expect(meta.max).toBe(10);
  });
});
