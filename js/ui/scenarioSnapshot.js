/**
 * Prebuilt day-0 Moscow snapshot (W8). The default Moscow game (scenario 'moscow', seed 1, all other
 * options at their defaults) is baked by tools/moscow/snapshot.js into assets/scenarios/moscow-day0.json.
 * Loading it is a fetch + deserialize (~0.1 s) instead of a ~3.6 s scenario build. Any failure falls
 * back to Game.create, so the snapshot is an optimisation only.
 */
import { Game } from '../simulation/game.js';
import { MAP_DEFAULTS } from '../simulation/constants.js';
import { loadMoscowData, loadMoscowDataFor } from '../simulation/scenarios/moscowRegistry.js';

export const SNAPSHOT_PATH = 'assets/scenarios/moscow-day0.json';
export const SNAPSHOT_META_PATH = 'assets/scenarios/moscow-day0.meta.json';
/** The options the snapshot was baked with (must match tools/moscow/snapshot.js). */
export const SNAPSHOT_REQUEST = Object.freeze({ scenario: 'moscow', seed: 1 });

/**
 * True when opts asks for exactly the default Moscow game: no option other than scenario/seed
 * differs from its default (undefined or equal to MAP_DEFAULTS; no objective/settings/maxLoan).
 * @param {any} opts
 */
export function isSnapshotRequest(opts) {
  if (!opts || opts.scenario !== SNAPSHOT_REQUEST.scenario || opts.seed !== SNAPSHOT_REQUEST.seed) return false;
  for (const k of Object.keys(opts)) {
    if (k === 'scenario' || k === 'seed') continue;
    const v = opts[k];
    if (v === undefined) continue;
    if (k in MAP_DEFAULTS && v === MAP_DEFAULTS[k]) continue;
    return false;
  }
  return true;
}

/**
 * Game for the given options: the baked snapshot when the request is the default Moscow game and the
 * snapshot loads, otherwise a freshly built game.
 * @param {any} opts Game.create options
 * @param {any} [GameClass] Game class (default Game; App injects its own)
 * @returns {Promise<any>}
 */
export async function createGameFast(opts, GameClass = Game) {
  if (opts && opts.scenario === 'moscow') await loadMoscowData();
  if (isSnapshotRequest(opts)) {
    try {
      const res = await fetch(SNAPSHOT_PATH, { cache: 'no-cache' });
      if (res.ok) {
        const game = GameClass.deserialize(await res.text());
        if (game.state.scenario === 'moscow') return game;
      }
    } catch (err) {
      console.warn('Moscow snapshot unavailable; building the scenario instead', err);
    }
  }
  return GameClass.create(opts);
}
