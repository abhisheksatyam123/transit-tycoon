/** Scenario editor generation tools: random towns / industries, removal, editor-only guard. */
import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { randomTown, manyRandomTowns, manyRandomIndustries, removeAllTowns, removeAllIndustries, manyTownCount, manyIndustryCount } from '../js/simulation/editorGen.js';

const editor = (extra = {}) => Game.create({ editor: true, seed: 11, width: 96, height: 96, startYear: 1960, emptyFlat: true, ...extra });

describe('editor generation tools', () => {
  test('many random towns and industries add entries (deterministic per seed)', () => {
    const a = editor(), b = editor();
    const ra = manyRandomTowns(a), rb = manyRandomTowns(b);
    expect(ra.ok).toBe(true);
    expect(a.state.towns.length).toBeGreaterThan(0);
    expect(a.state.towns.length).toBe(b.state.towns.length);
    expect(ra.added).toBe(a.state.towns.length);
    expect(a.state.towns.length).toBeLessThanOrEqual(manyTownCount(a.state));
    expect(rb.ok).toBe(true);
    expect(manyRandomIndustries(a).ok).toBe(true);
    expect(a.state.industries.length).toBeGreaterThan(0);
    expect(a.state.industries.length).toBeLessThanOrEqual(manyIndustryCount(a.state));
  });

  test('random town honours size and sets layout; random size works', () => {
    const g = editor();
    const r = randomTown(g, 'large');
    expect(r.ok).toBe(true);
    expect(g.state.towns.length).toBe(1);
    expect(randomTown(g, 'small').ok).toBe(true);
    expect(randomTown(g, 'random').ok).toBe(true);
    expect(g.state.towns.length).toBe(3);
    expect(randomTown(g, 'huge').ok).toBe(false);
  });

  test('removeAllTowns leaves no towns and no town houses; roads stay', () => {
    const g = editor();
    manyRandomTowns(g);
    const roadsBefore = g.state.map.tiles.filter((t) => t.road).length;
    expect(removeAllTowns(g).ok).toBe(true);
    expect(g.state.towns.length).toBe(0);
    expect(g.state.map.tiles.some((t) => t.building && t.building.type === 'house')).toBe(false);
    expect(g.state.map.tiles.some((t) => t.owner === 'town' && !t.road)).toBe(false); // town-owned roads stay (OpenTTD)
    expect(g.state.map.tiles.filter((t) => t.road).length).toBe(roadsBefore);
  });

  test('removeAllIndustries leaves no industries and no dangling industry tiles', () => {
    const g = editor();
    manyRandomIndustries(g);
    expect(g.state.industries.length).toBeGreaterThan(0);
    expect(removeAllIndustries(g).ok).toBe(true);
    expect(g.state.industries.length).toBe(0);
    expect(g.state.map.tiles.some((t) => t.building && t.building.type === 'industry')).toBe(false);
  });

  test('tools cost no money in the editor and refuse outside it', () => {
    const g = editor();
    const m0 = g.state.company.money;
    manyRandomTowns(g); manyRandomIndustries(g);
    expect(g.state.company.money).toBe(m0);
    const normal = Game.create({ seed: 5, width: 64, height: 64, townCount: 2, industryCount: 2 });
    expect(randomTown(normal).ok).toBe(false);
    expect(manyRandomTowns(normal).ok).toBe(false);
    expect(manyRandomIndustries(normal).ok).toBe(false);
    expect(removeAllTowns(normal).ok).toBe(false);
    expect(removeAllIndustries(normal).ok).toBe(false);
    expect(normal.state.towns.length).toBe(2);
    expect('editor' in normal.state).toBe(false);
  });
});
