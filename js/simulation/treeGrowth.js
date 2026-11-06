/**
 * Tree growth and spread (gap #33; OpenTTD tree_cmd.cpp TileLoop_Trees, OpenLoco TreeElement tick).
 * Trees are the 'forest' terrain. Once a month, when the lazy setting `treeGrowth` is on, a fixed
 * number of random map tiles is sampled (never the whole map, so the cost is constant on Moscow). Each
 * forest tile may seed one new tree on a random 4-neighbour that is free grass (no building, track,
 * road, water or other terrain change). A hard cap limits the number of new trees per pass.
 *
 * Off by default (DEFAULT_SETTINGS.treeGrowth = false): with the setting off nothing is drawn from the
 * RNG and nothing is written, so existing games and deterministic hashes are unchanged.
 * Uses only the game's seeded RNG (game.rng), never Math.random or the clock.
 */
import { getSetting } from './settings.js';

/** Tiles sampled per monthly pass. */
export const TREE_SAMPLES = 400;
/** Chance that a sampled forest tile seeds a tree. */
export const TREE_SEED_CHANCE = 0.2;
/** Hard cap of new trees per monthly pass. */
export const TREE_MAX_NEW = 40;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * One monthly tree pass.
 * @param {{state:object, rng:object}} game
 * @returns {number} trees planted in this pass
 */
export function updateMonthly(game) {
  const s = game.state;
  if (!getSetting(s, 'treeGrowth')) return 0;
  const map = s.map, W = map.width, H = map.height, rng = game.rng;
  let planted = 0;
  for (let n = 0; n < TREE_SAMPLES && planted < TREE_MAX_NEW; n++) {
    const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
    const t = map.tiles[y * W + x];
    if (t.terrain !== 'forest') continue;
    if (!rng.chance(TREE_SEED_CHANCE)) continue;
    const [dx, dy] = DIRS[rng.int(0, 3)];
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const u = map.tiles[ny * W + nx];
    if (u.terrain !== 'grass' || u.building || u.rail || u.road) continue;
    u.terrain = 'forest';
    planted++;
  }
  return planted;
}
