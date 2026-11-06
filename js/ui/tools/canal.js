/** Canal and lock tools: canal is drag-a-line on flat land; lock is a click on a straight slope (the lock's
 *  direction is found automatically). Both show the dry-run preview like the other tools. */
import { createLineTool } from './lineDrag.js';
import { createPlacementTool } from './placement.js';

/** @param {import('../app.js').App} app */
export function createCanalTool(app) {
  return createLineTool(app, {
    id: 'canal', label: 'Canal', sound: 'build',
    hint: 'Canal: drag a line over flat dry land to dig water. Ships sail canals; demolish turns them back to land.',
    command: (g, x0, y0, x1, y1, opts) => g.buildCanal(x0, y0, x1, y1, opts),
    tiles: (x0, y0, x1, y1) => {
      const out = [];
      const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
      let x = x0; out.push({ x, y: y0 });
      while (x !== x1) { x += sx; out.push({ x, y: y0 }); }
      let y = y0; while (y !== y1) { y += sy; out.push({ x: x1, y }); }
      return out;
    },
  });
}

/** @param {import('../app.js').App} app */
export function createLockTool(app) {
  return createPlacementTool(app, {
    id: 'lock', label: 'Lock',
    hint: () => 'Lock: click the middle of a straight, single-direction slope one level high. Ships climb it.',
    command: (g, x, y, opts) => g.buildLock(x, y, { ...(opts || {}) }),
    footprint: (x, y) => [{ x, y }],
  });
}
