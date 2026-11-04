/** Rail station tool: R rotates axis, [ and ] change platform length (1-6). */
import { createPlacementTool } from './placement.js';
import { stationFootprint } from './geometry.js';

const RADIUS = 4;

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createStationTool(app) {
  let axis = /** @type {'x'|'y'} */ ('x');
  let length = 3;
  return createPlacementTool(app, {
    id: 'station', label: 'Rail Station', catchment: RADIUS,
    hint: () => `Rail station: axis ${axis.toUpperCase()}, length ${length}. R rotates, [ ] length.`,
    command: (g, x, y, opts) => g.buildRailStation(x, y, axis, length, opts),
    footprint: (x, y) => stationFootprint(x, y, axis, length),
    key(e) {
      if (e.key === 'r' || e.key === 'R') { axis = axis === 'x' ? 'y' : 'x'; return true; }
      if (e.key === '[') { length = Math.max(1, length - 1); return true; }
      if (e.key === ']') { length = Math.min(6, length + 1); return true; }
      return false;
    },
  });
}
