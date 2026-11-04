/** Road building tool (L, diagonal, curve or circle; C cycles shape). */
import { createLineTool } from './lineDrag.js';
import { lTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createRoadTool(app) {
  return createLineTool(app, {
    id: 'road', label: 'Road', sound: 'build',
    hint: 'Drag to build road. Crossing rail makes a level crossing. Circle: drag from centre.',
    command: (g, x0, y0, x1, y1, opts) => g.buildRoad(x0, y0, x1, y1, opts),
    layer: 'road',
    tiles: lTiles,
  });
}
