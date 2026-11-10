// OpenTTD difficulty.train_flip_reverse_allowed (def 'all') -> settings.trainFlipReverse: 'all' | 'endOfLine' | 'none'.
import { test, expect, describe } from 'bun:test';
import { flatGame, coalLine } from './helpers.js';
import { DEFAULT_SETTINGS, setSetting, getSetting } from '../js/simulation/settings.js';
import { canFlipTrain } from '../js/simulation/routing.js';
import { turnAround } from '../js/simulation/movement.js';
import { SETTING_META } from '../js/ui/settingsGroups.js';

function setup(mode) {
  const g = flatGame(29);
  const L = coalLine(g);
  if (mode) setSetting(g.state, 'trainFlipReverse', mode);
  const r = g.buyVehicle(L.depotId, { modelId: 'eng_puffer', wagonModelId: 'wag_hopper', wagons: 2, cargoId: 'COAL' });
  expect(r.ok).toBe(true);
  expect(g.setOrders(r.vehicle.id, [{ stationId: L.a.id, full: true }, { stationId: L.b.id }]).ok).toBe(true);
  return { g, L, v: r.vehicle };
}

describe('trainFlipReverse setting', () => {
  test('defaults to all and is a Difficulty select', () => {
    expect(DEFAULT_SETTINGS.trainFlipReverse).toBe('all');
    const meta = SETTING_META.find((m) => m.key === 'trainFlipReverse');
    expect(meta.group).toBe('difficulty');
    expect(meta.options.map((o) => o[0])).toEqual(['all', 'endOfLine', 'none']);
  });

  test("all: stopped train reverses anywhere (default behaviour)", () => {
    const { g, v } = setup();
    g.startVehicle(v.id);
    for (let i = 0; i < 300 && v.state !== 'running'; i++) g.step();
    g.stopVehicle(v.id);
    const before = !!v.flipped;
    expect(g.reverseVehicle(v.id).ok).toBe(true);
    expect(!!v.flipped).toBe(!before);
  });

  test('none: the reverse command is refused and the train does not flip', () => {
    const { g, v } = setup('none');
    g.startVehicle(v.id);
    for (let i = 0; i < 300 && v.state !== 'running'; i++) g.step();
    g.stopVehicle(v.id);
    const before = !!v.flipped;
    const r = g.reverseVehicle(v.id);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cannot reverse/);
    expect(!!v.flipped).toBe(before);
  });

  test('endOfLine: a mid-track train may not reverse, a dead-end train may', () => {
    const g = flatGame();
    expect(g.buildRail(10, 30, 20, 30).ok).toBe(true);
    setSetting(g.state, 'trainFlipReverse', 'endOfLine');
    const mid = { kind: 'train', tx: 15, ty: 30 };
    const end = { kind: 'train', tx: 10, ty: 30 }; // one rail link: the line's end
    expect(canFlipTrain(g.state, mid)).toBe(false);
    expect(canFlipTrain(g.state, end)).toBe(true);
    // road vehicles are never restricted
    expect(canFlipTrain(g.state, { kind: 'road', tx: 15, ty: 30 })).toBe(true);
  });

  test('none: a blocked train does not turn around (turnAround leaves it in place)', () => {
    const g = flatGame();
    expect(g.buildRail(10, 30, 20, 30).ok).toBe(true);
    setSetting(g.state, 'trainFlipReverse', 'none');
    const v = { kind: 'train', tx: 15, ty: 30, flipped: false, history: [{ x: 16, y: 30 }, { x: 15, y: 30 }], path: [{ x: 14, y: 30 }], pathIndex: 0, speed: 1, progress: 0, blockedTicks: 9, state: 'running', wagons: 1, id: 999 };
    turnAround({ state: g.state }, v);
    expect(v.flipped).toBe(false);
    expect(v.speed).toBe(1);
  });

  test('default all: canFlipTrain is true everywhere', () => {
    const g = flatGame();
    expect(getSetting(g.state, 'trainFlipReverse')).toBe('all');
    expect(canFlipTrain(g.state, { kind: 'train', tx: 15, ty: 30 })).toBe(true);
  });
});
