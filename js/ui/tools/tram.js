/** Tram track tool: drag like the road tool; lays tram bits on road or free land. */
import { createLineTool } from './lineDrag.js';
import { lTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createTramTool(app) {
  return createLineTool(app, {
    id: 'tram', label: 'Tram track', sound: 'build',
    hint: 'Drag to lay tram track on road or free land. Trams run only on tram track.',
    command: (g, x0, y0, x1, y1, opts) => g.buildTram(x0, y0, x1, y1, opts),
    tiles: lTiles,
  });
}
