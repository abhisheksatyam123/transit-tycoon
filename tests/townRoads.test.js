import { test, expect, describe } from 'bun:test';
import { Game } from '../js/simulation/game.js';
import { labelComponents } from '../js/simulation/diagIssue.js';
import { checkTownRoads } from '../js/simulation/diagChecksMap.js';
import { flatGame } from './helpers.js';

describe('generated towns are road-connected', () => {
  for (const seed of [1, 7]) {
    const game = Game.create({ seed });
    const s = game.state;

    test(`seed ${seed}: every town reaches its nearest town by road`, () => {
      const issues = checkTownRoads(s).filter((i) => i.id.startsWith('town-unlinked'));
      expect(issues).toEqual([]);
    });

    test(`seed ${seed}: no town core road is split`, () => {
      const issues = checkTownRoads(s).filter((i) => i.id.startsWith('town-roads-split'));
      expect(issues).toEqual([]);
    });

    test(`seed ${seed}: every town centre sits on one road component`, () => {
      const labels = labelComponents(s.map, 'road', () => true);
      for (const t of s.towns) {
        const l = labels[t.y * s.map.width + t.x];
        expect(l).toBeGreaterThanOrEqual(0);
      }
      const comps = new Set(s.towns.map((t) => labels[t.y * s.map.width + t.x]));
      expect(comps.size).toBe(1);
    });
  }
});

describe('rail station end tiles', () => {
  test('a station end has no outward rail bit into empty land', () => {
    const game = flatGame(3);
    expect(game.buildRailStation(10, 24, 'x', 3).ok).toBe(true);
    expect(game.tile(10, 24).rail & 8).toBe(0); // west end
    expect(game.tile(12, 24).rail & 2).toBe(0); // east end
    expect(game.tile(11, 24).rail).toBe(10);    // interior keeps E-W
  });

  test('building rail into a station end links both sides', () => {
    const game = flatGame(3);
    game.buildRailStation(10, 24, 'x', 3);
    game.buildRailStation(40, 24, 'x', 3);
    expect(game.buildRail(13, 24, 39, 24).ok).toBe(true);
    expect(game.tile(12, 24).rail & 2).toBe(2);
    expect(game.tile(13, 24).rail & 8).toBe(8);
  });
});
