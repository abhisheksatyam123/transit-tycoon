/** Demolish tool (drag a rectangle). */
import { createLineTool } from './lineDrag.js';
import { rectTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createDemolishTool(app) {
  return createLineTool(app, {
    id: 'demolish', label: 'Demolish', sound: 'demolish',
    hint: 'Click or drag a rectangle to demolish track, roads, stations, depots and trees.',
    command: (g, x0, y0, x1, y1, opts) => g.demolish(x0, y0, x1, y1, opts),
    tiles: rectTiles,
  });
}
