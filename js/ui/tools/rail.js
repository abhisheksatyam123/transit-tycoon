/** Rail building tool (drag an L-shaped line). */
import { createLineTool } from './lineDrag.js';
import { lTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createRailTool(app) {
  return createLineTool(app, {
    id: 'rail', label: 'Rail', sound: 'build',
    hint: 'Drag to lay track (x first, then y). Right-drag pans. Esc cancels.',
    command: (g, x0, y0, x1, y1, opts) => g.buildRail(x0, y0, x1, y1, opts),
    tiles: lTiles,
  });
}
