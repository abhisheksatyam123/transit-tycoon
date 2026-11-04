/**
 * Scenario registry: list of selectable worlds and the builder that prepares each one.
 */
import { MOSCOW } from '../../config/maps/moscow.js';
import { buildMoscow } from './moscow.js';

/** Selectable scenarios (ids are stored in state.scenario). */
export const SCENARIOS = [
  { id: 'random', name: 'Random world', description: 'Procedurally generated world', defaults: {} },
  { id: 'moscow', name: 'Moscow (real map)', description: 'Moscow inside the MKAD ring built from OpenStreetMap data: Moskva river, Kremlin, Garden Ring, TTK, MKAD, radial avenues, metro lines, districts', defaults: {} },
];

/** Scenario ids. */
export const SCENARIO_IDS = SCENARIOS.map((s) => s.id);

/**
 * Apply a named scenario to a game created without procedural generation.
 * @param {string} id 'moscow'
 * @param {object} game Game instance
 * @param {object} [map] override map object (tests); defaults to the baked MOSCOW
 * @returns {object} build report (see buildMoscow)
 */
export function buildScenario(id, game, map = MOSCOW) {
  if (id !== 'moscow') throw new Error(`Unknown scenario ${id}`);
  if (!map) throw new Error('Moscow map not baked yet: run bun tools/moscow/bake.js');
  return buildMoscow(game, map);
}
