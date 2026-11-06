import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { Game } from '../js/simulation/game.js';
import { getSetting, setSetting, DEFAULT_SETTINGS } from '../js/simulation/settings.js';
import { updateMonthly, TREE_MAX_NEW } from '../js/simulation/treeGrowth.js';

const forests = (s) => s.map.tiles.reduce((n, t) => n + (t.terrain === 'forest' ? 1 : 0), 0);

/** Flat game with a forest block x 10..30, y 15..25 (grass around it). */
function forestGame() {
  const g = flatGame(7);
  for (let y = 15; y <= 25; y++) for (let x = 10; x <= 30; x++) g.state.map.tiles[y * g.state.map.width + x].terrain = 'forest';
  return g;
}

describe('tree growth', () => {
  test('off by default: setting is false and a monthly pass changes nothing', () => {
    expect(DEFAULT_SETTINGS.treeGrowth).toBe(false);
    const g = forestGame();
    const before = g.serialize();
    const rng = g.state.rngState;
    expect(updateMonthly(g)).toBe(0);
    expect(g.state.rngState).toBe(rng);
    expect(g.serialize()).toBe(before);
    expect(g.state.settings).toBeUndefined();
  });

  test('on: trees spread to adjacent grass, bounded per pass', () => {
    const g = forestGame();
    setSetting(g.state, 'treeGrowth', true);
    const before = forests(g.state);
    const planted = updateMonthly(g);
    expect(planted).toBeGreaterThan(0);
    expect(planted).toBeLessThanOrEqual(TREE_MAX_NEW);
    expect(forests(g.state)).toBe(before + planted);
  });

  test('never plants on buildings, track, roads or water', () => {
    const g = forestGame();
    const s = g.state;
    g.buildRoad(10, 30, 30, 30);
    setSetting(s, 'treeGrowth', true);
    for (let m = 0; m < 30; m++) updateMonthly(g);
    for (let x = 10; x <= 30; x++) {
      const t = s.map.tiles[30 * s.map.width + x];
      expect(t.road).toBeTruthy();
      expect(t.terrain).toBe('grass');
    }
  });

  test('deterministic: same seed gives the same forest after many months', () => {
    const run = () => {
      const g = forestGame();
      setSetting(g.state, 'treeGrowth', true);
      for (let m = 0; m < 24; m++) updateMonthly(g);
      return g.serialize();
    };
    expect(run()).toBe(run());
  });

  test('bounded: a long run does not cover the whole map', () => {
    const g = forestGame();
    setSetting(g.state, 'treeGrowth', true);
    const total = g.state.map.width * g.state.map.height;
    for (let m = 0; m < 120; m++) updateMonthly(g);
    expect(forests(g.state)).toBeLessThan(total / 2);
  });

  test('save/load roundtrip keeps the setting and continues identically', () => {
    const g = forestGame();
    setSetting(g.state, 'treeGrowth', true);
    for (let m = 0; m < 5; m++) updateMonthly(g);
    const g2 = Game.deserialize(g.serialize());
    expect(getSetting(g2.state, 'treeGrowth')).toBe(true);
    for (let m = 0; m < 5; m++) { updateMonthly(g); updateMonthly(g2); }
    expect(g2.serialize()).toBe(g.serialize());
  });
});
