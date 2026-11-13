/** Truck stop tool (placed on a straight road tile). */
import { createPlacementTool } from './placement.js';
import { getSetting } from '../../simulation/settings.js';

/** D9: terminal flag only when terminalRoadStops is on; off = exactly today's options. */
export function truckStopCommand(g, x, y, opts) {
  return g.buildRoadStop(x, y, 'truck', {
    ...(opts || {}), player: true,
    ...(getSetting(g.state, 'terminalRoadStops') === true ? { terminal: true } : {}),
  });
}

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createTruckStopTool(app) {
  return createPlacementTool(app, {
    id: 'truckStop', label: 'Truck Stop', catchment: 3, joinKind: 'truck',
    hint: () => 'Truck stop: click a straight road tile (freight). Ctrl+click joins a distant station.',
    command: truckStopCommand,
    footprint: (x, y) => [{ x, y }],
  });
}
