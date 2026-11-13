/** Road building tool (L, diagonal, curve or circle; C cycles shape; X toggles convert road to tram). */
import { createLineTool } from './lineDrag.js';
import { lTiles, rectTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createRoadTool(app) {
  let convertMode = false;
  const tool = createLineTool(app, {
    id: 'road', label: 'Road', sound: 'build',
    hint: () => convertMode
      ? 'Drag a rectangle to convert road to tram track. Mode: [Convert road to tram] (X toggles).'
      : 'Drag to build road. Crossing rail makes a level crossing. Circle: drag from centre. (X converts to tram).',
    command: (g, x0, y0, x1, y1, opts) => convertMode
      ? g.convertRoad(x0, y0, x1, y1, { ...opts, to: 'tram' })
      : g.buildRoad(x0, y0, x1, y1, opts),
    direct: () => convertMode,
    layer: 'road',
    tiles: (x0, y0, x1, y1) => convertMode ? rectTiles(x0, y0, x1, y1) : lTiles(x0, y0, x1, y1),
  });
  const inner = tool.key;
  tool.key = (e) => {
    if (e.key === 'x' || e.key === 'X') {
      convertMode = !convertMode;
      tool.cancel(); // mode changed mid-drag: drop the stale start/preview so the next release is not a build
      app.ui?.updateHint?.();
      app.toast?.(`Road: ${convertMode ? 'convert road to tram' : 'build road'}`, 'info');
      return true;
    }
    return inner ? inner(e) : false;
  };
  return tool;
}
