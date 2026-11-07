import { test, expect, describe } from 'bun:test';
import { Game, mapgenOptions } from '../js/simulation/game.js';
import { townLayoutForMode, TOWN_LAYOUT_MODES } from '../js/simulation/towns.js';
import { LAYOUTS } from '../js/simulation/townLayout.js';

describe('mapgen townLayout option', () => {
  test('default (mixed) is not stored and matches the plain generation', () => {
    expect(mapgenOptions({ townLayout: 'mixed' })).toEqual({});
    const a = Game.create({ seed: 1 });
    const b = Game.create({ seed: 1, mapgen: { townLayout: 'mixed' } });
    expect(a.state.mapgen).toBeUndefined();
    expect(b.state.mapgen).toBeUndefined();
    expect(a.state.towns.map((t) => t.layout)).toEqual(b.state.towns.map((t) => t.layout));
  });

  test('each fixed layout makes every generated town use that layout', () => {
    for (const v of ['original', 'better', '2x2', '3x3']) {
      const g = Game.create({ seed: 1, mapgen: { townLayout: v } });
      expect(g.state.mapgen.townLayout).toBe(v);
      expect(g.state.towns.length).toBeGreaterThan(0);
      for (const t of g.state.towns) expect(t.layout).toBe(v);
    }
  });

  test('random picks only real layouts, deterministic per seed and site, without RNG draws', () => {
    const g1 = Game.create({ seed: 7, mapgen: { townLayout: 'random' } });
    const g2 = Game.create({ seed: 7, mapgen: { townLayout: 'random' } });
    const l1 = g1.state.towns.map((t) => t.layout);
    expect(l1).toEqual(g2.state.towns.map((t) => t.layout));
    for (const l of l1) expect(LAYOUTS).toContain(l);
    // the RNG-free hash does not touch generation: map and towns equal the mixed game
    const mixed = Game.create({ seed: 7 });
    expect(g1.state.towns.map((t) => [t.x, t.y, t.name])).toEqual(mixed.state.towns.map((t) => [t.x, t.y, t.name]));
  });

  test('townLayoutForMode: fixed names pass through, unknown modes give the mixed choice', () => {
    for (const m of TOWN_LAYOUT_MODES.slice(1, 5)) expect(townLayoutForMode(m, 1, 3, 4)).toBe(m);
    expect(townLayoutForMode('mixed', 1, 3, 4)).toBe(townLayoutForMode('bogus', 1, 3, 4));
  });

  test('found-town command honours opts.layout', async () => {
    const { foundTown } = await import('../js/simulation/cmdFound.js');
    const g = Game.create({ seed: 1 });
    const ctx = { state: g.state, rng: g.rng };
    // find any legal site by trying a few coordinates
    let res = null;
    for (let x = 10; x < g.state.map.width - 10 && !res?.ok; x += 7) {
      for (let y = 10; y < g.state.map.height - 10 && !res?.ok; y += 7) {
        res = foundTown(ctx, x, y, { layout: '3x3' }, undefined);
        if (res.ok) {
          const t = g.state.towns.find((tt) => tt.id === res.town.id);
          expect(t.layout).toBe('3x3');
        }
      }
    }
    expect(res && res.ok).toBeTruthy();
  });
});
