/** Rail building tool (L, diagonal, curve or circle; C cycles shape). */
import { createLineTool } from './lineDrag.js';
import { lTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createRailTool(app) {
  return createLineTool(app, {
    id: 'rail', label: 'Rail', sound: 'build',
    hint: 'Drag to lay track. Right-drag pans. Esc cancels. Circle: drag from centre. ; cycles the track type (Rail / Electric / Monorail / Maglev).',
    command: (g, x0, y0, x1, y1, opts) => g.buildRail(x0, y0, x1, y1, opts),
    layer: 'rail',
    tiles: lTiles,
  });
}
