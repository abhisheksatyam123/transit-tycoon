import { test, expect, describe } from 'bun:test';
import { flatGame } from './helpers.js';
import { COSTS } from '../js/config/costs.js';
import { Game } from '../js/simulation/game.js';
import { treeSpeciesCount, FOREST_GROUP } from '../js/simulation/cmdTerraform.js';
import { setArcticClimate } from '../js/renderer/pack/arctic.js';
import { setToylandClimate } from '../js/renderer/pack/toyland.js';

const R = (x0, y0, x1 = x0, y1 = y0) => ({ x0, y0, x1, y1 });
const forestCount = (g) => g.state.map.tiles.filter((t) => t.terrain === 'forest').length;
/** New forest tiles planted by fn(g): the generated map already has forest, so count deltas. */
const planted = (g, fn) => { const n0 = forestCount(g); fn(); return forestCount(g) - n0; };
const tileAt = (g, x, y) => g.state.map.tiles[y * g.state.map.width + x];

describe('tree planting: type and forest modes', () => {
  test('default plant (no options) stores no tree field: tiles stay byte-identical', () => {
    const g = flatGame();
    const r = g.terraform('plant', R(10, 20, 12, 22));
    expect(r.ok).toBe(true);
    for (let y = 20; y <= 22; y++) for (let x = 10; x <= 12; x++) {
      expect(tileAt(g, x, y).terrain).toBe('forest');
      expect('tree' in tileAt(g, x, y)).toBe(false);
    }
  });

  test('a chosen tree type is stored on each planted tile (lazy field)', () => {
    const g = flatGame();
    const r = g.terraform('plant', R(10, 20, 11, 21), { tree: 4 });
    expect(r.ok).toBe(true);
    expect(tileAt(g, 10, 20).tree).toBe(4);
    expect(tileAt(g, 11, 21).tree).toBe(4);
    expect('tree' in tileAt(g, 40, 30)).toBe(false);
  });

  test('an out-of-range or non-integer type is refused', () => {
    const g = flatGame();
    expect(g.terraform('plant', R(10, 20), { tree: 99 }).ok).toBe(false);
    expect(g.terraform('plant', R(10, 20), { tree: 1.5 }).ok).toBe(false);
    expect(tileAt(g, 10, 20).terrain).toBe('grass');
  });

  test('forest small plants several trees around the clicked tile, all inside its radius', () => {
    const g = flatGame();
    const before = g.state.map.tiles.map((t) => t.terrain);
    const r = g.terraform('plant', R(30, 24), { mode: 'forestSmall' });
    expect(r.ok).toBe(true);
    const n = r.tiles;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThanOrEqual(FOREST_GROUP.forestSmall.count * 5); // each attempt seeds itself + up to 4 neighbours
    // every changed tile lies within the forest radius, plus 1 for the seeded neighbour
    for (let i = 0; i < before.length; i++) {
      if (before[i] === g.state.map.tiles[i].terrain) continue;
      const x = i % g.state.map.width, y = Math.floor(i / g.state.map.width);
      expect(Math.hypot(x - 30, y - 24)).toBeLessThanOrEqual(FOREST_GROUP.forestSmall.radius + 1.5);
    }
  });

  test('forest large plants a bigger group than forest small', () => {
    const small = flatGame(), large = flatGame();
    const ns = planted(small, () => small.terraform('plant', R(40, 24), { mode: 'forestSmall' }));
    const nl = planted(large, () => large.terraform('plant', R(40, 24), { mode: 'forestLarge' }));
    expect(nl).toBeGreaterThan(ns);
  });

  test('forest mode is deterministic: same click gives the same trees (estimate == commit)', () => {
    const a = flatGame(3), b = flatGame(3);
    const est = a.estimateTerraform('plant', R(30, 24), { mode: 'forestLarge', tree: 2 });
    const r = a.terraform('plant', R(30, 24), { mode: 'forestLarge', tree: 2 });
    b.terraform('plant', R(30, 24), { mode: 'forestLarge', tree: 2 });
    expect(est.ok).toBe(true);
    expect(est.tiles).toBe(r.tiles);
    expect(est.cost).toBe(r.cost);
    expect(b.serialize()).toBe(a.serialize());
  });

  test('forest modes do not draw from the game RNG', () => {
    const g = flatGame();
    const before = JSON.stringify(g.state.rngState);
    g.terraform('plant', R(30, 24), { mode: 'forestLarge' });
    expect(JSON.stringify(g.state.rngState)).toBe(before);
  });

  test('cost is charged per planted tree through the plant cost path', () => {
    const g = flatGame();
    const money0 = g.state.company.money;
    const r = g.terraform('plant', R(30, 24), { mode: 'forestSmall' });
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(r.tiles * COSTS.plantTree);
    expect(g.state.company.money).toBe(money0 - r.cost);
  });

  test('forest mode on a non-grass click plants nothing and reports it', () => {
    const g = flatGame();
    // rock over the whole forest radius (plus margin): no grass to plant, so the command is refused
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) tileAt(g, 30 + dx, 24 + dy).terrain = 'rock';
    expect(g.terraform('plant', R(30, 24), { mode: 'forestSmall' }).ok).toBe(false);
  });

  test('unknown planting mode is refused', () => {
    const g = flatGame();
    expect(g.terraform('plant', R(30, 24), { mode: 'jungle' }).ok).toBe(false);
  });

  test('tree type choices follow the climate', () => {
    const g = flatGame();
    expect(treeSpeciesCount(g.state)).toBe(9);
    g.state.mapgen = { climate: 'arctic' };
    expect(treeSpeciesCount(g.state)).toBe(8);
    g.state.mapgen = { climate: 'toyland' };
    expect(treeSpeciesCount(g.state)).toBe(9);
    g.state.mapgen = { climate: 'tropic' };
    expect(treeSpeciesCount(g.state)).toBe(4);
    setArcticClimate(false, null);
    setToylandClimate(false, null);
  });

  test('save/load keeps the chosen type and forest planting', () => {
    const g = flatGame();
    g.terraform('plant', R(10, 20, 11, 21), { tree: 6 });
    g.terraform('plant', R(30, 24), { mode: 'forestSmall', tree: 2 });
    const json = g.serialize();
    const g2 = Game.deserialize(json);
    expect(tileAt(g2, 10, 20).tree).toBe(6);
    expect(tileAt(g2, 11, 21).tree).toBe(6);
    expect(forestCount(g2)).toBe(forestCount(g));
    expect(g2.serialize()).toBe(json);
  });

  test('hash unaffected by default: a game with no plant options serializes with no tree key', () => {
    const g = flatGame();
    g.terraform('plant', R(10, 20, 12, 22));
    expect(g.serialize().includes('"tree"')).toBe(false);
  });
});
