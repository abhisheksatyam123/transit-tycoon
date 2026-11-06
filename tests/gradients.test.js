import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { setSetting, DEFAULT_SETTINGS, getSetting } from '../js/simulation/settings.js';
import { gradeMph, landSpeedStep, targetSpeedTiles, totalWeight } from '../js/simulation/loco/vehicleMotion.js';
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
    const heavy = { ...rv, load: { amount: 40 } };
    expect(totalWeight(heavy)).toBeGreaterThan(totalWeight(rv));
    const run = (veh) => { let s = 0; for (let t = 0; t < 2000; t++) s = landSpeedStep({ ...veh, speed: s }, model, target, gradeMph(st, veh)); return s; };
    const sLight = run(rv), sHeavy = run(heavy);
    expect(sHeavy).toBeLessThan(sLight);
    expect(sLight).toBeLessThanOrEqual(target + 1e-12);
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
