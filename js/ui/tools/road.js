/** Road building tool (drag an L-shaped line). */
import { createLineTool } from './lineDrag.js';
import { lTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createRoadTool(app) {
  return createLineTool(app, {
    id: 'road', label: 'Road', sound: 'build',
    hint: 'Drag to build road (x first, then y). Crossing rail makes a level crossing.',
    command: (g, x0, y0, x1, y1, opts) => g.buildRoad(x0, y0, x1, y1, opts),
    tiles: lTiles,
  });
}
