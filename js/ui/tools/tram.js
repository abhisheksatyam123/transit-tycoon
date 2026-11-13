/** Tram track tool: drag like the road tool; lays tram bits on road or free land (X toggles convert tram to road). */
import { createLineTool } from './lineDrag.js';
import { lTiles, rectTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createTramTool(app) {
  let convertMode = false;
  const tool = createLineTool(app, {
    id: 'tram', label: 'Tram track', sound: 'build',
    hint: () => convertMode
      ? 'Drag a rectangle to convert tram track to road. Mode: [Convert tram to road] (X toggles).'
      : 'Drag to lay tram track on road or free land. Trams run only on tram track. (X converts to road).',
    command: (g, x0, y0, x1, y1, opts) => convertMode
      ? g.convertRoad(x0, y0, x1, y1, { ...opts, to: 'road' })
      : g.buildTram(x0, y0, x1, y1, opts),
    direct: () => convertMode,
    tiles: (x0, y0, x1, y1) => convertMode ? rectTiles(x0, y0, x1, y1) : lTiles(x0, y0, x1, y1),
  });
  const inner = tool.key;
  tool.key = (e) => {
    if (e.key === 'x' || e.key === 'X') {
      convertMode = !convertMode;
      tool.cancel(); // mode changed mid-drag: drop the stale start/preview so the next release is not a build
      app.ui?.updateHint?.();
      app.toast?.(`Tram: ${convertMode ? 'convert tram to road' : 'build tram track'}`, 'info');
      return true;
    }
    return inner ? inner(e) : false;
  };
  return tool;
}
