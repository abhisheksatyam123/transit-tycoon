/** Truck stop tool (placed on a straight road tile). */
import { createPlacementTool } from './placement.js';

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createTruckStopTool(app) {
  return createPlacementTool(app, {
    id: 'truckStop', label: 'Truck Stop', catchment: 3,
    hint: () => 'Truck stop: click a straight road tile (freight).',
    command: (g, x, y, opts) => g.buildRoadStop(x, y, 'truck', { ...(opts || {}), player: true }),
    footprint: (x, y) => [{ x, y }],
  });
}
