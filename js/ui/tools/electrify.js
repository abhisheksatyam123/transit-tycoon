/**
 * Electrify tool (drag a rectangle over rail): marks rail tiles with catenary (cmdElectrify.js).
 * Toolbar button only (no letter shortcut). Key X toggles the mode to remove catenary instead.
 */
import { createLineTool } from './lineDrag.js';
import { rectTiles } from './geometry.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createElectrifyTool(app) {
  let unelectrify = false;
  const tool = createLineTool(app, {
    id: 'electrify', label: 'Electrify', sound: 'build',
    hint: () => `Drag a rectangle over rail to electrify it (catenary for electric trains). Mode: ${unelectrify ? '[Remove catenary]' : '[Electrify]'} (X toggles).`,
    command: (g, x0, y0, x1, y1, opts) => g.convertRail(x0, y0, x1, y1, { ...opts, unelectrify }),
    tiles: rectTiles,
  });
  const inner = tool.key;
  tool.key = (e) => {
    if (e.key === 'x' || e.key === 'X') {
      unelectrify = !unelectrify;
      tool.cancel(); // mode changed mid-drag: drop the stale start/preview so the next release is not a build
      app.ui?.updateHint?.();
      app.toast?.(`Electrify: ${unelectrify ? 'remove catenary' : 'add catenary'}`, 'info');
      return true;
    }
    return inner ? inner(e) : false;
  };
  return tool;
}
