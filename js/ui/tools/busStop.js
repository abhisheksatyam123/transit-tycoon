/** Bus stop tool (placed on a straight road tile). */
import { createPlacementTool } from './placement.js';
import { getSetting } from '../../simulation/settings.js';

/** D9: terminal flag only when terminalRoadStops is on; off = exactly today's options. */
export function busStopCommand(g, x, y, opts) {
  return g.buildRoadStop(x, y, 'bus', {
    ...(opts || {}), player: true,
    ...(getSetting(g.state, 'terminalRoadStops') === true ? { terminal: true } : {}),
  });
}

/**
 * @param {import('../app.js').App} app
 * @returns {import('./index.js').Tool}
 */
export function createBusStopTool(app) {
  return createPlacementTool(app, {
    id: 'busStop', label: 'Bus Stop', catchment: 3, joinKind: 'bus',
    hint: () => 'Bus stop: click a straight road tile (passengers). Ctrl+click joins a distant station.',
    command: busStopCommand,
    footprint: (x, y) => [{ x, y }],
  });
}
