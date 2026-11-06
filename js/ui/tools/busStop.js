/** Bus stop tool (placed on a straight road tile). */
import { createPlacementTool } from './placement.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createBusStopTool(app) {
  return createPlacementTool(app, {
    id: 'busStop', label: 'Bus Stop', catchment: 3, joinKind: 'bus',
    hint: () => 'Bus stop: click a straight road tile (passengers). Ctrl+click joins a distant station.',
    command: (g, x, y, opts) => g.buildRoadStop(x, y, 'bus', { ...(opts || {}), player: true }),
    footprint: (x, y) => [{ x, y }],
  });
}
